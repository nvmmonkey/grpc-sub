const fs = require('fs');
const path = require('path');
const colors = require('./utils/colors');
const { loadSavedTransactions } = require('./utils/fileSaver');
const { analyzeTransactionType } = require('./utils/mevAnalyzer');

/**
 * Generate a comprehensive report of all signers' activities
 */
function generateSignerReport() {
  const transactions = loadSavedTransactions();
  
  if (transactions.length === 0) {
    console.log(`${colors.red}No saved transactions found.${colors.reset}`);
    return;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalTransactions: transactions.length,
    timeRange: {
      start: transactions[0].timestamp,
      end: transactions[transactions.length - 1].timestamp
    },
    signers: {},
    summary: {
      totalSigners: 0,
      totalSpamTransactions: 0,
      totalJitoTransactions: 0,
      totalSpamTips: 0,
      totalJitoTips: 0,
      topMints: new Map(),
      topPools: new Map()
    }
  };

  // Group by signer
  transactions.forEach(tx => {
    if (!tx.signers || tx.signers.length === 0) return;
    
    const signer = tx.signers[0];
    if (!report.signers[signer]) {
      report.signers[signer] = {
        address: signer,
        transactions: [],
        stats: {
          total: 0,
          successful: 0,
          failed: 0,
          spam: 0,
          jito: 0,
          spamTips: { min: Infinity, max: 0, total: 0, avg: 0 },
          jitoTips: { min: Infinity, max: 0, total: 0, avg: 0 },
          mints: {},
          pools: {},
          firstSeen: tx.timestamp,
          lastSeen: tx.timestamp
        }
      };
    }
    
    const signerData = report.signers[signer];
    const analysis = analyzeTransactionType(tx);
    
    // Update stats
    signerData.stats.total++;
    signerData.stats.lastSeen = tx.timestamp;
    
    if (analysis.failed) {
      signerData.stats.failed++;
    } else {
      signerData.stats.successful++;
    }
    
    // Process transaction type
    if (analysis.type === 'spam') {
      signerData.stats.spam++;
      signerData.stats.spamTips.total += analysis.tipAmount;
      signerData.stats.spamTips.min = Math.min(signerData.stats.spamTips.min, analysis.tipAmount);
      signerData.stats.spamTips.max = Math.max(signerData.stats.spamTips.max, analysis.tipAmount);
      
      report.summary.totalSpamTransactions++;
      report.summary.totalSpamTips += analysis.tipAmount;
    } else if (analysis.type === 'jito') {
      signerData.stats.jito++;
      signerData.stats.jitoTips.total += analysis.tipAmount;
      signerData.stats.jitoTips.min = Math.min(signerData.stats.jitoTips.min, analysis.tipAmount);
      signerData.stats.jitoTips.max = Math.max(signerData.stats.jitoTips.max, analysis.tipAmount);
      
      report.summary.totalJitoTransactions++;
      report.summary.totalJitoTips += analysis.tipAmount;
    }
    
    // Track mints
    if (analysis.mint) {
      signerData.stats.mints[analysis.mint] = (signerData.stats.mints[analysis.mint] || 0) + 1;
      report.summary.topMints.set(analysis.mint, (report.summary.topMints.get(analysis.mint) || 0) + 1);
    }
    
    // Track pools
    analysis.pools.forEach(pool => {
      const poolKey = pool.name;
      signerData.stats.pools[poolKey] = (signerData.stats.pools[poolKey] || 0) + 1;
      report.summary.topPools.set(poolKey, (report.summary.topPools.get(poolKey) || 0) + 1);
    });
    
    // Add transaction summary
    signerData.transactions.push({
      signature: tx.signature,
      timestamp: tx.timestamp,
      slot: tx.slot,
      status: analysis.failed ? 'failed' : 'success',
      type: analysis.type,
      tipAmount: analysis.tipAmount,
      mint: analysis.mint,
      pools: analysis.pools.map(p => p.name)
    });
  });

  // Calculate averages and finalize
  Object.values(report.signers).forEach(signer => {
    if (signer.stats.spam > 0) {
      signer.stats.spamTips.avg = signer.stats.spamTips.total / signer.stats.spam;
    }
    if (signer.stats.jito > 0) {
      signer.stats.jitoTips.avg = signer.stats.jitoTips.total / signer.stats.jito;
    }
    
    // Fix Infinity values
    if (signer.stats.spamTips.min === Infinity) signer.stats.spamTips.min = 0;
    if (signer.stats.jitoTips.min === Infinity) signer.stats.jitoTips.min = 0;
  });

  report.summary.totalSigners = Object.keys(report.signers).length;
  
  // Convert Maps to arrays for JSON
  report.summary.topMints = Array.from(report.summary.topMints.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([mint, count]) => ({ mint, count }));
    
  report.summary.topPools = Array.from(report.summary.topPools.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([pool, count]) => ({ pool, count }));

  // Save report
  const reportPath = path.join(__dirname, 'signer-analysis-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`${colors.green}Report generated successfully!${colors.reset}`);
  console.log(`${colors.yellow}Saved to:${colors.reset} ${reportPath}`);
  console.log(`\n${colors.cyan}Summary:${colors.reset}`);
  console.log(`  Total signers: ${report.summary.totalSigners}`);
  console.log(`  Total transactions: ${report.totalTransactions}`);
  console.log(`  Spam transactions: ${report.summary.totalSpamTransactions}`);
  console.log(`  Jito transactions: ${report.summary.totalJitoTransactions}`);
  console.log(`  Total spam tips: ${report.summary.totalSpamTips.toLocaleString()} lamports`);
  console.log(`  Total Jito tips: ${report.summary.totalJitoTips.toLocaleString()} lamports`);
  
  // Also generate a CSV for easy analysis
  generateCsvReport(report);
}

/**
 * Generate CSV report for spreadsheet analysis
 */
function generateCsvReport(report) {
  const csvPath = path.join(__dirname, 'signer-analysis-report.csv');
  
  let csv = 'Signer Address,Total Txs,Successful,Failed,Success Rate,Spam Txs,Jito Txs,Avg Spam Tip,Avg Jito Tip,Total Tips,First Seen,Last Seen,Top Mint,Top Pool\n';
  
  Object.values(report.signers).forEach(signer => {
    const successRate = ((signer.stats.successful / signer.stats.total) * 100).toFixed(2);
    const totalTips = signer.stats.spamTips.total + signer.stats.jitoTips.total;
    
    // Find top mint and pool
    const topMint = Object.entries(signer.stats.mints)
      .sort((a, b) => b[1] - a[1])[0];
    const topPool = Object.entries(signer.stats.pools)
      .sort((a, b) => b[1] - a[1])[0];
    
    csv += `${signer.address},${signer.stats.total},${signer.stats.successful},${signer.stats.failed},${successRate}%,`;
    csv += `${signer.stats.spam},${signer.stats.jito},`;
    csv += `${Math.round(signer.stats.spamTips.avg)},${Math.round(signer.stats.jitoTips.avg)},${totalTips},`;
    csv += `"${new Date(signer.stats.firstSeen).toLocaleString()}","${new Date(signer.stats.lastSeen).toLocaleString()}",`;
    csv += `"${topMint ? topMint[0] : 'N/A'}","${topPool ? topPool[0] : 'N/A'}"\n`;
  });
  
  fs.writeFileSync(csvPath, csv);
  console.log(`${colors.yellow}CSV report saved to:${colors.reset} ${csvPath}`);
}

// Run if called directly
if (require.main === module) {
  generateSignerReport();
}

module.exports = {
  generateSignerReport
};
