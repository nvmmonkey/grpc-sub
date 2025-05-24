const fs = require('fs');
const colors = require('./utils/colors');
const { decodeSignature, decodePublicKey } = require('./utils/decoders');
const { getAccountName, isKnownProgram } = require('./utils/accountIdentifier');
const { MEV_PROGRAM_ID } = require('./utils/constants');
const { DEX_PROGRAMS } = require('./utils/mevAnalyzer');

/**
 * Decode MEV instruction from saved transaction data
 */
function decodeMevInstruction(transaction) {
  if (!transaction.instructions) {
    console.log(`${colors.red}No instructions found in transaction${colors.reset}`);
    return;
  }
  
  const mevInstruction = transaction.instructions.find(ix => ix.isMevInstruction);
  if (!mevInstruction) {
    console.log(`${colors.red}No MEV instruction found${colors.reset}`);
    return;
  }
  
  console.log(`${colors.bright}${colors.green}MEV Instruction Analysis${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  
  // Decode instruction data
  const dataBuffer = Buffer.from(mevInstruction.dataBase64, 'base64');
  console.log(`\n${colors.yellow}Instruction Data:${colors.reset}`);
  console.log(`  Raw (hex): ${mevInstruction.data}`);
  console.log(`  Raw (base64): ${mevInstruction.dataBase64}`);
  console.log(`  Length: ${dataBuffer.length} bytes`);
  
  // Parse instruction parameters
  console.log(`\n${colors.yellow}Decoded Parameters:${colors.reset}`);
  console.log(`  Discriminator: ${dataBuffer[0]}`);
  console.log(`  Minimum profit: ${dataBuffer.readBigUInt64LE(1)} lamports`);
  console.log(`  Compute unit limit: ${dataBuffer.readUInt32LE(9)}`);
  console.log(`  No failure mode: ${dataBuffer[13]}`);
  console.log(`  Additional fee BP: ${dataBuffer.readUInt16LE(14)}`);
  console.log(`  Use flashloan: ${dataBuffer[16]}`);
  
  // Account analysis
  console.log(`\n${colors.yellow}Account Analysis:${colors.reset}`);
  console.log(`  Total accounts: ${mevInstruction.accountKeys.length}`);
  
  // Fixed accounts (0-6)
  console.log(`\n${colors.cyan}Fixed Accounts:${colors.reset}`);
  const expectedFixed = [
    'Wallet (signer)',
    'Base mint (SOL/USDC)',
    'Fee collector',
    'Wallet base account',
    'Token program',
    'System program',
    'Associated Token program'
  ];
  
  for (let i = 0; i < 7 && i < mevInstruction.accountKeys.length; i++) {
    const account = mevInstruction.accountKeys[i];
    const expected = expectedFixed[i];
    const check = validateFixedAccount(account, i);
    console.log(`  [${i}] ${account.pubkey} - ${account.name} ${check ? '✓' : '✗'} (expected: ${expected})`);
  }
  
  // Flashloan accounts (if enabled)
  const useFlashloan = dataBuffer[16] === 1;
  if (useFlashloan) {
    console.log(`\n${colors.cyan}Flashloan Accounts:${colors.reset}`);
    if (mevInstruction.accountKeys[7]) {
      console.log(`  [7] ${mevInstruction.accountKeys[7].pubkey} - Flashloan program`);
    }
    if (mevInstruction.accountKeys[8]) {
      console.log(`  [8] ${mevInstruction.accountKeys[8].pubkey} - Flashloan vault`);
    }
  }
  
  // Token mint and wallet account
  const tokenStartIdx = useFlashloan ? 9 : 7;
  console.log(`\n${colors.cyan}Token Accounts:${colors.reset}`);
  if (mevInstruction.accountKeys[tokenStartIdx]) {
    console.log(`  Token mint: [${tokenStartIdx}] ${mevInstruction.accountKeys[tokenStartIdx].pubkey} - ${mevInstruction.accountKeys[tokenStartIdx].name}`);
  }
  if (mevInstruction.accountKeys[tokenStartIdx + 1]) {
    console.log(`  Wallet token account: [${tokenStartIdx + 1}] ${mevInstruction.accountKeys[tokenStartIdx + 1].pubkey}`);
  }
  
  // Find DEX programs and pools
  console.log(`\n${colors.cyan}DEX Programs and Pools:${colors.reset}`);
  const poolsFound = [];
  
  for (let i = tokenStartIdx + 2; i < mevInstruction.accountKeys.length; i++) {
    const account = mevInstruction.accountKeys[i];
    
    if (DEX_PROGRAMS[account.pubkey]) {
      const dexName = DEX_PROGRAMS[account.pubkey];
      console.log(`  Found: ${colors.green}${dexName}${colors.reset} at account [${i}]`);
      
      // Try to identify pool based on DEX type
      let poolAccount = null;
      switch (dexName) {
        case 'Raydium v4':
        case 'Raydium CPMM':
        case 'Raydium CLMM':
          if (i + 2 < mevInstruction.accountKeys.length) {
            poolAccount = mevInstruction.accountKeys[i + 2];
            console.log(`    Pool: [${i + 2}] ${poolAccount.pubkey}`);
          }
          break;
          
        case 'Meteora DLMM':
        case 'Meteora Dynamic Pool':
          if (i + 2 < mevInstruction.accountKeys.length) {
            poolAccount = mevInstruction.accountKeys[i + 2];
            console.log(`    Pool: [${i + 2}] ${poolAccount.pubkey}`);
          }
          break;
          
        case 'Orca Whirlpool':
          if (i + 1 < mevInstruction.accountKeys.length) {
            poolAccount = mevInstruction.accountKeys[i + 1];
            console.log(`    Pool: [${i + 1}] ${poolAccount.pubkey}`);
          }
          break;
          
        case 'Pump.fun':
          if (i + 4 < mevInstruction.accountKeys.length) {
            poolAccount = mevInstruction.accountKeys[i + 4];
            console.log(`    Pool: [${i + 4}] ${poolAccount.pubkey}`);
          }
          break;
      }
      
      if (poolAccount) {
        poolsFound.push({
          dex: dexName,
          poolAddress: poolAccount.pubkey
        });
      }
    }
  }
  
  console.log(`\n${colors.cyan}Summary:${colors.reset}`);
  console.log(`  DEX pools found: ${poolsFound.length}`);
  poolsFound.forEach(pool => {
    console.log(`    - ${pool.dex}: ${pool.poolAddress}`);
  });
}

/**
 * Validate fixed account positions
 */
function validateFixedAccount(account, index) {
  switch (index) {
    case 0: // Wallet (should be signer)
      return account.isSigner;
    case 1: // Base mint (SOL or USDC)
      return account.pubkey === 'So11111111111111111111111111111111111111112' || 
             account.pubkey === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    case 2: // Fee collector
      return account.pubkey === '6AGB9kqg5XBBoUc4xC5v7NBTwmZN8xVbvDn5FW9eMX7C';
    case 3: // Wallet base account
      return account.isWritable && !account.isSigner;
    case 4: // Token program
      return account.pubkey === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    case 5: // System program
      return account.pubkey === '11111111111111111111111111111111';
    case 6: // Associated Token program
      return account.pubkey === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
    default:
      return true;
  }
}

// Main execution
if (require.main === module) {
  // Load saved transactions
  const savedFile = './sub-details.json';
  
  if (!fs.existsSync(savedFile)) {
    console.error(`${colors.red}Error: sub-details.json not found. Run the monitor in save mode first.${colors.reset}`);
    process.exit(1);
  }
  
  const transactions = JSON.parse(fs.readFileSync(savedFile, 'utf8'));
  console.log(`${colors.green}Loaded ${transactions.length} transactions${colors.reset}`);
  
  // Analyze a specific transaction or the latest one
  const txIndex = process.argv[2] ? parseInt(process.argv[2]) - 1 : transactions.length - 1;
  
  if (txIndex < 0 || txIndex >= transactions.length) {
    console.error(`${colors.red}Invalid transaction index. Valid range: 1-${transactions.length}${colors.reset}`);
    process.exit(1);
  }
  
  const transaction = transactions[txIndex];
  console.log(`\n${colors.bright}${colors.green}Analyzing Transaction #${transaction.number}${colors.reset}`);
  console.log(`Signature: ${transaction.signature}`);
  console.log(`Slot: ${transaction.slot}`);
  console.log(`Status: ${transaction.status}`);
  
  decodeMevInstruction(transaction);
}

module.exports = {
  decodeMevInstruction
};
