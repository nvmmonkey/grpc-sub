const colors = require('./colors');
const { decodeSignature, decodeInstructionData, formatSol, decodePublicKey } = require('./decoders');
const { formatAccountKeys, displayAccountKeys, displayBalanceChanges, displayProgramLogs } = require('./formatters');
const { MEV_PROGRAM_ID, MAX_COMPUTE_UNITS } = require('./constants');
const { hasTargetSigner } = require('./signerFilter');
const { getAccountName, formatAccountDisplay } = require('./accountIdentifier');
const { resolveLoadedAddresses, resolveAccountsWithLookupTables } = require('./lookupTableResolver');
const { Connection } = require('@solana/web3.js');

// RPC connection variables
let rpcConnection = null;
let altResolutionEnabled = false;
let rpcInitialized = false;

/**
 * Initialize RPC connection for ALT resolution
 */
async function initializeRpcConnection() {
  if (rpcInitialized) return rpcConnection;
  
  rpcInitialized = true;
  
  // Check if ALT resolution is disabled
  if (process.env.ALT_RESOLUTION === 'false') {
    console.log(`${colors.dim}ℹ ALT resolution disabled by configuration${colors.reset}`);
    return null;
  }
  
  if (process.env.RPC_URL) {
    try {
      rpcConnection = new Connection(process.env.RPC_URL, 'confirmed');
      // Test the connection with a simple call
      await rpcConnection.getSlot();
      altResolutionEnabled = true;
      console.log(`${colors.green}✓ RPC connection established for ALT resolution${colors.reset}`);
    } catch (error) {
      console.log(`${colors.yellow}⚠ RPC connection failed - ALT resolution disabled${colors.reset}`);
      console.log(`${colors.dim}  ${error.message}${colors.reset}`);
      rpcConnection = null;
    }
  } else {
    console.log(`${colors.dim}ℹ No RPC_URL configured - ALT resolution disabled${colors.reset}`);
  }
  
  return rpcConnection;
}

/**
 * Process and display instruction details
 */
function displayInstructions(instructions, accountKeys, formattedKeys) {
  console.log(`\n${colors.bright}${colors.blue}Instructions (${instructions.length} total):${colors.reset}`);
  
  instructions.forEach((ix, index) => {
    const programId = formattedKeys[ix.programIdIndex]?.pubkey || `Unknown (index: ${ix.programIdIndex})`;
    const isMevInstruction = programId === MEV_PROGRAM_ID;
    
    if (isMevInstruction) {
      console.log(`  ${colors.bright}${colors.magenta}[${index}] ◆ MEV Program Instruction ◆${colors.reset}`);
    } else {
      console.log(`  [${index}] Program: ${programId}`);
    }
    
    // Decode instruction data
    if (ix.data) {
      const { hex, length } = decodeInstructionData(ix.data);
      const displayData = hex.length > 64 ? hex.substring(0, 64) + '...' : hex;
      console.log(`      Data: ${displayData} (${length} bytes)`);
    }
    
    // Show accounts used
    if (ix.accounts && ix.accounts.length > 0) {
      // Convert accounts to array if it's a Buffer
      let accountIndices = [];
      if (Buffer.isBuffer(ix.accounts)) {
        accountIndices = Array.from(ix.accounts);
      } else if (ix.accounts.type === 'Buffer' && ix.accounts.data) {
        accountIndices = ix.accounts.data;
      } else if (Array.isArray(ix.accounts)) {
        accountIndices = ix.accounts;
      }
      
      const accountsInfo = [];
      
      // For MEV instructions, show more accounts
      const displayLimit = isMevInstruction ? 10 : 5;
      
      // Process accounts
      for (let i = 0; i < Math.min(displayLimit, accountIndices.length); i++) {
        const idx = accountIndices[i];
        const key = formattedKeys[idx]?.pubkey;
        if (key) {
          accountsInfo.push(`[${idx}] ${key.substring(0, 8)}...`);
        } else {
          accountsInfo.push(`[${idx}]`);
        }
      }
      
      // Add "more" indicator if needed
      if (accountIndices.length > displayLimit) {
        accountsInfo.push(`+${accountIndices.length - displayLimit} more`);
      }
      
      console.log(`      Accounts (${accountIndices.length} total): ${accountsInfo.join(', ')}`);
      
      // For MEV instructions, show detailed account list
      if (isMevInstruction && accountIndices.length > 0) {
        console.log(`      ${colors.cyan}Account Details:${colors.reset}`);
        
        // Show first 15 accounts for MEV instructions with names
        const mevDisplayLimit = Math.min(15, accountIndices.length);
        for (let i = 0; i < mevDisplayLimit; i++) {
          const idx = accountIndices[i];
          const accountKey = formattedKeys[idx];
          if (accountKey) {
            const name = getAccountName(accountKey.pubkey);
            const flags = [];
            if (accountKey.accountType.includes('writable')) flags.push('W');
            if (accountKey.accountType.includes('signer')) flags.push('S');
            const flagStr = flags.length > 0 ? ` [${flags.join(',')}]` : '';
            
            // Check for SWARM token
            const isSwarm = accountKey.pubkey === '3d7AzmWfTWJMwAxpoxgZ4uSMmGVaaC6z2f73dP3Mpump';
            
            if (isSwarm) {
              console.log(`        #${i + 1} [${idx}] ${colors.bright}${colors.magenta}★ SWARM TOKEN ★${colors.reset} - ${accountKey.pubkey}${flagStr}`);
            } else if (name !== accountKey.pubkey.substring(0, 8) + '...') {
              // Known account
              console.log(`        #${i + 1} [${idx}] ${colors.yellow}${name}${colors.reset} - ${accountKey.pubkey}${flagStr}`);
            } else {
              // Unknown account
              console.log(`        #${i + 1} [${idx}] ${accountKey.pubkey}${flagStr}`);
            }
          }
        }
        
        if (accountIndices.length > mevDisplayLimit) {
          console.log(`        ... and ${accountIndices.length - mevDisplayLimit} more accounts`);
        }
      }
    }
  });
}

/**
 * Process and display inner instructions
 */
function displayInnerInstructions(innerInstructions, formattedKeys) {
  console.log(`\n${colors.bright}${colors.blue}Inner Instructions:${colors.reset}`);
  innerInstructions.forEach((inner) => {
    console.log(`  From instruction [${inner.index}]:`);
    inner.instructions.forEach((innerIx, idx) => {
      const programId = formattedKeys[innerIx.programIdIndex]?.pubkey || `Unknown`;
      console.log(`    [${idx}] ${programId.substring(0, 44)}...`);
    });
  });
}

/**
 * Process and display transaction metadata
 */
function displayTransactionMeta(meta, formattedKeys) {
  // Transaction status
  const status = meta.err || meta.errorInfo ? `${colors.red}✗ Failed${colors.reset}` : `${colors.green}✓ Success${colors.reset}`;
  console.log(`\n${colors.bright}${colors.blue}Transaction Result:${colors.reset}`);
  console.log(`  Status: ${status}`);
  
  if (meta.err || meta.errorInfo) {
    console.log(`  ${colors.red}Error:${colors.reset} ${JSON.stringify(meta.err || meta.errorInfo)}`);
  }
  
  // Fees and compute
  if (meta.fee) {
    console.log(`  Fee: ${colors.yellow}◎ ${formatSol(meta.fee)}${colors.reset} SOL`);
  }
  
  if (meta.computeUnitsConsumed) {
    const percentage = ((meta.computeUnitsConsumed / MAX_COMPUTE_UNITS) * 100).toFixed(1);
    console.log(`  Compute Units: ${colors.cyan}${meta.computeUnitsConsumed.toLocaleString()}${colors.reset} (${percentage}% of max)`);
  }
  
  // Balance changes
  if (meta.preBalances && meta.postBalances && formattedKeys.length > 0) {
    displayBalanceChanges(meta.preBalances, meta.postBalances, formattedKeys);
  }
  
  // Token balance changes
  if (meta.postTokenBalances && meta.postTokenBalances.length > 0) {
    console.log(`\n${colors.bright}${colors.blue}Token Transfers:${colors.reset} ${meta.postTokenBalances.length} token balance(s) affected`);
  }
  
  // Log messages
  if (meta.logMessages && meta.logMessages.length > 0) {
    displayProgramLogs(meta.logMessages);
  }
}

/**
 * Main transaction parser and logger
 */
async function parseAndLogTransaction(data, transactionCount, options = {}) {
  const { filterMode, targetSigners } = options;
  
  // Initialize RPC connection if not already done
  if (!rpcInitialized && process.env.RPC_URL) {
    await initializeRpcConnection();
  }
  
  // Extract transaction data
  const txData = data.transaction;
  const slot = txData.slot;
  const txInfo = txData.transaction;
  
  // Decode signature
  const signature = decodeSignature(txInfo.signature);
  
  // Process transaction content
  const tx = txInfo.transaction;
  const meta = txInfo.meta;
  
  // Early check for signer filter if in filtered mode
  if (filterMode === 'filtered' && tx && tx.message && tx.message.accountKeys) {
    // For filtering, we don't need ALT resolution since signers are always in static accounts
    const formattedKeys = formatAccountKeys(tx.message.accountKeys, tx.message.header);
    const signerCheck = hasTargetSigner(formattedKeys, tx.message.header, targetSigners);
    
    if (!signerCheck.found) {
      // Skip this transaction as it doesn't have our target signers
      return false;
    }
    
    // Display header with signer info
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.bright}${colors.green}[MEV Transaction #${transactionCount}]${colors.reset} ${colors.bright}${colors.magenta}◆ TARGET SIGNER DETECTED ◆${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.yellow}Target Signer:${colors.reset} ${colors.bright}${colors.magenta}${signerCheck.signerAddress}${colors.reset} (index: ${signerCheck.signerIndex})`);
  } else {
    // Display normal header
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.bright}${colors.green}[MEV Transaction #${transactionCount}]${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  }
  
  console.log(`${colors.yellow}Signature:${colors.reset} ${signature}`);
  console.log(`${colors.yellow}Slot:${colors.reset} ${slot}`);
  console.log(`${colors.yellow}Index:${colors.reset} ${txInfo.index}`);
  console.log(`${colors.yellow}Time:${colors.reset} ${new Date().toISOString()}`);
  
  // Continue processing with already declared tx and meta variables
  if (tx && tx.message) {
    const message = tx.message;
    
    // Process account keys
    let formattedKeys = [];
    if (message.accountKeys) {
      // Try to resolve loaded addresses from ALTs
      let loadedAddresses = meta?.loadedAddresses;
      
      // Only try RPC resolution if:
      // 1. No loaded addresses in metadata (gRPC didn't provide them)
      // 2. ALT resolution is enabled
      // 3. We have a working RPC connection
      // 4. The transaction actually uses ALTs (has addressTableLookups)
      const hasALTs = tx?.message?.addressTableLookups && tx.message.addressTableLookups.length > 0;
      
      if (!loadedAddresses && altResolutionEnabled && rpcConnection && hasALTs) {
        try {
          loadedAddresses = await resolveLoadedAddresses(tx, meta, rpcConnection);
          if (loadedAddresses) {
            const total = (loadedAddresses.writable?.length || 0) + (loadedAddresses.readonly?.length || 0);
            if (process.env.DEBUG === 'true') {
              console.log(`${colors.dim}[ALT] Resolved ${total} addresses from RPC${colors.reset}`);
            }
          }
        } catch (error) {
          if (process.env.DEBUG === 'true') {
            console.warn(`${colors.yellow}Warning: Could not resolve ALTs: ${error.message}${colors.reset}`);
          }
        }
      }
      
      // Format account keys with loaded addresses
      formattedKeys = formatAccountKeys(message.accountKeys, message.header, loadedAddresses);
      
      // Log ALT usage if any
      if (loadedAddresses) {
        const writableCount = loadedAddresses.writable?.length || 0;
        const readonlyCount = loadedAddresses.readonly?.length || 0;
        if (writableCount > 0 || readonlyCount > 0) {
          console.log(`\n${colors.cyan}Address Lookup Tables: ${writableCount} writable, ${readonlyCount} readonly addresses loaded${colors.reset}`);
        }
      }
      
      displayAccountKeys(formattedKeys);
    }
    
    // Process instructions
    if (message.instructions && message.instructions.length > 0) {
      displayInstructions(message.instructions, message.accountKeys, formattedKeys);
    }
    
    // Process inner instructions
    if (meta && meta.innerInstructions && meta.innerInstructions.length > 0) {
      displayInnerInstructions(meta.innerInstructions, formattedKeys);
    }
    
    // Process metadata
    if (meta) {
      displayTransactionMeta(meta, formattedKeys);
    }
  }
  
  console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
  return true; // Transaction was logged
}

module.exports = {
  parseAndLogTransaction
};
