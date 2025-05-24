const fs = require('fs');
const path = require('path');
const colors = require('./colors');
const { analyzeTransactionType, initializeSignerData, updateSignerData } = require('./mevAnalyzer');

// Directory for signer analysis files
const ANALYSIS_DIR = path.join(__dirname, '..', 'signer-analysis');

// Ensure analysis directory exists
if (!fs.existsSync(ANALYSIS_DIR)) {
  fs.mkdirSync(ANALYSIS_DIR, { recursive: true });
}

// Active signer trackers
const signerTrackers = new Map();

/**
 * Initialize tracking for a signer
 */
function startTrackingSigner(signerAddress) {
  if (!signerTrackers.has(signerAddress)) {
    signerTrackers.set(signerAddress, initializeSignerData(signerAddress));
    console.log(`${colors.cyan}Started tracking signer: ${signerAddress}${colors.reset}`);
  }
}

/**
 * Process transaction for signer analysis
 */
function processTransactionForAnalysis(transaction, targetSigners = null) {
  if (!transaction.signers || transaction.signers.length === 0) return;
  
  const signer = transaction.signers[0];
  
  // Check if we should track this signer
  if (targetSigners && !targetSigners.includes(signer)) {
    return;
  }
  
  // Initialize tracker if needed
  if (!signerTrackers.has(signer)) {
    startTrackingSigner(signer);
  }
  
  // Analyze transaction
  const analysis = analyzeTransactionType(transaction);
  
  // Update signer data
  const signerData = signerTrackers.get(signer);
  updateSignerData(signerData, analysis);
  
  // Save to file
  saveSignerAnalysis(signer, signerData);
  
  // Display real-time update
  displayRealtimeUpdate(signer, analysis, signerData);
}

/**
 * Save signer analysis to file
 */
function saveSignerAnalysis(signerAddress, signerData) {
  const filename = `${signerAddress}.json`;
  const filepath = path.join(ANALYSIS_DIR, filename);
  
  try {
    fs.writeFileSync(filepath, JSON.stringify(signerData, null, 2));
  } catch (error) {
    console.error(`${colors.red}Error saving analysis for ${signerAddress}:${colors.reset}`, error.message);
  }
}

/**
 * Display real-time update with pool addresses
 */
function displayRealtimeUpdate(signer, analysis, signerData) {
  const timestamp = new Date().toLocaleTimeString();
  
  // Build status line
  let statusLine = `[${timestamp}] ${colors.yellow}${signer.substring(0, 8)}...${colors.reset} `;
  
  if (analysis.failed) {
    statusLine += `${colors.red}FAILED${colors.reset} `;
  } else {
    statusLine += `${colors.green}SUCCESS${colors.reset} `;
  }
  
  if (analysis.type === 'spam') {
    statusLine += `${colors.blue}SPAM${colors.reset} ${analysis.tipAmount} lamports `;
  } else if (analysis.type === 'jito') {
    statusLine += `${colors.magenta}JITO${colors.reset} ${analysis.tipAmount} lamports `;
  }
  
  if (analysis.mint) {
    statusLine += `${colors.cyan}${analysis.mintName || analysis.mint.substring(0, 8)}...${colors.reset} `;
  }
  
  // Add pools with addresses
  if (analysis.poolContracts && analysis.poolContracts.length > 0) {
    const poolInfo = analysis.poolContracts
      .filter(p => p.poolAddress)
      .map(p => `${p.dexName}: ${p.poolAddress.substring(0, 8)}...`)
      .join(', ');
    statusLine += `[${poolInfo}] `;
  } else if (analysis.pools.length > 0) {
    // Fallback to old format if no pool contracts
    const poolNames = analysis.pools.map(p => p.name).join(', ');
    statusLine += `[${poolNames}] `;
  }
  
  console.log(statusLine);
  
  // Display periodic summary every 10 transactions
  if (signerData.transactions.total % 10 === 0) {
    displaySignerSummary(signer, signerData);
  }
}

/**
 * Display signer summary with pool contract details
 */
function displaySignerSummary(signer, data) {
  console.log(`\n${colors.bright}${colors.cyan}══ Summary for ${signer.substring(0, 16)}... ══${colors.reset}`);
  console.log(`  Total: ${data.transactions.total} (${data.transactions.successful} success, ${data.transactions.failed} failed)`);
  console.log(`  Types: ${data.transactionTypes.spam} spam, ${data.transactionTypes.jito} jito`);
  
  if (data.transactionTypes.spam > 0) {
    console.log(`  Spam tips: ${data.tips.spam.min}-${data.tips.spam.max} (avg: ${Math.round(data.tips.spam.average)})`);
  }
  
  if (data.transactionTypes.jito > 0) {
    console.log(`  Jito tips: ${data.tips.jito.min}-${data.tips.jito.max} (avg: ${Math.round(data.tips.jito.average)})`);
  }
  
  // Top mints
  const topMints = Object.values(data.mints)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  
  if (topMints.length > 0) {
    console.log(`  Top mints:`);
    topMints.forEach(mint => {
      console.log(`    - ${mint.name || mint.address.substring(0, 8)}... (${mint.count} times)`);
    });
  }
  
  // Top pool contracts
  if (data.poolContracts && Object.keys(data.poolContracts).length > 0) {
    const topPools = Object.values(data.poolContracts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    
    console.log(`  Top pool contracts:`);
    topPools.forEach(pool => {
      console.log(`    - ${pool.dexName} ${pool.address.substring(0, 8)}... (${pool.count} times)`);
    });
  }
  
  console.log('');
}

/**
 * Get current analysis stats
 */
function getAnalysisStats() {
  const stats = {
    trackingSigners: signerTrackers.size,
    totalTransactions: 0,
    signers: []
  };
  
  signerTrackers.forEach((data, signer) => {
    stats.totalTransactions += data.transactions.total;
    stats.signers.push({
      address: signer,
      transactions: data.transactions.total,
      successRate: data.transactions.total > 0 
        ? ((data.transactions.successful / data.transactions.total) * 100).toFixed(1)
        : 0
    });
  });
  
  return stats;
}

/**
 * Display all signers summary with pool details
 */
function displayAllSignersSummary() {
  console.log(`\n${colors.bright}${colors.green}═══ All Signers Summary ═══${colors.reset}`);
  console.log(`Tracking ${signerTrackers.size} signers\n`);
  
  const signerArray = Array.from(signerTrackers.entries())
    .sort((a, b) => b[1].transactions.total - a[1].transactions.total);
  
  signerArray.forEach(([signer, data]) => {
    console.log(`${colors.yellow}${signer}${colors.reset}`);
    console.log(`  Transactions: ${data.transactions.total} (${data.transactions.successful} successful)`);
    console.log(`  Success rate: ${((data.transactions.successful / data.transactions.total) * 100).toFixed(1)}%`);
    
    if (data.transactionTypes.spam > 0) {
      console.log(`  Spam: ${data.transactionTypes.spam} txs, avg tip: ${Math.round(data.tips.spam.average)} lamports`);
    }
    
    if (data.transactionTypes.jito > 0) {
      console.log(`  Jito: ${data.transactionTypes.jito} txs, avg tip: ${Math.round(data.tips.jito.average)} lamports`);
    }
    
    // Top mint
    const topMint = Object.values(data.mints)
      .sort((a, b) => b.count - a.count)[0];
    
    if (topMint) {
      console.log(`  Top mint: ${topMint.name || topMint.address.substring(0, 8)}... (${topMint.count} times)`);
    }
    
    // Top pool contract
    if (data.poolContracts && Object.keys(data.poolContracts).length > 0) {
      const topPool = Object.values(data.poolContracts)
        .sort((a, b) => b.count - a.count)[0];
      
      if (topPool) {
        console.log(`  Top pool: ${topPool.dexName} ${topPool.address.substring(0, 8)}... (${topPool.count} times)`);
      }
    }
    
    console.log('');
  });
  
  // Save combined report
  saveCombinedReport();
}

/**
 * Save combined report of all signers with pool details
 */
function saveCombinedReport() {
  const report = {
    generatedAt: new Date().toISOString(),
    signerCount: signerTrackers.size,
    signers: {}
  };
  
  signerTrackers.forEach((data, signer) => {
    report.signers[signer] = data;
  });
  
  const reportPath = path.join(ANALYSIS_DIR, 'combined-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`${colors.green}Combined report saved to: ${reportPath}${colors.reset}`);
}

module.exports = {
  processTransactionForAnalysis,
  startTrackingSigner,
  getAnalysisStats,
  displayAllSignersSummary,
  ANALYSIS_DIR
};
