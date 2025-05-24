const fs = require('fs');
const path = require('path');
const colors = require('./utils/colors');

const SAVE_FILE_PATH = path.join(__dirname, 'sub-details.json');

function analyzeMevInstruction() {
  try {
    if (!fs.existsSync(SAVE_FILE_PATH)) {
      console.log(`${colors.red}No saved transactions found${colors.reset}`);
      return;
    }
    
    const data = fs.readFileSync(SAVE_FILE_PATH, 'utf8');
    const transactions = JSON.parse(data);
    
    console.log(`${colors.bright}${colors.green}Analyzing MEV Instructions${colors.reset}\n`);
    
    transactions.forEach((tx) => {
      if (!tx.mevInstructionCount || tx.mevInstructionCount === 0) {
        return;
      }
      
      console.log(`${colors.cyan}Transaction: ${tx.signature.substring(0, 20)}...${colors.reset}`);
      console.log(`Slot: ${tx.slot}`);
      
      // Find MEV instructions
      const mevInstructions = tx.instructions.filter(ix => ix.isMevInstruction);
      
      mevInstructions.forEach(mevIx => {
        console.log(`\n${colors.yellow}MEV Instruction #${mevIx.index}:${colors.reset}`);
        console.log(`Data: ${mevIx.data}`);
        console.log(`Data (base64): ${mevIx.dataBase64}`);
        
        // Decode instruction data
        const dataBuffer = Buffer.from(mevIx.dataBase64, 'base64');
        console.log(`\n${colors.magenta}Decoded instruction data:${colors.reset}`);
        console.log(`  Discriminator: ${dataBuffer[0]}`);
        console.log(`  Minimum profit: ${dataBuffer.readBigUInt64LE(1)} lamports`);
        console.log(`  Compute unit limit: ${dataBuffer.readUInt32LE(9)}`);
        console.log(`  No failure mode: ${dataBuffer[13]}`);
        console.log(`  Additional fee BP: ${dataBuffer.readUInt16LE(14)}`);
        console.log(`  Use flashloan: ${dataBuffer[16]}`);
        
        console.log(`\n${colors.magenta}Account References (${mevIx.accounts.length} total):${colors.reset}`);
        
        // Expected fixed accounts according to docs
        const expectedFixed = [
          { name: "Wallet (signer)", index: 0 },
          { name: "Base mint (SOL/USDC)", index: 1 },
          { name: "Fee collector", index: 2 },
          { name: "Wallet base account", index: 3 },
          { name: "Token program", index: 4 },
          { name: "System program", index: 5 },
          { name: "Associated Token program", index: 6 },
        ];
        
        // Check if flashloan is used
        const useFlashloan = dataBuffer[16] === 1;
        if (useFlashloan) {
          expectedFixed.push({ name: "Flashloan program", index: 7 });
          expectedFixed.push({ name: "Vault token account", index: 8 });
        }
        
        console.log(`\n${colors.cyan}First ${expectedFixed.length} accounts (should be fixed):${colors.reset}`);
        expectedFixed.forEach((expected, i) => {
          if (i < mevIx.accounts.length) {
            const accountIndex = mevIx.accounts[i];
            const account = tx.accounts[accountIndex];
            if (account) {
              const match = checkExpectedAccount(expected.name, account);
              console.log(`  ${i}: [${accountIndex}] ${account.pubkey.substring(0, 8)}... - ${account.name} ${match ? colors.green + '✓' : colors.red + '✗'} (expected: ${expected.name})`);
            } else {
              console.log(`  ${i}: [${accountIndex}] ${colors.red}MISSING ACCOUNT${colors.reset}`);
            }
          }
        });
        
        // Show token mint and pools
        const startIdx = useFlashloan ? 9 : 7;
        if (mevIx.accounts.length > startIdx + 1) {
          console.log(`\n${colors.cyan}Token accounts:${colors.reset}`);
          const tokenMintIdx = mevIx.accounts[startIdx];
          const walletTokenIdx = mevIx.accounts[startIdx + 1];
          
          const tokenMint = tx.accounts[tokenMintIdx];
          const walletToken = tx.accounts[walletTokenIdx];
          
          if (tokenMint) {
            console.log(`  Token mint: [${tokenMintIdx}] ${tokenMint.pubkey} - ${tokenMint.name}`);
          }
          if (walletToken) {
            console.log(`  Wallet token account: [${walletTokenIdx}] ${walletToken.pubkey.substring(0, 8)}...`);
          }
        }
        
        // Check for common DEX programs in the accounts
        console.log(`\n${colors.cyan}DEX Programs found:${colors.reset}`);
        const dexPrograms = {
          'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo': 'Meteora DLMM',
          '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium v4',
          'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'Raydium CLMM',
          'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca Whirlpool',
          '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'Pump.fun',
          'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C': 'Raydium CPMM',
          '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1': 'Raydium CLMM v2',
        };
        
        mevIx.accounts.forEach(accIdx => {
          const account = tx.accounts[accIdx];
          if (account && dexPrograms[account.pubkey]) {
            console.log(`  Found: ${dexPrograms[account.pubkey]} at account [${accIdx}]`);
          }
        });
      });
      
      console.log(`\n${colors.dim}${'─'.repeat(80)}${colors.reset}\n`);
    });
    
  } catch (error) {
    console.error(`${colors.red}Error analyzing MEV instructions:${colors.reset}`, error.message);
  }
}

function checkExpectedAccount(expectedName, account) {
  const expectations = {
    "Wallet (signer)": (acc) => acc.isSigner,
    "Base mint (SOL/USDC)": (acc) => acc.pubkey === 'So11111111111111111111111111111111111111112' || acc.name.includes('SOL'),
    "Fee collector": (acc) => acc.pubkey.includes('Fee') || acc.name.includes('fee'),
    "Token program": (acc) => acc.pubkey === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    "System program": (acc) => acc.pubkey === '11111111111111111111111111111111',
    "Associated Token program": (acc) => acc.pubkey === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    "Flashloan program": (acc) => acc.pubkey === '5LFpzqgsxrSfhKwbaFiAEJ2kbc9QyimjKueswsyU4T3o',
  };
  
  const checkFn = expectations[expectedName];
  return checkFn ? checkFn(account) : false;
}

// Run analysis
analyzeMevInstruction();
