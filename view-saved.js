const fs = require('fs');
const path = require('path');
const colors = require('./utils/colors');

const SAVE_FILE_PATH = path.join(__dirname, 'sub-details.json');

function viewSavedTransactions() {
  try {
    if (!fs.existsSync(SAVE_FILE_PATH)) {
      console.log(`${colors.red}No saved transactions found at ${SAVE_FILE_PATH}${colors.reset}`);
      return;
    }
    
    const data = fs.readFileSync(SAVE_FILE_PATH, 'utf8');
    const transactions = JSON.parse(data);
    
    console.log(`${colors.bright}${colors.green}Saved MEV Transactions (${transactions.length} total)${colors.reset}\n`);
    
    transactions.forEach((tx, index) => {
      console.log(`${colors.cyan}=== Transaction #${tx.number} ===${colors.reset}`);
      console.log(`Timestamp: ${tx.timestamp}`);
      console.log(`Signature: ${tx.signature}`);
      console.log(`Slot: ${tx.slot}`);
      console.log(`Status: ${tx.status === 'success' ? colors.green + '✓ Success' + colors.reset : colors.red + '✗ Failed' + colors.reset}`);
      
      if (tx.mevInstructionCount > 0) {
        console.log(`${colors.yellow}MEV Instructions: ${tx.mevInstructionCount}${colors.reset}`);
        
        // Show MEV instruction details
        tx.instructions.filter(ix => ix.isMevInstruction).forEach(mevIx => {
          console.log(`\n  ${colors.magenta}MEV Instruction #${mevIx.index}:${colors.reset}`);
          console.log(`  Data: ${mevIx.data.substring(0, 42)}...`);
          console.log(`  Accounts (${mevIx.accountsCount}):`);
          
          // Show first 10 accounts with names
          const displayLimit = Math.min(10, mevIx.accountKeys.length);
          for (let i = 0; i < displayLimit; i++) {
            const acc = mevIx.accountKeys[i];
            const flags = [];
            if (acc.isSigner) flags.push('Signer');
            if (acc.isWritable) flags.push('Writable');
            const flagStr = flags.length > 0 ? ` (${flags.join(', ')})` : '';
            
            if (acc.name && acc.name !== acc.pubkey.substring(0, 8) + '...') {
              console.log(`    #${i + 1} ${colors.yellow}${acc.name}${colors.reset} - ${acc.pubkey}${flagStr}`);
            } else {
              console.log(`    #${i + 1} ${acc.pubkey}${flagStr}`);
            }
            
            // Highlight SWARM token if found
            if (acc.pubkey === '3d7AzmWfTWJMwAxpoxgZ4uSMmGVaaC6z2f73dP3Mpump') {
              console.log(`      ${colors.bright}${colors.magenta}↑ SWARM TOKEN DETECTED${colors.reset}`);
            }
          }
          
          if (mevIx.accountKeys.length > displayLimit) {
            console.log(`    ... and ${mevIx.accountKeys.length - displayLimit} more accounts`);
          }
        });
      }
      
      // Show balance changes
      if (tx.balanceChanges && tx.balanceChanges.length > 0) {
        console.log(`\n  Balance Changes:`);
        tx.balanceChanges.forEach(change => {
          const changeStr = change.type === 'receive' ? 
            `${colors.green}+${change.changeSol}${colors.reset}` : 
            `${colors.red}-${change.changeSol}${colors.reset}`;
          console.log(`    ${change.account.substring(0, 8)}... ${changeStr} SOL`);
        });
      }
      
      console.log(`\n${colors.dim}${'─'.repeat(80)}${colors.reset}\n`);
    });
    
  } catch (error) {
    console.error(`${colors.red}Error reading saved transactions:${colors.reset}`, error.message);
  }
}

// Run the viewer
viewSavedTransactions();
