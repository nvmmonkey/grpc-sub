// Debug script to analyze mint extraction issue
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { analyzeTransactionType, DEX_PROGRAMS } = require('./utils/mevAnalyzer');

// Known system/program addresses to skip
const SKIP_ADDRESSES = [
  '5LFpzqgsxrSfhKwbaFiAEJ2kbc9QyimjKueswsyU4T3o', // Flashloan program
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token program
  '11111111111111111111111111111111', // System program
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated token program
  'MEViEnscUm6tsQRoGd9h6nLQaQspKj7DB2M5FwM3Xvz', // MEV program
  'ComputeBudget111111111111111111111111111111', // Compute budget program
];

// Load saved transaction data
const filePath = path.join(__dirname, 'sub-details.json');

if (!fs.existsSync(filePath)) {
  console.error('No sub-details.json file found. Run the monitor in save mode first.');
  process.exit(1);
}

const transactions = JSON.parse(fs.readFileSync(filePath, 'utf8'));

console.log(`Loaded ${transactions.length} transactions\n`);

// Analyze first few transactions to understand structure
transactions.slice(0, 5).forEach((tx, txIndex) => {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Transaction #${txIndex + 1} - ${tx.signature}`);
  console.log(`${'='.repeat(80)}`);
  
  // Find MEV instruction
  const mevIx = tx.instructions?.find(ix => ix.isMevInstruction);
  
  if (mevIx && mevIx.accountKeys) {
    console.log(`\nMEV Instruction has ${mevIx.accountKeys.length} accounts:`);
    
    // Check flashloan flag
    const useFlashloan = mevIx.dataBase64 && 
      Buffer.from(mevIx.dataBase64, 'base64')[24] === 1;
    
    console.log(`Flashloan enabled: ${useFlashloan}`);
    console.log('\nAccount list:');
    
    // Display first 20 accounts
    mevIx.accountKeys.slice(0, 20).forEach((acc, idx) => {
      const isDex = DEX_PROGRAMS[acc.pubkey] ? ` [DEX: ${DEX_PROGRAMS[acc.pubkey]}]` : '';
      const isSkip = SKIP_ADDRESSES.includes(acc.pubkey) ? ' [SKIP]' : '';
      const marker = idx === 7 ? ' <-- Position 7' : idx === 9 ? ' <-- Position 9' : '';
      
      console.log(`  [${idx}] ${acc.pubkey}${isDex}${isSkip}${marker}`);
      if (acc.name && acc.name !== acc.pubkey.substring(0, 8) + '...') {
        console.log(`      Name: ${acc.name}`);
      }
    });
    
    if (mevIx.accountKeys.length > 20) {
      console.log(`  ... and ${mevIx.accountKeys.length - 20} more accounts`);
    }
    
    // Run the analyzer
    const analysis = analyzeTransactionType(tx);
    console.log(`\nAnalysis result:`);
    console.log(`  Mint: ${analysis.mint || 'NOT FOUND'}`);
    console.log(`  Mint Name: ${analysis.mintName || 'N/A'}`);
  }
});

// Find pattern
console.log(`\n${'='.repeat(80)}`);
console.log('PATTERN ANALYSIS');
console.log(`${'='.repeat(80)}`);

const mintPositions = new Map();

transactions.forEach(tx => {
  const mevIx = tx.instructions?.find(ix => ix.isMevInstruction);
  if (mevIx && mevIx.accountKeys) {
    const useFlashloan = mevIx.dataBase64 && 
      Buffer.from(mevIx.dataBase64, 'base64')[24] === 1;
    
    // Look for the first non-system account after position 6
    for (let i = 7; i < Math.min(15, mevIx.accountKeys.length); i++) {
      const acc = mevIx.accountKeys[i];
      if (acc && acc.pubkey && 
          !SKIP_ADDRESSES.includes(acc.pubkey) && 
          !DEX_PROGRAMS[acc.pubkey] &&
          acc.pubkey.endsWith('pump')) { // Most pump.fun tokens end with 'pump'
        
        const key = `${useFlashloan ? 'FL' : 'NoFL'}-${i}`;
        mintPositions.set(key, (mintPositions.get(key) || 0) + 1);
        break;
      }
    }
  }
});

console.log('\nMint position frequency:');
Array.from(mintPositions.entries())
  .sort((a, b) => b[1] - a[1])
  .forEach(([pos, count]) => {
    console.log(`  ${pos}: ${count} times`);
  });
