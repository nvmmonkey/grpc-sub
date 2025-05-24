// This file contains fixes for the real-time analyzer issues

const fs = require('fs');
const path = require('path');

// Fix 1: Update displayMintProfitTable to show Jito/Spam ranges PER MINT
function generateFixedMintTable() {
  const fixedFunction = `
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
    const rank = \`#\${(index + 1)}\`.padEnd(3);
    const mintAddr = mint.address.substring(0, 43);
    
    // Calculate profit display
    const profit = formatNumber(mint.totalProfit).padStart(12);
    
    // Transaction counts
    const txnCount = \`\${mint.successCount}.\${mint.failCount}\`.padEnd(6);
    const failPercent = mint.txnCount > 0 ? ((mint.failCount / mint.txnCount) * 100).toFixed(2) : '0.00';
    const fails = \`\${mint.failCount} \${failPercent}%\`.padEnd(10);
    
    // Net volume per minute (assuming 1 min intervals)
    const netVol = formatNumber(Math.abs(mint.netVolume)).padStart(11);
    
    // Total fees
    const totalFee = formatNumber(mint.totalFees).padStart(10);
    
    // Calculate ROI
    const roi = mint.totalFees > 0 ? ((mint.totalProfit / mint.totalFees) * 100).toFixed(2) : '0.00';
    
    console.log(\` \${rank} | \${mintAddr} | \${profit} | \${txnCount} | \${fails} | \${netVol} | \${totalFee} | \${roi.padStart(6)}%\`);
    
    // Add Jito/Spam ranges per mint (indented below)
    const avgJito = mint.jitoTips.length > 0 
      ? Math.round(mint.jitoTips.reduce((a, b) => a + b, 0) / mint.jitoTips.length) 
      : 0;
    const avgSpam = mint.spamTips.length > 0 
      ? Math.round(mint.spamTips.reduce((a, b) => a + b, 0) / mint.spamTips.length) 
      : 0;
    
    const jitoRange = mint.jitoTips.length > 0 
      ? \`\${Math.min(...mint.jitoTips)}-\${Math.max(...mint.jitoTips)} (avg: \${avgJito})\`
      : 'N/A';
    
    const spamRange = mint.spamTips.length > 0
      ? \`\${Math.min(...mint.spamTips)}-\${Math.max(...mint.spamTips)} (avg: \${avgSpam})\`
      : 'N/A';
    
    console.log(\`      \${colors.dim}Jito: \${jitoRange} | Spam: \${spamRange}\${colors.reset}\`);
  });
  
  console.log(\`\${colors.dim}─────┴─────────────────────────────────────────────┴──────────────┴────────┴────────┴─────────────┴────────────┴────────\${colors.reset}\`);
  console.log(\`\${colors.dim}Tracking \${signerTrackers.size} signers | Last updated: \${new Date().toLocaleTimeString()}\${colors.reset}\`);
}`;

  return fixedFunction;
}

// Fix 2: Make Option 5 track ALL signers instead of just configured ones
function generateTrackerFix() {
  const fixedCode = `
// In index.js, modify the handleTransactionData function for option 5:

// For analyze-all mode:
else if (filterMode === 'analyze-all' || filterMode === 'table-mint' || filterMode === 'table-pool') {
  // For ALL modes, process ALL transactions (no signer filtering)
  processTransactionForAnalysis(transactionDetails, null, displayMode);
  displayedCount++;
  
  // Update table display immediately for table modes
  if (filterMode === 'table-mint') {
    displayMintProfitTable();
  } else if (filterMode === 'table-pool') {
    displayMintPoolTable();
  }
}

// And update the processTransactionForAnalysis function:
function processTransactionForAnalysis(transaction, targetSigners = null, displayMode = 'detailed') {
  if (!transaction.signers || transaction.signers.length === 0) return;
  
  const signer = transaction.signers[0];
  
  // For table modes OR when targetSigners is null, track all signers
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
  
  // Continue with analysis...
}`;

  return fixedCode;
}

// Fix 3: Improve Option 7 display to be more compact
function generateCompactPoolTable() {
  const fixedFunction = `
/**
 * Display mint pool table with compact details
 */
function displayMintPoolTable() {
  console.clear();
  console.log(\`\${colors.bright}\${colors.white}===== TOP 10 MINTS WITH POOL DETAILS =====\${colors.reset}\`);
  
  // Sort mints by total profit
  const sortedMints = Array.from(mintProfitStats.values())
    .sort((a, b) => b.totalProfit - a.totalProfit)
    .slice(0, 10);
  
  sortedMints.forEach((mint, index) => {
    // Compact header with all info on one line
    const profit = mint.totalProfit >= 0 ? colors.green : colors.red;
    const profitStr = \`\${mint.totalProfit >= 0 ? '+' : ''}\${formatNumber(mint.totalProfit)}\`;
    const roi = mint.totalFees > 0 ? ((mint.totalProfit / mint.totalFees) * 100).toFixed(1) : '0.0';
    
    console.log(\`\n\${colors.yellow}#\${index + 1}\${colors.reset} \${mint.address.substring(0, 44)}...\`);
    console.log(\`   \${profit}\${profitStr}\${colors.reset} | \${mint.txnCount} txns (\${mint.successCount}✓/\${mint.failCount}✗) | ROI: \${roi}%\`);
    
    // Jito/Spam on same line
    const avgJito = mint.jitoTips.length > 0 
      ? Math.round(mint.jitoTips.reduce((a, b) => a + b, 0) / mint.jitoTips.length) 
      : 0;
    const avgSpam = mint.spamTips.length > 0 
      ? Math.round(mint.spamTips.reduce((a, b) => a + b, 0) / mint.spamTips.length) 
      : 0;
    
    const jitoStr = mint.jitoTips.length > 0 
      ? \`\${Math.min(...mint.jitoTips)}-\${Math.max(...mint.jitoTips)} (avg: \${avgJito})\`
      : 'None';
    const spamStr = mint.spamTips.length > 0 
      ? \`\${Math.min(...mint.spamTips)}-\${Math.max(...mint.spamTips)} (avg: \${avgSpam})\`
      : 'None';
    
    console.log(\`   J: \${jitoStr} | S: \${spamStr}\`);
    
    // Top 3 pools on one line each
    const topPools = Array.from(mint.pools.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    
    if (topPools.length > 0) {
      topPools.forEach((pool, i) => {
        console.log(\`   \${i+1}. \${pool.dexName}: \${pool.address.substring(0, 44)}... (\${pool.count}x)\`);
      });
    }
  });
  
  console.log(\`\n\${colors.dim}Tracking \${signerTrackers.size} signers | Updated: \${new Date().toLocaleTimeString()}\${colors.reset}\`);
}`;

  return fixedFunction;
}

// Write the fixes to a file
const fixes = {
  issue1: "Option 5 not tracking all signers",
  fix1: generateTrackerFix(),
  
  issue2: "Option 6 missing per-mint Jito/Spam ranges",
  fix2: generateFixedMintTable(),
  
  issue3: "Option 7 display too long",
  fix3: generateCompactPoolTable(),
  
  instructions: `
To apply these fixes:

1. For Option 5 (tracking all signers):
   - In index.js, modify the handleTransactionData function
   - Change the analyze-all condition to pass null for targetSigners
   - Update processTransactionForAnalysis in realtimeAnalyzer.js to handle null targetSigners

2. For Option 6 (per-mint ranges):
   - Replace the displayMintProfitTable function in realtimeAnalyzer.js
   - This will show Jito/Spam ranges under each mint row

3. For Option 7 (compact display):
   - Replace the displayMintPoolTable function in realtimeAnalyzer.js
   - This provides a more compact, readable format

The main changes ensure:
- All modes track ALL signers when appropriate
- Table displays are more informative and compact
- Statistics are shown per-mint rather than globally
`
};

console.log('Fixes generated. Review the code above and apply the changes to your files.');
console.log('\nKey changes:');
console.log('1. Option 5 will now track ALL signers, not just configured ones');
console.log('2. Option 6 will show Jito/Spam ranges for each mint individually');
console.log('3. Option 7 will use a more compact display format');

// Save fixes to file
fs.writeFileSync('analyzer-fixes.json', JSON.stringify(fixes, null, 2));
console.log('\nFixes saved to analyzer-fixes.json');
