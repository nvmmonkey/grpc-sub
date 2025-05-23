const fs = require('fs');
const path = require('path');

// Load the latest saved transaction and analyze it
const SAVE_FILE_PATH = path.join(__dirname, 'sub-details.json');

try {
  const data = fs.readFileSync(SAVE_FILE_PATH, 'utf8');
  const transactions = JSON.parse(data);
  
  if (transactions.length === 0) {
    console.log('No saved transactions found');
    process.exit(0);
  }
  
  // Get the latest transaction with MEV instruction
  const mevTx = transactions.reverse().find(tx => tx.mevInstructionCount > 0);
  
  if (!mevTx) {
    console.log('No MEV transactions found');
    process.exit(0);
  }
  
  console.log('=== MEV Transaction Analysis ===');
  console.log(`Transaction #${mevTx.number}`);
  console.log(`Signature: ${mevTx.signature}`);
  console.log(`Total Accounts: ${mevTx.accounts.length}`);
  console.log('');
  
  // Find MEV instruction
  const mevInstruction = mevTx.instructions.find(ix => ix.isMevInstruction);
  
  if (mevInstruction) {
    console.log('MEV Instruction Details:');
    console.log(`- Account Count: ${mevInstruction.accountsCount}`);
    console.log(`- Data: ${mevInstruction.data}`);
    console.log('');
    
    // Analyze account references
    const accountRefs = mevInstruction.accounts;
    const maxStaticIndex = mevTx.accounts.filter(acc => !acc.name.includes('Unknown')).length;
    
    console.log('Account Reference Analysis:');
    console.log(`- Static accounts (in transaction): 0-${maxStaticIndex - 1}`);
    console.log(`- Loaded accounts (from ALTs): ${maxStaticIndex}+`);
    console.log('');
    
    // Count unknown references
    const unknownRefs = accountRefs.filter(idx => idx >= maxStaticIndex);
    console.log(`- Unknown references: ${unknownRefs.length} out of ${accountRefs.length}`);
    console.log(`- Unknown indices: ${unknownRefs.join(', ')}`);
    console.log('');
    
    // Show first few account mappings
    console.log('First 20 Account Mappings:');
    for (let i = 0; i < Math.min(20, mevInstruction.accountKeys.length); i++) {
      const acc = mevInstruction.accountKeys[i];
      const ref = accountRefs[i];
      console.log(`  Position ${i}: [${ref}] -> ${acc.name} (${acc.pubkey})`);
    }
    
    // Look for SWARM token
    const swarmPositions = [];
    mevInstruction.accountKeys.forEach((acc, pos) => {
      if (acc.pubkey === '3d7AzmWfTWJMwAxpoxgZ4uSMmGVaaC6z2f73dP3Mpump') {
        swarmPositions.push(pos);
      }
    });
    
    if (swarmPositions.length > 0) {
      console.log(`\n*** SWARM TOKEN FOUND at positions: ${swarmPositions.join(', ')} ***`);
    }
  }
  
} catch (error) {
  console.error('Error analyzing transactions:', error.message);
}
