const fs = require('fs');
const path = require('path');
const colors = require('./utils/colors');
const { loadSavedTransactions } = require('./utils/fileSaver');
const { analyzeTransactionType } = require('./utils/mevAnalyzer');
const { loadSignerAddresses } = require('./utils/signerFilter');

// Analyze transactions for a specific signer
function analyzeSignerActivity(transactions, targetSigner) {
  const signerTransactions = transactions.filter(tx => 
    tx.signers && tx.signers.includes(targetSigner)
  );

  if (signerTransactions.length === 0) {
    return null;
  }

  const analysis = {
    signer: targetSigner,
    totalTransactions: signerTransactions.length,
    successfulTransactions: 0,
    failedTransactions: 0,
    spamTransactions: 0,
    jitoTransactions: 0,
    spamTips: { min: Infinity, max: 0, total: 0, count: 0 },
    jitoTips: { min: Infinity, max: 0, total: 0, count: 0 },
    mints: new Map(),
    pools: new Map(),
    timeRange: {
      first: signerTransactions[0].timestamp,
      last: signerTransactions[signerTransactions.length - 1].timestamp
    }
  };

  signerTransactions.forEach(tx => {
    const txAnalysis = analyzeTransactionType(tx);

    // Count success/failure
    if (txAnalysis.failed) {
      analysis.failedTransactions++;
    } else {
      analysis.successfulTransactions++;
    }

    // Analyze tips
    if (txAnalysis.type === 'spam') {
      analysis.spamTransactions++;
      analysis.spamTips.total += txAnalysis.tipAmount;
      analysis.spamTips.count++;
      analysis.spamTips.min = Math.min(analysis.spamTips.min, txAnalysis.tipAmount);
      analysis.spamTips.max = Math.max(analysis.spamTips.max, txAnalysis.tipAmount);
    } else if (txAnalysis.type === 'jito') {
      analysis.jitoTransactions++;
      analysis.jitoTips.total += txAnalysis.tipAmount;
      analysis.jitoTips.count++;
      analysis.jitoTips.min = Math.min(analysis.jitoTips.min, txAnalysis.tipAmount);
      analysis.jitoTips.max = Math.max(analysis.jitoTips.max, txAnalysis.tipAmount);
    }

    // Track mints
    if (txAnalysis.mint) {
      const mintCount = analysis.mints.get(txAnalysis.mint) || 0;
      analysis.mints.set(txAnalysis.mint, mintCount + 1);
    }

    // Track pools
    txAnalysis.pools.forEach(pool => {
      const poolKey = `${pool.name} (${pool.program})`;
      const poolCount = analysis.pools.get(poolKey) || 0;
      analysis.pools.set(poolKey, poolCount + 1);
    });
  });

  // Calculate averages
  if (analysis.spamTips.count > 0) {
    analysis.spamTips.average = analysis.spamTips.total / analysis.spamTips.count;
  }
  if (analysis.jitoTips.count > 0) {
    analysis.jitoTips.average = analysis.jitoTips.total / analysis.jitoTips.count;
  }

  return analysis;
}

// Display analysis results
function displaySignerAnalysis(analysis) {
  console.log(`\n${colors.bright}${colors.cyan}═══ Signer Analysis ═══${colors.reset}`);
  console.log(`${colors.yellow}Signer:${colors.reset} ${analysis.signer}`);
  console.log(`${colors.yellow}Time Range:${colors.reset} ${new Date(analysis.timeRange.first).toLocaleString()} - ${new Date(analysis.timeRange.last).toLocaleString()}`);
  
  console.log(`\n${colors.bright}Transaction Summary:${colors.reset}`);
  console.log(`  Total: ${analysis.totalTransactions}`);
  console.log(`  ${colors.green}Successful: ${analysis.successfulTransactions}${colors.reset}`);
  console.log(`  ${colors.red}Failed: ${analysis.failedTransactions}${colors.reset}`);
  console.log(`  Success Rate: ${((analysis.successfulTransactions / analysis.totalTransactions) * 100).toFixed(2)}%`);

  console.log(`\n${colors.bright}Transaction Types:${colors.reset}`);
  console.log(`  Spam: ${analysis.spamTransactions} (${((analysis.spamTransactions / analysis.totalTransactions) * 100).toFixed(2)}%)`);
  console.log(`  Jito: ${analysis.jitoTransactions} (${((analysis.jitoTransactions / analysis.totalTransactions) * 100).toFixed(2)}%)`);

  if (analysis.spamTips.count > 0) {
    console.log(`\n${colors.bright}Spam Tips (lamports):${colors.reset}`);
    console.log(`  Min: ${analysis.spamTips.min.toLocaleString()}`);
    console.log(`  Max: ${analysis.spamTips.max.toLocaleString()}`);
    console.log(`  Avg: ${Math.round(analysis.spamTips.average).toLocaleString()}`);
    console.log(`  Total: ${analysis.spamTips.total.toLocaleString()}`);
  }

  if (analysis.jitoTips.count > 0) {
    console.log(`\n${colors.bright}Jito Tips (lamports):${colors.reset}`);
    console.log(`  Min: ${analysis.jitoTips.min.toLocaleString()}`);
    console.log(`  Max: ${analysis.jitoTips.max.toLocaleString()}`);
    console.log(`  Avg: ${Math.round(analysis.jitoTips.average).toLocaleString()}`);
    console.log(`  Total: ${analysis.jitoTips.total.toLocaleString()}`);
  }

  if (analysis.mints.size > 0) {
    console.log(`\n${colors.bright}Top Mints:${colors.reset}`);
    const sortedMints = Array.from(analysis.mints.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    sortedMints.forEach(([mint, count]) => {
      console.log(`  ${mint}: ${count} times`);
    });
  }

  if (analysis.pools.size > 0) {
    console.log(`\n${colors.bright}DEX Usage:${colors.reset}`);
    const sortedPools = Array.from(analysis.pools.entries())
      .sort((a, b) => b[1] - a[1]);
    
    sortedPools.forEach(([pool, count]) => {
      console.log(`  ${pool}: ${count} times`);
    });
  }
}

// Analyze all signers
function analyzeAllSigners(transactions) {
  const signerMap = new Map();

  // Group transactions by signer
  transactions.forEach(tx => {
    if (tx.signers && tx.signers.length > 0) {
      const signer = tx.signers[0];
      if (!signerMap.has(signer)) {
        signerMap.set(signer, []);
      }
      signerMap.get(signer).push(tx);
    }
  });

  console.log(`\n${colors.bright}${colors.green}Analyzing ${signerMap.size} unique signers...${colors.reset}\n`);

  const allAnalyses = [];
  signerMap.forEach((txs, signer) => {
    const analysis = analyzeSignerActivity(txs, signer);
    if (analysis) {
      allAnalyses.push(analysis);
    }
  });

  // Sort by total transactions
  allAnalyses.sort((a, b) => b.totalTransactions - a.totalTransactions);

  // Display summary
  console.log(`${colors.bright}${colors.cyan}═══ All Signers Summary ═══${colors.reset}\n`);
  
  allAnalyses.forEach((analysis, index) => {
    console.log(`${colors.yellow}[${index + 1}] ${analysis.signer}${colors.reset}`);
    console.log(`    Transactions: ${analysis.totalTransactions} (${analysis.successfulTransactions} successful)`);
    
    if (analysis.spamTips.count > 0) {
      console.log(`    Spam: ${analysis.spamTransactions} txs, ${Math.round(analysis.spamTips.average).toLocaleString()} avg tip`);
    }
    
    if (analysis.jitoTips.count > 0) {
      console.log(`    Jito: ${analysis.jitoTransactions} txs, ${Math.round(analysis.jitoTips.average).toLocaleString()} avg tip`);
    }
    
    if (analysis.mints.size > 0) {
      const topMint = Array.from(analysis.mints.entries()).sort((a, b) => b[1] - a[1])[0];
      console.log(`    Top mint: ${topMint[0].substring(0, 8)}... (${topMint[1]} times)`);
    }
    
    console.log('');
  });

  return allAnalyses;
}

// Interactive menu for analysis
async function analyzeMenu() {
  const transactions = loadSavedTransactions();
  
  if (transactions.length === 0) {
    console.log(`${colors.red}No saved transactions found. Please run the bot in save mode first.${colors.reset}`);
    return;
  }

  console.log(`\n${colors.bright}${colors.green}MEV Bot Analyzer${colors.reset}`);
  console.log(`Loaded ${transactions.length} transactions\n`);

  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query) => new Promise((resolve) => readline.question(query, resolve));

  while (true) {
    console.log(`\n${colors.cyan}Choose an option:${colors.reset}`);
    console.log(`1. Analyze specific signer from onchain-sniper-address.json`);
    console.log(`2. Analyze all signers from onchain-sniper-address.json`);
    console.log(`3. Analyze custom signer address`);
    console.log(`4. Exit`);

    const choice = await question(`\nEnter your choice (1-4): `);

    switch (choice) {
      case '1': {
        const signers = loadSignerAddresses();
        if (signers.length === 0) {
          console.log(`${colors.red}No signers found in onchain-sniper-address.json${colors.reset}`);
          break;
        }

        console.log(`\n${colors.cyan}Available signers:${colors.reset}`);
        signers.forEach((signer, index) => {
          console.log(`${index + 1}. ${signer.address} ${signer.active ? colors.green + '(active)' : colors.red + '(inactive)'}${colors.reset}`);
        });

        const signerChoice = await question(`\nSelect signer (1-${signers.length}): `);
        const selectedIndex = parseInt(signerChoice) - 1;

        if (selectedIndex >= 0 && selectedIndex < signers.length) {
          const analysis = analyzeSignerActivity(transactions, signers[selectedIndex].address);
          if (analysis) {
            displaySignerAnalysis(analysis);
          } else {
            console.log(`${colors.red}No transactions found for this signer${colors.reset}`);
          }
        } else {
          console.log(`${colors.red}Invalid selection${colors.reset}`);
        }
        break;
      }

      case '2': {
        const signers = loadSignerAddresses();
        if (signers.length === 0) {
          console.log(`${colors.red}No signers found in onchain-sniper-address.json${colors.reset}`);
          break;
        }

        const activeSigners = signers.filter(s => s.active).map(s => s.address);
        console.log(`\nAnalyzing ${activeSigners.length} active signers...`);

        activeSigners.forEach(signerAddress => {
          const analysis = analyzeSignerActivity(transactions, signerAddress);
          if (analysis) {
            displaySignerAnalysis(analysis);
            console.log(`\n${colors.dim}${'─'.repeat(80)}${colors.reset}`);
          }
        });
        break;
      }

      case '3': {
        const customSigner = await question('\nEnter signer address: ');
        const analysis = analyzeSignerActivity(transactions, customSigner.trim());
        if (analysis) {
          displaySignerAnalysis(analysis);
        } else {
          console.log(`${colors.red}No transactions found for this signer${colors.reset}`);
        }
        break;
      }

      case '4':
        readline.close();
        return;

      default:
        console.log(`${colors.red}Invalid choice${colors.reset}`);
    }

    await question('\nPress Enter to continue...');
  }
}

// Export for use as a module or run directly
if (require.main === module) {
  analyzeMenu().catch(console.error);
}

module.exports = {
  analyzeSignerActivity,
  analyzeAllSigners,
  displaySignerAnalysis
};
