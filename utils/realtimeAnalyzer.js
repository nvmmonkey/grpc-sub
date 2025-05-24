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
 * Load existing signer data from file if it exists
 */
function loadSignerData(signerAddress) {
  const filename = `${signerAddress}.json`;
  const filepath = path.join(ANALYSIS_DIR, filename);
  
  try {
    if (fs.existsSync(filepath)) {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      
      // Convert arrays back to Sets for poolContracts mints
      if (data.poolContracts) {
        Object.values(data.poolContracts).forEach(pool => {
          if (Array.isArray(pool.mints)) {
            pool.mints = new Set(pool.mints);
          }
        });
      }
      
      return data;
    }
  } catch (error) {
    console.error(`${colors.yellow}Warning: Could not load existing data for ${signerAddress}${colors.reset}`);
  }
  
  return null;
}

/**
 * Initialize tracking for a signer
 */
function startTrackingSigner(signerAddress) {
  if (!signerTrackers.has(signerAddress)) {
    // Try to load existing data first
    const existingData = loadSignerData(signerAddress);
    
    if (existingData) {
      signerTrackers.set(signerAddress, existingData);
      console.log(`${colors.cyan}Loaded existing data for signer: ${signerAddress}${colors.reset}`);
    } else {
      signerTrackers.set(signerAddress, initializeSignerData(signerAddress));
      console.log(`${colors.cyan}Started tracking signer: ${signerAddress}${colors.reset}`);
    }
  }
}

/**
 * Process transaction for signer analysis
 */
function processTransactionForAnalysis(transaction, targetSigners = null, displayMode = 'detailed') {
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
  
  // Display based on mode
  if (displayMode === 'detailed') {
    displayDetailedUpdate(signer, analysis, signerData);
  } else if (displayMode === 'table') {
    // Table mode will be handled by periodic updates
  }
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
 * Display detailed multi-line update (for options 4 & 5)
 */
function displayDetailedUpdate(signer, analysis, signerData) {
  const timestamp = new Date().toLocaleTimeString();
  
  console.log(`\n${colors.bright}${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}[${timestamp}] Transaction Update${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  
  // Signer info
  console.log(`  ${colors.yellow}Signer:${colors.reset} ${signer}`);
  
  // Transaction status
  const statusColor = analysis.failed ? colors.red : colors.green;
  const statusText = analysis.failed ? 'FAILED' : 'SUCCESS';
  console.log(`  ${colors.yellow}Status:${colors.reset} ${statusColor}${statusText}${colors.reset}`);
  
  // Transaction type and tip
  if (analysis.type === 'spam') {
    console.log(`  ${colors.yellow}Type:${colors.reset} ${colors.blue}SPAM${colors.reset} (${analysis.tipAmount} lamports)`);
  } else if (analysis.type === 'jito') {
    console.log(`  ${colors.yellow}Type:${colors.reset} ${colors.magenta}JITO${colors.reset} (${analysis.tipAmount} lamports)`);
  }
  
  // Mint info
  if (analysis.mint) {
    console.log(`  ${colors.yellow}Mint:${colors.reset} ${colors.cyan}${analysis.mint}${colors.reset}`);
    if (analysis.mintName && analysis.mintName !== analysis.mint.substring(0, 8) + '...') {
      console.log(`         ${colors.dim}(${analysis.mintName})${colors.reset}`);
    }
  }
  
  // Pool contracts
  if (analysis.poolContracts && analysis.poolContracts.length > 0) {
    console.log(`  ${colors.yellow}Pools:${colors.reset}`);
    analysis.poolContracts
      .filter(p => p.poolAddress)
      .forEach(pool => {
        console.log(`    • ${colors.green}${pool.dexName}:${colors.reset} ${pool.poolAddress}`);
      });
  }
  
  // Running stats
  if (signerData.transactions.total % 5 === 0) {
    console.log(`  ${colors.dim}──────────────────────────────────────────────────────────${colors.reset}`);
    console.log(`  ${colors.yellow}Stats:${colors.reset} ${signerData.transactions.total} txns (${signerData.transactions.successful} success, ${signerData.transactions.failed} failed)`);
    
    if (signerData.transactionTypes.spam > 0) {
      console.log(`  ${colors.yellow}Spam:${colors.reset} ${signerData.tips.spam.min}-${signerData.tips.spam.max} lamports (avg: ${Math.round(signerData.tips.spam.average)})`);
    }
    
    if (signerData.transactionTypes.jito > 0) {
      console.log(`  ${colors.yellow}Jito:${colors.reset} ${signerData.tips.jito.min}-${signerData.tips.jito.max} lamports (avg: ${Math.round(signerData.tips.jito.average)})`);
    }
  }
}

/**
 * Display table header for mint analysis
 */
function displayMintTableHeader() {
  console.clear();
  console.log(`${colors.bright}${colors.green}═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.green}                                                                       REAL-TIME MINT PROFIT ANALYSIS                                                                                                                 ${colors.reset}`);
  console.log(`${colors.bright}${colors.green}═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}Rank │ Mint Address                                         │ Total Profit  │ Txn Count │ Fail Count │ Jito Tip Range        │ Spam Tip Range        │ ROI     ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}─────┼──────────────────────────────────────────────────────┼───────────────┼───────────┼────────────┼───────────────────────┼───────────────────────┼─────────${colors.reset}`);
}

/**
 * Calculate mint statistics across all signers
 */
function calculateMintStats() {
  const mintStats = new Map();
  
  signerTrackers.forEach((signerData) => {
    // Process each mint for this signer
    Object.entries(signerData.mints).forEach(([mintAddress, mintData]) => {
      if (!mintStats.has(mintAddress)) {
        mintStats.set(mintAddress, {
          address: mintAddress,
          name: mintData.name,
          totalProfit: 0,
          txnCount: 0,
          failCount: 0,
          jitoTips: [],
          spamTips: [],
          signers: new Set()
        });
      }
      
      const stats = mintStats.get(mintAddress);
      stats.txnCount += mintData.count;
      stats.failCount += mintData.failed;
      stats.signers.add(signerData.address);
      
      // Add tips from recent transactions
      signerData.recentTransactions.forEach(tx => {
        if (tx.mint === mintAddress) {
          if (tx.type === 'jito' && tx.tipAmount > 0) {
            stats.jitoTips.push(tx.tipAmount);
            stats.totalProfit += tx.tipAmount;
          } else if (tx.type === 'spam' && tx.tipAmount > 0) {
            stats.spamTips.push(tx.tipAmount);
            stats.totalProfit -= tx.tipAmount; // Spam tips are costs
          }
        }
      });
    });
  });
  
  return mintStats;
}

/**
 * Display mint profit table
 */
function displayMintProfitTable() {
  displayMintTableHeader();
  
  const mintStats = calculateMintStats();
  const sortedMints = Array.from(mintStats.values())
    .sort((a, b) => b.totalProfit - a.totalProfit)
    .slice(0, 10);
  
  sortedMints.forEach((mint, index) => {
    const rank = (index + 1).toString().padStart(2);
    const mintAddr = mint.address.padEnd(44);
    const profit = mint.totalProfit >= 0 
      ? colors.green + '+' + mint.totalProfit.toLocaleString().padStart(12) + colors.reset
      : colors.red + mint.totalProfit.toLocaleString().padStart(13) + colors.reset;
    const txnCount = mint.txnCount.toString().padStart(9);
    const failCount = mint.failCount.toString().padStart(10);
    
    // Calculate tip ranges
    const jitoRange = mint.jitoTips.length > 0 
      ? `${Math.min(...mint.jitoTips)}-${Math.max(...mint.jitoTips)}`.padEnd(21)
      : 'N/A'.padEnd(21);
    
    const spamRange = mint.spamTips.length > 0
      ? `${Math.min(...mint.spamTips)}-${Math.max(...mint.spamTips)}`.padEnd(21)
      : 'N/A'.padEnd(21);
    
    // Calculate ROI
    const totalCost = mint.spamTips.reduce((a, b) => a + b, 0);
    const roi = totalCost > 0 ? ((mint.totalProfit / totalCost) * 100).toFixed(1) + '%' : 'N/A';
    
    console.log(` ${rank}  │ ${mintAddr} │ ${profit} │ ${txnCount} │ ${failCount} │ ${jitoRange} │ ${spamRange} │ ${roi.padStart(7)} `);
  });
  
  console.log(`${colors.bright}${colors.cyan}─────┴──────────────────────────────────────────────────────┴───────────────┴───────────┴────────────┴───────────────────────┴───────────────────────┴─────────${colors.reset}`);
  console.log(`\n${colors.dim}Last updated: ${new Date().toLocaleString()} | Tracking ${signerTrackers.size} signers${colors.reset}`);
}

/**
 * Display mint profit table with pool details
 */
function displayMintPoolTable() {
  console.clear();
  console.log(`${colors.bright}${colors.green}═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.green}                                                                  REAL-TIME MINT & POOL PROFIT ANALYSIS                                                                                                               ${colors.reset}`);
  console.log(`${colors.bright}${colors.green}═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════${colors.reset}`);
  
  const mintStats = calculateMintStats();
  const sortedMints = Array.from(mintStats.values())
    .sort((a, b) => b.totalProfit - a.totalProfit)
    .slice(0, 10);
  
  sortedMints.forEach((mint, index) => {
    // Display mint header
    console.log(`\n${colors.bright}${colors.yellow}[${index + 1}] Mint: ${mint.address}${colors.reset}`);
    console.log(`    ${colors.cyan}Profit: ${mint.totalProfit >= 0 ? colors.green : colors.red}${mint.totalProfit >= 0 ? '+' : ''}${mint.totalProfit.toLocaleString()}${colors.reset} │ Txns: ${mint.txnCount} │ Failed: ${mint.failCount} │ ROI: ${calculateROI(mint)}`);
    
    // Get pool stats for this mint
    const poolStats = getPoolStatsForMint(mint.address);
    if (poolStats.length > 0) {
      console.log(`    ${colors.dim}Top Pools:${colors.reset}`);
      poolStats.slice(0, 5).forEach(pool => {
        console.log(`      • ${colors.green}${pool.dexName}${colors.reset}: ${pool.address} (${pool.count} txns)`);
      });
    }
  });
  
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.dim}Last updated: ${new Date().toLocaleString()} | Tracking ${signerTrackers.size} signers${colors.reset}`);
}

/**
 * Get pool statistics for a specific mint
 */
function getPoolStatsForMint(mintAddress) {
  const poolMap = new Map();
  
  signerTrackers.forEach((signerData) => {
    Object.entries(signerData.poolContracts).forEach(([poolAddress, poolData]) => {
      if (poolData.mints && poolData.mints.includes(mintAddress)) {
        if (!poolMap.has(poolAddress)) {
          poolMap.set(poolAddress, {
            address: poolAddress,
            dexName: poolData.dexName,
            count: 0
          });
        }
        poolMap.get(poolAddress).count += poolData.count;
      }
    });
  });
  
  return Array.from(poolMap.values()).sort((a, b) => b.count - a.count);
}

/**
 * Calculate ROI for mint stats
 */
function calculateROI(mint) {
  const totalCost = mint.spamTips.reduce((a, b) => a + b, 0);
  if (totalCost > 0) {
    const roi = ((mint.totalProfit / totalCost) * 100).toFixed(1);
    return `${roi >= 0 ? colors.green : colors.red}${roi}%${colors.reset}`;
  }
  return 'N/A';
}

/**
 * Display real-time update (original single-line format)
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
  displayMintProfitTable,
  displayMintPoolTable,
  ANALYSIS_DIR
};
