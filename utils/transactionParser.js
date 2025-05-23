const colors = require('./colors');
const { decodeSignature, decodeInstructionData, formatSol } = require('./decoders');
const { formatAccountKeys, displayAccountKeys, displayBalanceChanges, displayProgramLogs } = require('./formatters');
const { MEV_PROGRAM_ID, MAX_COMPUTE_UNITS } = require('./constants');
const { hasTargetSigner } = require('./signerFilter');

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
      const accountsInfo = [];
      
      // Process first 5 accounts
      for (let i = 0; i < Math.min(5, ix.accounts.length); i++) {
        const idx = ix.accounts[i];
        const key = formattedKeys[idx]?.pubkey;
        if (key) {
          accountsInfo.push(`[${idx}] ${key.substring(0, 8)}...`);
        } else {
          accountsInfo.push(`[${idx}]`);
        }
      }
      
      // Add "more" indicator if needed
      if (ix.accounts.length > 5) {
        accountsInfo.push(`+${ix.accounts.length - 5} more`);
      }
      
      console.log(`      Accounts: ${accountsInfo.join(', ')}`);
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
function parseAndLogTransaction(data, transactionCount, options = {}) {
  const { filterMode, targetSigners } = options;
  
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
      formattedKeys = formatAccountKeys(message.accountKeys, message.header);
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
