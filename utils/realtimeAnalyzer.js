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

// Mint statistics for table display
const mintProfitStats = new Map();

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
  
  // For table modes OR when targetSigners is null, track all signers (no filtering)
  if (displayMode === 'table' || targetSigners === null) {
    // Initialize tracker if needed
    if (!signerTrackers.has(signer)) {
      startTrackingSigner(signer);
    }
  } else if (targetSigners && !targetSigners.includes(signer)) {
    // For non-table modes with specific targets, check if we should track this signer
    return;
  } else {
    // Initialize tracker if needed
    if (!signerTrackers.has(signer)) {
      startTrackingSigner(signer);
    }
  }
  
  // Analyze transaction
  const analysis = analyzeTransactionType(transaction);
  
  // Update signer data
  const signerData = signerTrackers.get(signer);
  updateSignerData(signerData, analysis);
  
  // Update mint profit stats for table display
  if (displayMode === 'table' && analysis.mint) {
    updateMintProfitStats(analysis, signer);
  }
  
  // Save to file
  saveSignerAnalysis(signer, signerData);
  
  // Display based on mode
  if (displayMode === 'detailed') {
    displayDetailedUpdate(signer, analysis, signerData);
  }
  // Table mode updates are handled by the table display functions
}

/**
 * Update mint profit statistics
 */
function updateMintProfitStats(analysis, signer) {
  const mintAddress = analysis.mint;
  
  if (!mintProfitStats.has(mintAddress)) {
    mintProfitStats.set(mintAddress, {
      address: mintAddress,
      totalProfit: 0,
      netVolume: 0,
      totalFees: 0,
      txnCount: 0,
      failCount: 0,
      successCount: 0,
      jitoTips: [],
      spamTips: [],
      signers: new Set(),
      pools: new Map()
    });
  }
  
  const stats = mintProfitStats.get(mintAddress);
  stats.txnCount++;
  stats.signers.add(signer);
  
  if (analysis.failed) {
    stats.failCount++;
  } else {
    stats.successCount++;
  }
  
  // Update tips and profit
  if (analysis.type === 'jito' && analysis.tipAmount > 0) {
    stats.jitoTips.push(analysis.tipAmount);
    stats.totalProfit += analysis.tipAmount;
    stats.netVolume += analysis.tipAmount;
  } else if (analysis.type === 'spam' && analysis.tipAmount > 0) {
    stats.spamTips.push(analysis.tipAmount);
    stats.totalFees += analysis.tipAmount;
    stats.netVolume -= analysis.tipAmount;
  }
  
  // Update pool information
  if (analysis.poolContracts) {
    analysis.poolContracts.forEach(pool => {
      if (pool.poolAddress) {
        const poolKey = `${pool.dexName}:${pool.poolAddress}`;
        if (!stats.pools.has(poolKey)) {
          stats.pools.set(poolKey, {
            dexName: pool.dexName,
            address: pool.poolAddress,
            count: 0
          });
        }
        stats.pools.get(poolKey).count++;
      }
    });
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
 * Display mint profit table header
 */
function displayMintTableHeader() {
  console.clear();
  console.log(`${colors.bright}${colors.white}===== TOP 10 INTERMEDIATE MINTS BY PROFIT =====${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}Rank | Intermediate Mint                            | Profit (L)   | Txns   | Fails      | Net Vol (L) | Fees (L)   | ROI    ${colors.reset}`);
  console.log(`${colors.dim}─────┼──────────────────────────────────────────────┼──────────────┼────────┼────────────┼─────────────┼────────────┼────────${colors.reset}`);
}

/**
 * Display mint profit table with per-mint Jito/Spam ranges
 */
function displayMintProfitTable() {
  displayMintTableHeader();
  
  // Sort mints by total profit
  const sortedMints = Array.from(mintProfitStats.values())
    .sort((a, b) => b.totalProfit - a.totalProfit)
    .slice(0, 10);
  
  sortedMints.forEach((mint, index) => {
    const rank = `#${(index + 1)}`.padEnd(4);
    const mintAddr = mint.address.substring(0, 44).padEnd(44);
    
    // Calculate profit display - show actual lamports
    const profit = mint.totalProfit.toLocaleString().padStart(12);
    
    // Transaction counts
    const txnCount = `${mint.successCount}/${mint.failCount}`.padEnd(7);
    const failPercent = mint.txnCount > 0 ? ((mint.failCount / mint.txnCount) * 100).toFixed(1) : '0.0';
    const fails = `${mint.failCount} (${failPercent}%)`.padEnd(11);
    
    // Net volume per minute (in lamports)
    const netVol = Math.abs(mint.netVolume).toLocaleString().padStart(11);
    
    // Total fees (in lamports)
    const totalFee = mint.totalFees.toLocaleString().padStart(10);
    
    // Calculate ROI
    const roi = mint.totalFees > 0 ? ((mint.totalProfit / mint.totalFees) * 100).toFixed(2) : '0.00';
    
    console.log(` ${rank} | ${mintAddr} | ${profit} | ${txnCount} | ${fails} | ${netVol} | ${totalFee} | ${roi.padStart(6)}%`);
    
    // Add Jito/Spam ranges per mint (indented below)
    const avgJito = mint.jitoTips.length > 0 
      ? Math.round(mint.jitoTips.reduce((a, b) => a + b, 0) / mint.jitoTips.length) 
      : 0;
    const avgSpam = mint.spamTips.length > 0 
      ? Math.round(mint.spamTips.reduce((a, b) => a + b, 0) / mint.spamTips.length) 
      : 0;
    
    const jitoRange = mint.jitoTips.length > 0 
      ? `${Math.min(...mint.jitoTips).toLocaleString()}-${Math.max(...mint.jitoTips).toLocaleString()} (avg: ${avgJito.toLocaleString()})`
      : 'N/A';
    
    const spamRange = mint.spamTips.length > 0
      ? `${Math.min(...mint.spamTips).toLocaleString()}-${Math.max(...mint.spamTips).toLocaleString()} (avg: ${avgSpam.toLocaleString()})`
      : 'N/A';
    
    console.log(`      Jito: ${jitoRange} | Spam: ${spamRange}`);
  });
  
  console.log(`─────┴──────────────────────────────────────────────┴──────────────┴────────┴────────────┴─────────────┴────────────┴────────`);
  console.log(`\nNote: All values in lamports | Tracking ${signerTrackers.size} signers | Last updated: ${new Date().toLocaleTimeString()}`);
}

/**
 * Display mint pool table with compact details
 */
function displayMintPoolTable() {
  console.clear();
  console.log(`${colors.bright}${colors.white}===== TOP 10 MINTS WITH POOL DETAILS =====${colors.reset}`);
  
  // Sort mints by total profit
  const sortedMints = Array.from(mintProfitStats.values())
    .sort((a, b) => b.totalProfit - a.totalProfit)
    .slice(0, 10);
  
  sortedMints.forEach((mint, index) => {
    // Compact header with all info on one line
    const profit = mint.totalProfit >= 0 ? colors.green : colors.red;
    const profitStr = `${mint.totalProfit >= 0 ? '+' : ''}${mint.totalProfit.toLocaleString()} lamports`;
    const roi = mint.totalFees > 0 ? ((mint.totalProfit / mint.totalFees) * 100).toFixed(1) : '0.0';
    
    console.log(`\n${colors.yellow}#${index + 1}${colors.reset} ${mint.address}`);
    console.log(`   ${profit}${profitStr}${colors.reset} | ${mint.txnCount} txns (${mint.successCount}✓/${mint.failCount}✗) | ROI: ${roi}%`);
    
    // Jito/Spam on same line with lamports
    const avgJito = mint.jitoTips.length > 0 
      ? Math.round(mint.jitoTips.reduce((a, b) => a + b, 0) / mint.jitoTips.length) 
      : 0;
    const avgSpam = mint.spamTips.length > 0 
      ? Math.round(mint.spamTips.reduce((a, b) => a + b, 0) / mint.spamTips.length) 
      : 0;
    
    const jitoStr = mint.jitoTips.length > 0 
      ? `${Math.min(...mint.jitoTips).toLocaleString()}-${Math.max(...mint.jitoTips).toLocaleString()} (avg: ${avgJito.toLocaleString()})`
      : 'None';
    const spamStr = mint.spamTips.length > 0 
      ? `${Math.min(...mint.spamTips).toLocaleString()}-${Math.max(...mint.spamTips).toLocaleString()} (avg: ${avgSpam.toLocaleString()})`
      : 'None';
    
    console.log(`   Jito: ${jitoStr} | Spam: ${spamStr}`);
    
    // Top 3 pools on one line each
    const topPools = Array.from(mint.pools.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    
    if (topPools.length > 0) {
      topPools.forEach((pool, i) => {
        console.log(`   ${i+1}. ${pool.dexName}: ${pool.address} (${pool.count}x)`);
      });
    }
  });
  
  console.log(`\n${colors.dim}Note: All values in lamports | Tracking ${signerTrackers.size} signers | Updated: ${new Date().toLocaleTimeString()}${colors.reset}`);
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
