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

// Correct DEX program mappings
const DEX_PROGRAMS = {
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo': 'Meteora DLMM',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium v4',
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'Raydium CLMM',
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca Whirlpool',
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA': 'Pump.fun',
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C': 'Raydium CPMM',
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1': 'Raydium CLMM v2',
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter v6',
  'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY': 'Phoenix',
  'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX': 'Serum DEX',
};

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
    pools: [],
    computeUnits: transaction.computeUnitsConsumed || 0,
    slot: transaction.slot,
    signature: transaction.signature
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
        result.mintName = mevInstruction.accountKeys[tokenMintPos].name;
      }

      // Extract DEX pools
      mevInstruction.accountKeys.forEach(account => {
        if (DEX_PROGRAMS[account.pubkey]) {
          result.pools.push({
            program: account.pubkey,
            name: DEX_PROGRAMS[account.pubkey]
          });
        }
      });
    }
  }

  return result;
}

// Initialize signer tracking data
function initializeSignerData(address) {
  return {
    address,
    startTime: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
    transactions: {
      total: 0,
      successful: 0,
      failed: 0
    },
    transactionTypes: {
      spam: 0,
      jito: 0,
      unknown: 0
    },
    tips: {
      spam: {
        min: Infinity,
        max: 0,
        total: 0,
        average: 0,
        samples: []
      },
      jito: {
        min: Infinity,
        max: 0,
        total: 0,
        average: 0,
        samples: []
      }
    },
    mints: {},
    pools: {},
    computeUnits: {
      min: Infinity,
      max: 0,
      total: 0,
      average: 0
    },
    recentTransactions: [] // Keep last 10 transactions
  };
}

// Update signer data with new transaction
function updateSignerData(signerData, analysis) {
  signerData.lastUpdate = new Date().toISOString();
  signerData.transactions.total++;
  
  if (analysis.failed) {
    signerData.transactions.failed++;
  } else {
    signerData.transactions.successful++;
  }
  
  // Update transaction type counts
  if (analysis.type === 'spam' || analysis.type === 'jito') {
    signerData.transactionTypes[analysis.type]++;
  } else {
    signerData.transactionTypes.unknown++;
  }
  
  // Update tips
  if (analysis.type === 'spam' && analysis.tipAmount > 0) {
    const tipData = signerData.tips.spam;
    tipData.min = Math.min(tipData.min, analysis.tipAmount);
    tipData.max = Math.max(tipData.max, analysis.tipAmount);
    tipData.total += analysis.tipAmount;
    tipData.samples.push(analysis.tipAmount);
    if (tipData.samples.length > 100) tipData.samples.shift(); // Keep last 100 samples
    tipData.average = tipData.total / signerData.transactionTypes.spam;
  } else if (analysis.type === 'jito' && analysis.tipAmount > 0) {
    const tipData = signerData.tips.jito;
    tipData.min = Math.min(tipData.min, analysis.tipAmount);
    tipData.max = Math.max(tipData.max, analysis.tipAmount);
    tipData.total += analysis.tipAmount;
    tipData.samples.push(analysis.tipAmount);
    if (tipData.samples.length > 100) tipData.samples.shift(); // Keep last 100 samples
    tipData.average = tipData.total / signerData.transactionTypes.jito;
  }
  
  // Update mints
  if (analysis.mint) {
    if (!signerData.mints[analysis.mint]) {
      signerData.mints[analysis.mint] = {
        address: analysis.mint,
        name: analysis.mintName,
        count: 0,
        successful: 0,
        failed: 0
      };
    }
    signerData.mints[analysis.mint].count++;
    if (analysis.failed) {
      signerData.mints[analysis.mint].failed++;
    } else {
      signerData.mints[analysis.mint].successful++;
    }
  }
  
  // Update pools
  analysis.pools.forEach(pool => {
    const poolKey = pool.name;
    if (!signerData.pools[poolKey]) {
      signerData.pools[poolKey] = {
        program: pool.program,
        name: pool.name,
        count: 0
      };
    }
    signerData.pools[poolKey].count++;
  });
  
  // Update compute units
  if (analysis.computeUnits > 0) {
    signerData.computeUnits.min = Math.min(signerData.computeUnits.min, analysis.computeUnits);
    signerData.computeUnits.max = Math.max(signerData.computeUnits.max, analysis.computeUnits);
    signerData.computeUnits.total += analysis.computeUnits;
    signerData.computeUnits.average = signerData.computeUnits.total / signerData.transactions.total;
  }
  
  // Add to recent transactions
  signerData.recentTransactions.unshift({
    signature: analysis.signature,
    slot: analysis.slot,
    timestamp: new Date().toISOString(),
    type: analysis.type,
    tipAmount: analysis.tipAmount,
    failed: analysis.failed,
    mint: analysis.mint,
    pools: analysis.pools.map(p => p.name)
  });
  
  // Keep only last 10 transactions
  if (signerData.recentTransactions.length > 10) {
    signerData.recentTransactions = signerData.recentTransactions.slice(0, 10);
  }
  
  // Fix Infinity values for JSON serialization
  if (signerData.tips.spam.min === Infinity) signerData.tips.spam.min = 0;
  if (signerData.tips.jito.min === Infinity) signerData.tips.jito.min = 0;
  if (signerData.computeUnits.min === Infinity) signerData.computeUnits.min = 0;
  
  return signerData;
}

module.exports = {
  JITO_TIP_ADDRESSES,
  DEX_PROGRAMS,
  isJitoTipAddress,
  analyzeTransactionType,
  initializeSignerData,
  updateSignerData
};
