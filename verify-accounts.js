const fs = require('fs');
const path = require('path');
const colors = require('./utils/colors');

const SAVE_FILE_PATH = path.join(__dirname, 'sub-details.json');

function verifyAccounts() {
  try {
    if (!fs.existsSync(SAVE_FILE_PATH)) {
      console.log(`${colors.red}No saved transactions found${colors.reset}`);
      return;
    }
    
    const data = fs.readFileSync(SAVE_FILE_PATH, 'utf8');
    const transactions = JSON.parse(data);
    
    console.log(`${colors.bright}${colors.green}Verifying Account Integrity in Saved Transactions${colors.reset}\n`);
    
    transactions.forEach((tx, txIndex) => {
      console.log(`${colors.cyan}Transaction #${tx.number} (Signature: ${tx.signature.substring(0, 20)}...)${colors.reset}`);
      
      if (!tx.accounts || tx.accounts.length === 0) {
        console.log(`  ${colors.red}✗ No accounts found!${colors.reset}`);
        return;
      }
      
      console.log(`  Total accounts: ${tx.accounts.length}`);
      
      // Check for missing indices
      const missingIndices = [];
      const maxIndex = Math.max(...tx.accounts.map(acc => acc.index));
      
      for (let i = 0; i <= maxIndex; i++) {
        if (!tx.accounts.find(acc => acc.index === i)) {
          missingIndices.push(i);
        }
      }
      
      if (missingIndices.length > 0) {
        console.log(`  ${colors.red}✗ Missing account indices: ${missingIndices.join(', ')}${colors.reset}`);
        
        // Check specifically for index 10
        if (missingIndices.includes(10)) {
          console.log(`  ${colors.bright}${colors.red}✗ CRITICAL: Account at index 10 is missing!${colors.reset}`);
          console.log(`  ${colors.yellow}  This should be CB9dDufT3ZuQXqqSfa1c5kY935TEreyBw9XJXxHKpump (USDUC)${colors.reset}`);
        }
      } else {
        console.log(`  ${colors.green}✓ All account indices are present (0-${maxIndex})${colors.reset}`);
      }
      
      // Check account 10 specifically if it exists
      const account10 = tx.accounts.find(acc => acc.index === 10);
      if (account10) {
        console.log(`  Account 10: ${account10.pubkey}`);
        if (account10.pubkey === 'CB9dDufT3ZuQXqqSfa1c5kY935TEreyBw9XJXxHKpump') {
          console.log(`  ${colors.green}✓ Account 10 is correct (USDUC token)${colors.reset}`);
        }
      }
      
      // Check for duplicate indices
      const indexCounts = {};
      tx.accounts.forEach(acc => {
        indexCounts[acc.index] = (indexCounts[acc.index] || 0) + 1;
      });
      
      const duplicates = Object.entries(indexCounts).filter(([_, count]) => count > 1);
      if (duplicates.length > 0) {
        console.log(`  ${colors.red}✗ Duplicate indices found:${colors.reset}`);
        duplicates.forEach(([index, count]) => {
          console.log(`    Index ${index}: appears ${count} times`);
        });
      }
      
      // Show instructions that reference accounts
      if (tx.instructions) {
        tx.instructions.forEach(ix => {
          if (ix.accounts && ix.accounts.length > 0) {
            const maxAccIndex = Math.max(...ix.accounts);
            if (maxAccIndex >= tx.accounts.length) {
              console.log(`  ${colors.red}✗ Instruction ${ix.index} references account ${maxAccIndex} but only ${tx.accounts.length} accounts exist${colors.reset}`);
            }
          }
        });
      }
      
      console.log('');
    });
    
  } catch (error) {
    console.error(`${colors.red}Error verifying accounts:${colors.reset}`, error.message);
  }
}

// Run verification
verifyAccounts();
