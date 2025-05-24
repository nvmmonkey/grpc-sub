// Jito tip addresses
const JITO_TIP_ADDRESSES = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT'
];

// Check if an address is a Jito tip address
function isJitoTipAddress(address) {
  return JITO_TIP_ADDRESSES.includes(address);
}

// Analyze transaction type and extract tip information
function analyzeTransactionType(transaction) {
  const result = {
    type: 'unknown',
    tipAmount: 0,
    failed: false,
    mint: null,
    pools: []
  };

  // Check if transaction failed
  if (transaction.logs && transaction.logs.some(log => log.includes('No profitable arbitrage opportunity found'))) {
    result.failed = true;
  }

  // Analyze balance changes
  if (transaction.balanceChanges && transaction.balanceChanges.length > 0) {
    const signer = transaction.signers?.[0];
    
    if (transaction.balanceChanges.length === 1) {
      // Spam transaction
      result.type = 'spam';
      result.tipAmount = Math.abs(transaction.balanceChanges[0].change);
    } else {
      // Check for Jito tip
      const jitoTransfer = transaction.balanceChanges.find(change => 
        change.type === 'receive' && isJitoTipAddress(change.account)
      );
      
      if (jitoTransfer) {
        result.type = 'jito';
        result.tipAmount = jitoTransfer.change;
        
        // Check if it's direct or separate account transfer
        const signerChange = transaction.balanceChanges.find(change => 
          change.account === signer && change.type === 'send'
        );
        
        if (signerChange && Math.abs(signerChange.change) > jitoTransfer.change + 5000) {
          result.transferType = 'separate_account';
        } else {
          result.transferType = 'direct';
        }
      }
    }
  }

  // Extract mint information from MEV instruction
  if (transaction.instructions) {
    const mevInstruction = transaction.instructions.find(ix => ix.isMevInstruction);
    if (mevInstruction && mevInstruction.accountKeys) {
      // Token mint is typically at position 9 (after fixed accounts + flashloan if enabled)
      const useFlashloan = mevInstruction.dataBase64 && 
        Buffer.from(mevInstruction.dataBase64, 'base64')[16] === 1;
      const tokenMintPos = useFlashloan ? 9 : 7;
      
      if (mevInstruction.accountKeys[tokenMintPos]) {
        result.mint = mevInstruction.accountKeys[tokenMintPos].pubkey;
      }

      // Extract DEX pools
      const dexPrograms = {
        'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo': 'Meteora DLMM',
        '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium v4',
        'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'Raydium CLMM',
        'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca Whirlpool',
        '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'Pump.fun',
        'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C': 'Raydium CPMM',
        '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1': 'Raydium CLMM v2',
      };

      mevInstruction.accountKeys.forEach(account => {
        if (dexPrograms[account.pubkey]) {
          result.pools.push({
            program: account.pubkey,
            name: dexPrograms[account.pubkey]
          });
        }
      });
    }
  }

  return result;
}

module.exports = {
  JITO_TIP_ADDRESSES,
  isJitoTipAddress,
  analyzeTransactionType
};
