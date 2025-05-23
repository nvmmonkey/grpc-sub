const fs = require('fs');
const path = require('path');
const colors = require('./colors');

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
 * 
 * Example saved structure:
 * {
 *   "number": 1,
 *   "timestamp": "2024-01-01T00:00:00.000Z",
 *   "signature": "abc123...",
 *   "slot": 123456,
 *   "status": "success",
 *   "instructions": [{
 *     "programId": "MEViEnscUm6tsQRoGd9h6nLQaQspKj7DB2M5FwM3Xvz",
 *     "data": "0f00000000000000001500000000000000010000",
 *     "accounts": [0, 5, 10],
 *     "accountKeys": [{"index": 0, "pubkey": "..."}]
 *   }],
 *   "balanceChanges": [...],
 *   "logs": [...]
 * }
 */
function extractTransactionDetails(data, transactionCount) {
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
    const formattedKeys = formatAccountKeys(tx.message.accountKeys, tx.message.header);
    
    details.accounts = formattedKeys.map(({ index, pubkey, accountType, isMev }) => ({
      index,
      pubkey,
      isSigner: accountType.some(type => type.includes('signer')),
      isWritable: accountType.some(type => type.includes('writable')),
      isMevProgram: isMev
    }));
    
    // Check for signers
    details.signers = formattedKeys
      .filter(key => key.accountType.some(type => type.includes('signer')))
      .map(key => key.pubkey);
  }
  
  // Process instructions if available
  if (tx && tx.message && tx.message.instructions) {
    const { decodeInstructionData } = require('./decoders');
    
    details.instructions = tx.message.instructions.map((ix, idx) => {
      const programId = details.accounts?.[ix.programIdIndex]?.pubkey || `Unknown`;
      const { hex, length } = decodeInstructionData(ix.data);
      
      return {
        index: idx,
        programId,
        programIdIndex: ix.programIdIndex,
        isMevInstruction: programId === require('./constants').MEV_PROGRAM_ID,
        data: hex,
        dataBase64: typeof ix.data === 'string' ? ix.data : Buffer.from(ix.data).toString('base64'),
        dataLength: length,
        accounts: ix.accounts || [],
        accountsCount: ix.accounts?.length || 0,
        // Add readable account references
        accountKeys: ix.accounts?.map(accIdx => ({
          index: accIdx,
          pubkey: details.accounts?.[accIdx]?.pubkey || 'Unknown'
        })) || []
      };
    });
    
    // Count MEV instructions
    details.mevInstructionCount = details.instructions.filter(ix => ix.isMevInstruction).length;
  }
  
  // Process inner instructions if available
  if (meta && meta.innerInstructions && meta.innerInstructions.length > 0) {
    details.innerInstructions = meta.innerInstructions.map(inner => ({
      index: inner.index,
      instructions: inner.instructions.map(innerIx => {
        const programId = details.accounts?.[innerIx.programIdIndex]?.pubkey || `Unknown`;
        const { hex, length } = require('./decoders').decodeInstructionData(innerIx.data);
        
        return {
          programId,
          programIdIndex: innerIx.programIdIndex,
          data: hex,
          dataLength: length,
          accounts: innerIx.accounts || [],
          accountKeys: innerIx.accounts?.map(accIdx => ({
            index: accIdx,
            pubkey: details.accounts?.[accIdx]?.pubkey || 'Unknown'
          })) || []
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
