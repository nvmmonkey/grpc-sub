const fs = require('fs');
const path = require('path');
const colors = require('./utils/colors');

const ANALYSIS_DIR = path.join(__dirname, 'signer-analysis');

function viewSignerAnalysis() {
  if (!fs.existsSync(ANALYSIS_DIR)) {
    console.log(`${colors.red}No analysis directory found. Run analysis first.${colors.reset}`);
    return;
  }

  const files = fs.readdirSync(ANALYSIS_DIR).filter(f => f.endsWith('.json'));
  
  if (files.length === 0) {
    console.log(`${colors.red}No analysis files found.${colors.reset}`);
    return;
  }

  console.log(`${colors.bright}${colors.green}Available Analysis Files:${colors.reset}\n`);

  files.forEach((file, index) => {
    const filepath = path.join(ANALYSIS_DIR, file);
    const stats = fs.statSync(filepath);
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    
    if (file === 'combined-report.json') {
      console.log(`${colors.bright}${colors.cyan}[Combined Report]${colors.reset}`);
      console.log(`  Signers: ${data.signerCount}`);
      console.log(`  Generated: ${new Date(data.generatedAt).toLocaleString()}`);
      console.log(`  File: ${file}`);
    } else {
      const signer = data.address || file.replace('.json', '');
      console.log(`${colors.yellow}${signer}${colors.reset}`);
      console.log(`  Total transactions: ${data.transactions.total}`);
      console.log(`  Success rate: ${((data.transactions.successful / data.transactions.total) * 100).toFixed(1)}%`);
      console.log(`  Spam/Jito: ${data.transactionTypes.spam}/${data.transactionTypes.jito}`);
      
      if (data.tips.spam.average > 0) {
        console.log(`  Avg spam tip: ${Math.round(data.tips.spam.average).toLocaleString()} lamports`);
      }
      if (data.tips.jito.average > 0) {
        console.log(`  Avg Jito tip: ${Math.round(data.tips.jito.average).toLocaleString()} lamports`);
      }
      
      console.log(`  Last update: ${new Date(data.lastUpdate).toLocaleString()}`);
      console.log(`  File: ${file}`);
    }
    console.log('');
  });

  // Display recent transactions from a specific signer
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.question(`\nEnter signer address to view details (or press Enter to exit): `, (answer) => {
    readline.close();
    
    if (!answer) return;
    
    const filename = `${answer}.json`;
    const filepath = path.join(ANALYSIS_DIR, filename);
    
    if (!fs.existsSync(filepath)) {
      console.log(`${colors.red}Analysis file not found for: ${answer}${colors.reset}`);
      return;
    }
    
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    
    console.log(`\n${colors.bright}${colors.cyan}═══ Detailed Analysis: ${data.address} ═══${colors.reset}\n`);
    
    // Summary
    console.log(`${colors.yellow}Summary:${colors.reset}`);
    console.log(`  Start time: ${new Date(data.startTime).toLocaleString()}`);
    console.log(`  Last update: ${new Date(data.lastUpdate).toLocaleString()}`);
    console.log(`  Total transactions: ${data.transactions.total}`);
    console.log(`  Success/Failed: ${data.transactions.successful}/${data.transactions.failed}`);
    console.log(`  Success rate: ${((data.transactions.successful / data.transactions.total) * 100).toFixed(1)}%`);
    
    // Transaction types
    console.log(`\n${colors.yellow}Transaction Types:${colors.reset}`);
    console.log(`  Spam: ${data.transactionTypes.spam}`);
    console.log(`  Jito: ${data.transactionTypes.jito}`);
    console.log(`  Unknown: ${data.transactionTypes.unknown}`);
    
    // Tips
    if (data.transactionTypes.spam > 0) {
      console.log(`\n${colors.yellow}Spam Tips:${colors.reset}`);
      console.log(`  Min: ${data.tips.spam.min.toLocaleString()} lamports`);
      console.log(`  Max: ${data.tips.spam.max.toLocaleString()} lamports`);
      console.log(`  Average: ${Math.round(data.tips.spam.average).toLocaleString()} lamports`);
      console.log(`  Total: ${data.tips.spam.total.toLocaleString()} lamports`);
    }
    
    if (data.transactionTypes.jito > 0) {
      console.log(`\n${colors.yellow}Jito Tips:${colors.reset}`);
      console.log(`  Min: ${data.tips.jito.min.toLocaleString()} lamports`);
      console.log(`  Max: ${data.tips.jito.max.toLocaleString()} lamports`);
      console.log(`  Average: ${Math.round(data.tips.jito.average).toLocaleString()} lamports`);
      console.log(`  Total: ${data.tips.jito.total.toLocaleString()} lamports`);
    }
    
    // Compute units
    if (data.computeUnits.average > 0) {
      console.log(`\n${colors.yellow}Compute Units:${colors.reset}`);
      console.log(`  Min: ${data.computeUnits.min.toLocaleString()}`);
      console.log(`  Max: ${data.computeUnits.max.toLocaleString()}`);
      console.log(`  Average: ${Math.round(data.computeUnits.average).toLocaleString()}`);
    }
    
    // Top mints
    const topMints = Object.values(data.mints)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    if (topMints.length > 0) {
      console.log(`\n${colors.yellow}Top 10 Mints:${colors.reset}`);
      topMints.forEach((mint, i) => {
        const successRate = mint.count > 0 ? ((mint.successful / mint.count) * 100).toFixed(1) : 0;
        console.log(`  ${i + 1}. ${mint.name || mint.address} - ${mint.count} times (${successRate}% success)`);
      });
    }
    
    // DEX usage
    const dexUsage = Object.values(data.pools)
      .sort((a, b) => b.count - a.count);
    
    if (dexUsage.length > 0) {
      console.log(`\n${colors.yellow}DEX Usage:${colors.reset}`);
      dexUsage.forEach(dex => {
        console.log(`  ${dex.name}: ${dex.count} times`);
      });
    }
    
    // Recent transactions
    if (data.recentTransactions && data.recentTransactions.length > 0) {
      console.log(`\n${colors.yellow}Recent Transactions:${colors.reset}`);
      data.recentTransactions.forEach((tx, i) => {
        console.log(`  ${i + 1}. [${new Date(tx.timestamp).toLocaleTimeString()}] ${tx.type.toUpperCase()} - ${tx.failed ? colors.red + 'FAILED' : colors.green + 'SUCCESS'}${colors.reset}`);
        if (tx.tipAmount > 0) {
          console.log(`     Tip: ${tx.tipAmount.toLocaleString()} lamports`);
        }
        if (tx.mint) {
          console.log(`     Mint: ${tx.mint}`);
        }
        if (tx.pools.length > 0) {
          console.log(`     Pools: ${tx.pools.join(', ')}`);
        }
      });
    }
  });
}

// Run the viewer
viewSignerAnalysis();
