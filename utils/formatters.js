const colors = require('./colors');
const { decodePublicKey, formatSol } = require('./decoders');
const { MEV_PROGRAM_ID } = require('./constants');

/**
 * Format account keys for display
 */
function formatAccountKeys(accountKeys, header) {
  const formattedKeys = [];
  
  accountKeys.forEach((key, index) => {
    const pubkey = decodePublicKey(key);
    
    // Determine account type
    let accountType = [];
    if (header) {
      const isWritable = index < header.numRequiredSignatures - header.numReadonlySignedAccounts ||
                        (index >= header.numRequiredSignatures && 
                         index < accountKeys.length - header.numReadonlyUnsignedAccounts);
      const isSigner = index < header.numRequiredSignatures;
      
      if (isSigner) accountType.push(`${colors.green}signer${colors.reset}`);
      if (isWritable) accountType.push(`${colors.yellow}writable${colors.reset}`);
    }
    
    if (pubkey === MEV_PROGRAM_ID) {
      accountType.push(`${colors.bright}${colors.magenta}◆ MEV PROGRAM ◆${colors.reset}`);
    }
    
    formattedKeys.push({
      index,
      pubkey,
      accountType,
      isMev: pubkey === MEV_PROGRAM_ID
    });
  });
  
  return formattedKeys;
}

/**
 * Display account keys with proper formatting
 */
function displayAccountKeys(formattedKeys) {
  console.log(`\n${colors.bright}${colors.blue}Account Keys (${formattedKeys.length} total):${colors.reset}`);
  
  formattedKeys.forEach(({ index, pubkey, accountType, isMev }) => {
    // Show first 10 accounts in detail or if it's the MEV program
    if (index < 10 || isMev) {
      console.log(`  [${index.toString().padStart(2)}] ${pubkey} ${accountType.length > 0 ? `(${accountType.join(', ')})` : ''}`);
    } else if (index === 10) {
      console.log(`  ... and ${formattedKeys.length - 10} more accounts`);
    }
  });
}

/**
 * Format and display balance changes
 */
function displayBalanceChanges(preBalances, postBalances, accountKeys) {
  const significantChanges = [];
  
  preBalances.forEach((preBalance, index) => {
    const postBalance = postBalances[index];
    const change = postBalance - preBalance;
    
    if (change !== 0 && accountKeys[index]) {
      significantChanges.push({
        pubkey: accountKeys[index].pubkey,
        change,
        isMev: accountKeys[index].isMev
      });
    }
  });
  
  if (significantChanges.length > 0) {
    console.log(`\n${colors.bright}${colors.blue}Balance Changes:${colors.reset}`);
    
    // Sort by absolute change amount
    significantChanges.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    
    // Show top 5 changes
    significantChanges.slice(0, 5).forEach(({ pubkey, change, isMev }) => {
      const changeStr = change > 0 ? `+${formatSol(change)}` : formatSol(change);
      const changeColor = change > 0 ? colors.green : colors.red;
      const prefix = isMev ? `${colors.magenta}◆ MEV${colors.reset} ` : '';
      console.log(`  ${prefix}${pubkey.substring(0, 20)}...  ${changeColor}${changeStr} SOL${colors.reset}`);
    });
    
    if (significantChanges.length > 5) {
      console.log(`  ... and ${significantChanges.length - 5} more balance changes`);
    }
  }
}

/**
 * Format and display program logs
 */
function displayProgramLogs(logMessages) {
  console.log(`\n${colors.bright}${colors.blue}Program Logs:${colors.reset}`);
  
  let mevLogs = [];
  let otherLogs = [];
  
  logMessages.forEach((log) => {
    if (log.includes(MEV_PROGRAM_ID) || log.includes('Program log: MEV')) {
      mevLogs.push(log);
    } else {
      otherLogs.push(log);
    }
  });
  
  // Show MEV logs first
  if (mevLogs.length > 0) {
    console.log(`  ${colors.magenta}◆ MEV Program Logs:${colors.reset}`);
    mevLogs.slice(0, 10).forEach((log, idx) => {
      console.log(`    ${colors.magenta}[${idx}]${colors.reset} ${log}`);
    });
  }
  
  // Show other logs
  if (otherLogs.length > 0) {
    console.log(`  Other Logs (${otherLogs.length} total):`);
    otherLogs.slice(0, 5).forEach((log, idx) => {
      console.log(`    [${idx}] ${log.substring(0, 100)}${log.length > 100 ? '...' : ''}`);
    });
    
    if (otherLogs.length > 5) {
      console.log(`    ... and ${otherLogs.length - 5} more logs`);
    }
  }
}

module.exports = {
  formatAccountKeys,
  displayAccountKeys,
  displayBalanceChanges,
  displayProgramLogs
};
