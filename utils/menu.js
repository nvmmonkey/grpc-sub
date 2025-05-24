const readline = require('readline');
const colors = require('./colors');

/**
 * Create readline interface for user input
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Display main menu and get user choice
 */
async function displayMenu() {
  const rl = createInterface();
  
  console.clear();
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.green}              MEV Transaction Monitor v3.2${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`);
  
  console.log(`${colors.yellow}Select mode:${colors.reset}\n`);
  console.log(`  ${colors.bright}[1]${colors.reset} ${colors.green}Raw Subscription${colors.reset} - Monitor all MEV transactions`);
  console.log(`  ${colors.bright}[2]${colors.reset} ${colors.blue}Filtered by Signer${colors.reset} - Monitor only transactions from specific signers`);
  console.log(`  ${colors.bright}[3]${colors.reset} ${colors.magenta}Save to File${colors.reset} - Monitor and save transaction details (max 100)`);
  console.log(`  ${colors.bright}[4]${colors.reset} ${colors.cyan}Analyze Specific Signer${colors.reset} - Analyze saved data for one signer`);
  console.log(`  ${colors.bright}[5]${colors.reset} ${colors.yellow}Analyze All Signers${colors.reset} - Analyze saved data for all signers`);
  console.log(`  ${colors.bright}[6]${colors.reset} ${colors.red}Exit${colors.reset}\n`);
  
  return new Promise((resolve) => {
    rl.question(`${colors.yellow}Enter your choice (1-6): ${colors.reset}`, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Display filter summary
 */
function displayFilterSummary(mode, signerCount = 0) {
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.green}Monitoring Configuration${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
  
  if (mode === 'raw') {
    console.log(`${colors.yellow}Mode:${colors.reset} ${colors.green}Raw Subscription${colors.reset}`);
    console.log(`${colors.yellow}Filter:${colors.reset} All MEV transactions will be shown`);
  } else if (mode === 'filtered') {
    console.log(`${colors.yellow}Mode:${colors.reset} ${colors.blue}Filtered by Signer${colors.reset}`);
    console.log(`${colors.yellow}Filter:${colors.reset} Only transactions from ${signerCount} configured signers`);
  } else if (mode === 'save') {
    console.log(`${colors.yellow}Mode:${colors.reset} ${colors.magenta}Save to File${colors.reset}`);
    console.log(`${colors.yellow}Output:${colors.reset} Transaction details saved to sub-details.json`);
    console.log(`${colors.yellow}Limit:${colors.reset} Maximum 100 transactions (oldest replaced when full)`);
  }
  
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`);
}

/**
 * Wait for user to press Enter
 */
async function waitForEnter(message = 'Press Enter to continue...') {
  const rl = createInterface();
  
  return new Promise((resolve) => {
    rl.question(`\n${colors.yellow}${message}${colors.reset}`, () => {
      rl.close();
      resolve();
    });
  });
}

module.exports = {
  displayMenu,
  displayFilterSummary,
  waitForEnter
};
