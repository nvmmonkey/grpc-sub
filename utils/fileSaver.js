const fs = require('fs');
const path = require('path');
const colors = require('./colors');
const { getAccountName, isKnownProgram, isKnownToken } = require('./accountIdentifier');
const { resolveLoadedAddresses } = require('./lookupTableResolver');
const { Connection } = require('@solana/web3.js');

// Initialize RPC connection for ALT resolution if available
let rpcConnection = null;
let altResolutionEnabled = false;

if (process.env.RPC_URL) {
  try {
    rpcConnection = new Connection(process.env.RPC_URL, 'confirmed');
    altResolutionEnabled = true;
  } catch (error) {
    // Silent fail - will be logged in transactionParser
    rpcConnection = null;
  }
}

const MAX_SAVED_TRANSACTIONS = 100;
const SAVE_FILE_PATH = path.join(__dirname, '..', 'sub-details.json');

/**
 * Load existing saved transactions
 */
function loadSavedTransactions() {
  try {
    if (fs.existsSync(SAVE_FILE_PATH)) {
      const data = fs.readFileSync(SAVE_FILE_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`${colors.yellow}Warning: Could not load existing saved transactions${colors.reset}`);
  }
  return [];
}

/**
 * Save transaction details to file
 */
function saveTransactionDetails(transactionData) {
  try {
    // Load existing transactions
    let savedTransactions = loadSavedTransactions();
    
    // Add new transaction
    savedTransactions.push(transactionData);
    
    // Keep only the most recent MAX_SAVED_TRANSACTIONS
    if (savedTransactions.length > MAX_SAVED_TRANSACTIONS) {
      savedTransactions = savedTransactions.slice(-MAX_SAVED_TRANSACTIONS);
    }
    
    // Save to file
    fs.writeFileSync(SAVE_FILE_PATH, JSON.stringify(savedTransactions, null, 2));
    
    return savedTransactions.length;
  } catch (error) {
    console.error(`${colors.red}Error saving transaction:${colors.reset}`, error.message);
    return -1;
  }
}

/**
 * Extract transaction details for saving
 */
async function extractTransactionDetails(data, transactionCount) {
  const txData = data.transaction;
  const slot = txData.slot;
  const txInfo = txData.transaction;
  const tx = txInfo.transaction;
  const meta = txInfo.meta;
  
  // Basic info
  const details = {
    number: transactionCount,
    timestamp: new Date().toISOString(),
    slot: slot,
    index: txInfo.index,
    signature: txInfo.signature ? require('./decoders').decodeSignature(txInfo.signature) : 'N/A',
    status: meta && (meta.err || meta.errorInfo) ? 'failed' : 'success',
    error: meta && (meta.err || meta.errorInfo) ? (meta.err || meta.errorInfo) : null,
    fee: meta?.fee || 0,
    computeUnitsConsumed: meta?.computeUnitsConsumed || 0
  };
  
  // Process accounts if available
  if (tx && tx.message && tx.message.accountKeys) {
    const { formatAccountKeys } = require('./formatters');
    
    // Debug logging for account keys
    if (process.env.DEBUG === 'true') {
      console.log(`${colors.dim}[DEBUG] Raw account keys count: ${tx.message.accountKeys.length}${colors.reset}`);
      
      // Check account 10 specifically
      if (tx.message.accountKeys[10]) {
        console.log(`${colors.dim}[DEBUG] Raw account key at index 10:${colors.reset}`, tx.message.accountKeys[10]);
      }
    }
    
    // Try to resolve loaded addresses from ALTs
    let loadedAddresses = meta?.loadedAddresses;
    
    // Only use RPC if gRPC didn't provide loaded addresses AND transaction uses ALTs
    const hasALTs = tx?.message?.addressTableLookups && tx.message.addressTableLookups.length > 0;
    
    if (!loadedAddresses && altResolutionEnabled && rpcConnection && hasALTs) {
      try {
        loadedAddresses = await resolveLoadedAddresses(tx, meta, rpcConnection);
      } catch (error) {
        // Silent fail for saving
      }
    }
    
    // Format all accounts including those from ALTs
    const allAccounts = formatAccountKeys(tx.message.accountKeys, tx.message.header, loadedAddresses);
    
    // Debug logging
    if (process.env.DEBUG === 'true') {
      console.log(`${colors.dim}[DEBUG] Formatted accounts count: ${allAccounts.length}${colors.reset}`);
      
      // Check if we have account 10
      const account10 = allAccounts.find(acc => acc.index === 10);
      if (account10) {
        console.log(`${colors.dim}[DEBUG] Account 10 after formatting: ${account10.pubkey}${colors.reset}`);
      } else {
        console.log(`${colors.dim}[DEBUG] Account 10 is missing after formatting!${colors.reset}`);
      }
    }
    
    details.accounts = allAccounts.map(({ index, pubkey, accountType, isMev }) => {
      const isSigner = accountType.some(type => type.includes('signer'));
      const isWritable = accountType.some(type => type.includes('writable'));
      
      return {
        index,
        pubkey,
        name: getAccountName(pubkey),
        isSigner,
        isWritable,
        isMevProgram: isMev,
        isKnownProgram: isKnownProgram(pubkey),
        isKnownToken: isKnownToken(pubkey),
        accountType: accountType
      };
    });
    
    // Verify we have all accounts
    if (process.env.DEBUG === 'true') {
      console.log(`${colors.dim}[DEBUG] Final accounts array length: ${details.accounts.length}${colors.reset}`);
      
      // Check for gaps in indices
      for (let i = 0; i < details.accounts.length; i++) {
        if (!details.accounts.find(acc => acc.index === i)) {
          console.log(`${colors.yellow}[DEBUG] Missing account at index ${i}!${colors.reset}`);
        }
      }
    }
    
    // Check for signers
    details.signers = allAccounts
      .filter(key => key.accountType.some(type => type.includes('signer')))
      .map(key => key.pubkey);
  }
  
  // Process instructions if available
  if (tx && tx.message && tx.message.instructions) {
    const { decodeInstructionData } = require('./decoders');
    
    details.instructions = tx.message.instructions.map((ix, idx) => {
      const programId = details.accounts?.[ix.programIdIndex]?.pubkey || `Unknown`;
      const { hex, length } = decodeInstructionData(ix.data);
      
      // Properly handle accounts array - convert Buffer to array if needed
      let accountIndices = [];
      if (ix.accounts) {
        if (Buffer.isBuffer(ix.accounts)) {
          accountIndices = Array.from(ix.accounts);
        } else if (ix.accounts.type === 'Buffer' && ix.accounts.data) {
          accountIndices = ix.accounts.data;
        } else if (Array.isArray(ix.accounts)) {
          accountIndices = ix.accounts;
        }
      }
      
      return {
        index: idx,
        programId,
        programIdIndex: ix.programIdIndex,
        isMevInstruction: programId === require('./constants').MEV_PROGRAM_ID,
        data: hex,
        dataBase64: typeof ix.data === 'string' ? ix.data : Buffer.from(ix.data).toString('base64'),
        dataLength: length,
        accounts: accountIndices,
        accountsCount: accountIndices.length,
        // Add readable account references with proper names
        accountKeys: accountIndices.map((accIdx, i) => {
          const account = details.accounts?.[accIdx];
          return {
            index: accIdx,
            position: i,
            pubkey: account?.pubkey || 'Unknown',
            name: account?.name || getAccountName(account?.pubkey || 'Unknown'),
            isSigner: account?.isSigner || false,
            isWritable: account?.isWritable || false,
            isKnownProgram: account?.isKnownProgram || false,
            isKnownToken: account?.isKnownToken || false
          };
        })
      };
    });
    
    // Count MEV instructions
    details.mevInstructionCount = details.instructions.filter(ix => ix.isMevInstruction).length;
  }
  
  // Process inner instructions if available
  if (meta && meta.innerInstructions && meta.innerInstructions.length > 0) {
    details.innerInstructions = meta.innerInstructions.map(inner => ({
      index: inner.index,
      instructions: inner.instructions.map((innerIx, innerIdx) => {
        const programId = details.accounts?.[innerIx.programIdIndex]?.pubkey || `Unknown`;
        const { hex, length } = require('./decoders').decodeInstructionData(innerIx.data);
        
        // Properly handle accounts array for inner instructions
        let accountIndices = [];
        if (innerIx.accounts) {
          if (Buffer.isBuffer(innerIx.accounts)) {
            accountIndices = Array.from(innerIx.accounts);
          } else if (innerIx.accounts.type === 'Buffer' && innerIx.accounts.data) {
            accountIndices = innerIx.accounts.data;
          } else if (Array.isArray(innerIx.accounts)) {
            accountIndices = innerIx.accounts;
          }
        }
        
        return {
          index: innerIdx,
          programId,
          programIdIndex: innerIx.programIdIndex,
          data: hex,
          dataLength: length,
          accounts: accountIndices,
          accountKeys: accountIndices.map((accIdx, i) => {
            const account = details.accounts?.[accIdx];
            return {
              index: accIdx,
              position: i,
              pubkey: account?.pubkey || 'Unknown',
              name: account?.name || getAccountName(account?.pubkey || 'Unknown'),
              isSigner: account?.isSigner || false,
              isWritable: account?.isWritable || false,
              isKnownProgram: account?.isKnownProgram || false,
              isKnownToken: account?.isKnownToken || false
            };
          })
        };
      })
    }));
  }
  
  // Balance changes
  if (meta && meta.preBalances && meta.postBalances && details.accounts) {
    const changes = [];
    meta.preBalances.forEach((preBalance, index) => {
      const postBalance = meta.postBalances[index];
      const change = postBalance - preBalance;
      if (change !== 0 && details.accounts[index]) {
        changes.push({
          account: details.accounts[index].pubkey,
          change: change,
          changeSol: require('./decoders').formatSol(Math.abs(change)),
          type: change > 0 ? 'receive' : 'send'
        });
      }
    });
    details.balanceChanges = changes;
  }
  
  // Token transfers
  details.hasTokenTransfers = meta?.postTokenBalances && meta.postTokenBalances.length > 0;
  details.tokenTransferCount = meta?.postTokenBalances?.length || 0;
  
  // Logs summary and details
  if (meta?.logMessages) {
    details.logCount = meta.logMessages.length;
    details.hasMevLogs = meta.logMessages.some(log => 
      log.includes(require('./constants').MEV_PROGRAM_ID) || 
      log.includes('Program log: MEV')
    );
    
    // Include actual logs (limit to prevent huge files)
    details.logs = meta.logMessages.slice(0, 50); // First 50 logs
    if (meta.logMessages.length > 50) {
      details.logs.push(`... and ${meta.logMessages.length - 50} more logs`);
    }
    
    // Separate MEV logs
    details.mevLogs = meta.logMessages.filter(log => 
      log.includes(require('./constants').MEV_PROGRAM_ID) || 
      log.includes('Program log: MEV')
    );
  }
  
  return details;
}

/**
 * Display save progress
 */
function displaySaveProgress(savedCount, totalCount) {
  if (savedCount % 10 === 0 || savedCount === MAX_SAVED_TRANSACTIONS) {
    console.log(`\n${colors.cyan}[Save Progress] Saved ${savedCount}/${MAX_SAVED_TRANSACTIONS} transactions to sub-details.json${colors.reset}`);
    if (savedCount === MAX_SAVED_TRANSACTIONS) {
      console.log(`${colors.yellow}[Info] Maximum save limit reached. Oldest transactions will be replaced.${colors.reset}\n`);
    }
  }
}

module.exports = {
  saveTransactionDetails,
  extractTransactionDetails,
  displaySaveProgress,
  loadSavedTransactions,
  MAX_SAVED_TRANSACTIONS,
  SAVE_FILE_PATH
};
