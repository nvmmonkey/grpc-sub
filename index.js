require('dotenv').config();
const Client = require("@triton-one/yellowstone-grpc").default;
const { CommitmentLevel } = require("@triton-one/yellowstone-grpc");

// Import utilities
const colors = require('./utils/colors');
const { MEV_PROGRAM_ID } = require('./utils/constants');
const { parseAndLogTransaction } = require('./utils/transactionParser');
const { subscribeWithReconnect } = require('./utils/streamHandler');
const { displayMenu, displayFilterSummary, waitForEnter } = require('./utils/menu');
const { loadSignerAddresses, loadSignerObjects } = require('./utils/signerFilter');
const { saveTransactionDetails, extractTransactionDetails, displaySaveProgress, MAX_SAVED_TRANSACTIONS } = require('./utils/fileSaver');
const { processTransactionForAnalysis, displayAllSignersSummary, displayMintProfitTable, displayMintPoolTable } = require('./utils/realtimeAnalyzer');

// Global counters
let transactionCount = 0;
let displayedCount = 0;
let filteredCount = 0;
let savedCount = 0;

// Configuration
let filterMode = 'raw'; // 'raw', 'filtered', 'save', 'analyze-one', 'analyze-all', 'table-mint', 'table-pool'
let targetSigners = [];
let analyzeTarget = null; // For single signer analysis
let displayMode = 'detailed'; // 'detailed' or 'table'

/**
 * Handle incoming transaction data
 */
async function handleTransactionData(data) {
  if (data?.transaction) {
    try {
      transactionCount++;
      
      // For analysis modes, process for real-time analysis
      if (filterMode === 'analyze-one' || filterMode === 'analyze-all' || filterMode === 'table-mint' || filterMode === 'table-pool') {
        const transactionDetails = await extractTransactionDetails(data, transactionCount);
        
        if (filterMode === 'analyze-one') {
          // Analyze specific signer
          if (transactionDetails.signers && transactionDetails.signers.includes(analyzeTarget)) {
            processTransactionForAnalysis(transactionDetails, [analyzeTarget], displayMode);
            displayedCount++;
          }
        } else if (filterMode === 'analyze-all' || filterMode === 'table-mint' || filterMode === 'table-pool') {
          // For ALL these modes, process ALL transactions (no signer filtering)
          processTransactionForAnalysis(transactionDetails, null, displayMode);
          displayedCount++;
          
          // Update table display immediately for table modes
          if (filterMode === 'table-mint') {
            displayMintProfitTable();
          } else if (filterMode === 'table-pool') {
            displayMintPoolTable();
          }
        }
        
        // Show progress
        if (transactionCount % 100 === 0) {
          console.log(`\n${colors.cyan}[Progress] Scanned: ${transactionCount} | Analyzed: ${displayedCount}${colors.reset}\n`);
        }
        
        return; // Skip normal processing for analysis modes
      }
      
      // Normal processing for other modes
      const options = {
        filterMode,
        targetSigners
      };
      
      const wasLogged = await parseAndLogTransaction(data, displayedCount + 1, options);
      
      if (wasLogged) {
        displayedCount++;
        
        // Save transaction if in save mode
        if (filterMode === 'save') {
          const transactionDetails = await extractTransactionDetails(data, displayedCount);
          const currentSavedCount = saveTransactionDetails(transactionDetails);
          
          if (currentSavedCount > 0) {
            savedCount = currentSavedCount;
            displaySaveProgress(savedCount, transactionCount);
          }
        }
      } else if (filterMode === 'filtered') {
        filteredCount++;
        
        // Show progress every 100 filtered transactions
        if (filteredCount % 100 === 0) {
          console.log(`${colors.yellow}[Progress] Scanned ${transactionCount} transactions, filtered out ${filteredCount}, displayed ${displayedCount}${colors.reset}`);
        }
      }
    } catch (error) {
      console.error(`${colors.red}Error processing transaction:${colors.reset}`, error.message);
      console.error(error.stack);
    }
  }
}

/**
 * Initialize and start the MEV monitor
 */
async function startMevMonitor() {
  try {
    // Display menu and get user choice
    let choice;
    do {
      choice = await displayMenu();
      
      switch (choice) {
        case '1':
          filterMode = 'raw';
          displayFilterSummary('raw');
          console.log('\nStarting raw subscription mode...');
          break;
          
        case '2':
          filterMode = 'filtered';
          console.log(`\n${colors.cyan}Loading signer addresses from onchain-sniper-address.json...${colors.reset}\n`);
          targetSigners = loadSignerAddresses();
          
          if (targetSigners.length === 0) {
            console.log(`${colors.red}No active signer addresses found. Please update onchain-sniper-address.json${colors.reset}`);
            console.log('\nReturning to menu...');
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
            continue;
          }
          
          displayFilterSummary('filtered', targetSigners.length);
          console.log('\nStarting filtered subscription mode...');
          break;
          
        case '3':
          filterMode = 'save';
          console.log(`\n${colors.cyan}Save to File mode selected${colors.reset}`);
          console.log(`${colors.yellow}Transactions will be saved to sub-details.json${colors.reset}`);
          console.log(`${colors.yellow}Maximum ${MAX_SAVED_TRANSACTIONS} transactions will be kept${colors.reset}`);
          displayFilterSummary('save');
          console.log('\nStarting save mode...');
          break;
          
        case '4':
          filterMode = 'analyze-one';
          displayMode = 'detailed';
          console.log(`\n${colors.cyan}Real-time Analysis - Specific Signer (Detailed Mode)${colors.reset}`);
          
          const signerObjects = loadSignerObjects();
          if (signerObjects.length === 0) {
            console.log(`${colors.red}No signers found in onchain-sniper-address.json${colors.reset}`);
            console.log('\nReturning to menu...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          
          console.log(`\n${colors.cyan}Available signers:${colors.reset}`);
          signerObjects.forEach((signer, index) => {
            console.log(`${index + 1}. ${signer.address} - ${signer.name || 'Unnamed'} ${signer.active ? colors.green + '(active)' : colors.red + '(inactive)'}${colors.reset}`);
          });
          
          const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          const signerChoice = await new Promise(resolve => {
            readline.question(`\nSelect signer (1-${signerObjects.length}): `, resolve);
          });
          readline.close();
          
          const selectedIndex = parseInt(signerChoice) - 1;
          if (selectedIndex >= 0 && selectedIndex < signerObjects.length) {
            analyzeTarget = signerObjects[selectedIndex].address;
            console.log(`\n${colors.green}Starting detailed real-time analysis for: ${signerObjects[selectedIndex].name || 'Unnamed'}${colors.reset}`);
            console.log(`${colors.yellow}Address: ${analyzeTarget}${colors.reset}`);
            console.log(`${colors.yellow}Analysis files will be saved to: signer-analysis/${analyzeTarget}.json${colors.reset}`);
            console.log('\nStarting analysis...');
          } else {
            console.log(`${colors.red}Invalid selection${colors.reset}`);
            console.log('\nReturning to menu...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          break;
          
        case '5':
          filterMode = 'analyze-all';
          displayMode = 'detailed';
          console.log(`\n${colors.cyan}Real-time Analysis - All Signers (Detailed Mode)${colors.reset}`);
          console.log(`\n${colors.green}Starting detailed real-time analysis for ALL signers${colors.reset}`);
          console.log(`${colors.yellow}This will track EVERY signer that appears in MEV transactions${colors.reset}`);
          console.log(`${colors.yellow}Analysis files will be saved to: signer-analysis/ directory${colors.reset}`);
          console.log(`${colors.yellow}Combined report: signer-analysis/combined-report.json${colors.reset}`);
          console.log('\nStarting analysis...');
          break;
          
        case '6':
          filterMode = 'table-mint';
          displayMode = 'table';
          console.log(`\n${colors.bright}${colors.magenta}Mint Profit Table Mode${colors.reset}`);
          console.log(`\n${colors.green}Starting real-time mint profit analysis${colors.reset}`);
          console.log(`${colors.yellow}Tracking ALL signers automatically${colors.reset}`);
          console.log(`${colors.yellow}Table updates in real-time with each transaction${colors.reset}`);
          console.log('\nStarting table mode...');
          break;
          
        case '7':
          filterMode = 'table-pool';
          displayMode = 'table';
          console.log(`\n${colors.bright}${colors.blue}Mint & Pool Table Mode${colors.reset}`);
          console.log(`\n${colors.green}Starting real-time mint & pool profit analysis${colors.reset}`);
          console.log(`${colors.yellow}Tracking ALL signers automatically${colors.reset}`);
          console.log(`${colors.yellow}Table updates in real-time with each transaction${colors.reset}`);
          console.log('\nStarting table mode...');
          break;
          
        case '8':
          console.log(`\n${colors.yellow}Exiting...${colors.reset}`);
          process.exit(0);
          
        default:
          console.log(`${colors.red}Invalid choice. Please try again.${colors.reset}`);
          await new Promise(resolve => setTimeout(resolve, 1500));
          continue;
      }
      
      if (choice === '1' || choice === '2' || choice === '3' || choice === '4' || choice === '5' || choice === '6' || choice === '7') {
        break;
      }
    } while (true);

    // Check for required environment variables
    if (!process.env.GRPC_URL) {
      console.error(`${colors.red}Error: Missing GRPC_URL environment variable!${colors.reset}`);
      console.error('Please create a .env file with:');
      console.error('GRPC_URL=your_grpc_url');
      console.error('X_TOKEN=your_access_token (optional)');
      process.exit(1);
    }

    // Initialize Yellowstone gRPC client
    const client = new Client(
      process.env.GRPC_URL,
      process.env.X_TOKEN || undefined,
      undefined
    );

    // Subscription request configuration
    const subscriptionRequest = {
      accounts: {},
      slots: {},
      transactions: {
        mev: {
          vote: false,
          failed: false,
          signature: undefined,
          accountInclude: [MEV_PROGRAM_ID],
          accountExclude: [],
          accountRequired: [],
        },
      },
      transactionsStatus: {},
      blocks: {},
      blocksMeta: {},
      entry: {},
      accountsDataSlice: [],
      ping: undefined,
      commitment: CommitmentLevel.PROCESSED,
    };

    // Display startup information
    console.clear();
    console.log(`${colors.bright}${colors.green}MEV Transaction Monitor v3.2${colors.reset}`);
    console.log(`${colors.cyan}Connecting to gRPC stream...${colors.reset}`);
    console.log(`${colors.yellow}GRPC URL:${colors.reset} ${process.env.GRPC_URL}`);
    console.log(`${colors.yellow}Authentication:${colors.reset} ${process.env.X_TOKEN ? 'Enabled' : 'Disabled'}`);
    console.log(`${colors.yellow}Program Filter:${colors.reset} ${MEV_PROGRAM_ID}`);
    
    if (filterMode === 'filtered') {
      console.log(`${colors.yellow}Signer Filter:${colors.reset} ${colors.magenta}Active (${targetSigners.length} addresses)${colors.reset}`);
    } else if (filterMode === 'save') {
      console.log(`${colors.yellow}Save Mode:${colors.reset} ${colors.magenta}Active (saving to sub-details.json)${colors.reset}`);
    } else if (filterMode === 'analyze-one') {
      console.log(`${colors.yellow}Mode:${colors.reset} ${colors.cyan}Real-time Analysis - Single Signer${colors.reset}`);
      console.log(`${colors.yellow}Target:${colors.reset} ${analyzeTarget}`);
    } else if (filterMode === 'analyze-all') {
      console.log(`${colors.yellow}Mode:${colors.reset} ${colors.cyan}Real-time Analysis - All Signers (${targetSigners.length})${colors.reset}`);
    } else if (filterMode === 'table-mint') {
      console.log(`${colors.yellow}Mode:${colors.reset} ${colors.bright}${colors.magenta}Mint Profit Table - Real-time Updates${colors.reset}`);
      console.log(`${colors.yellow}Tracking:${colors.reset} ALL signers (no filtering)`);
    } else if (filterMode === 'table-pool') {
      console.log(`${colors.yellow}Mode:${colors.reset} ${colors.bright}${colors.blue}Mint & Pool Table - Real-time Updates${colors.reset}`);
      console.log(`${colors.yellow}Tracking:${colors.reset} ALL signers (no filtering)`);
    } else {
      console.log(`${colors.yellow}Mode:${colors.reset} ${colors.white}Raw subscription${colors.reset}`);
    }
    
    console.log('');

    // Configuration for stream handler
    const streamConfig = {
      programId: MEV_PROGRAM_ID,
      commitment: 'PROCESSED'
    };

    // Add periodic stats display
    if (filterMode === 'filtered') {
      setInterval(() => {
        if (transactionCount > 0) {
          const filterRate = ((filteredCount / transactionCount) * 100).toFixed(1);
          console.log(`\n${colors.cyan}[Stats] Total scanned: ${transactionCount} | Displayed: ${displayedCount} | Filtered: ${filteredCount} (${filterRate}%)${colors.reset}\n`);
        }
      }, 30000); // Every 30 seconds
    } else if (filterMode === 'save') {
      setInterval(() => {
        if (transactionCount > 0) {
          console.log(`\n${colors.cyan}[Save Stats] Total scanned: ${transactionCount} | Displayed: ${displayedCount} | Saved: ${savedCount}/${MAX_SAVED_TRANSACTIONS}${colors.reset}\n`);
        }
      }, 30000); // Every 30 seconds
    } else if (filterMode === 'analyze-one' || filterMode === 'analyze-all') {
      setInterval(() => {
        if (transactionCount > 0) {
          console.log(`\n${colors.cyan}[Analysis Stats] Total scanned: ${transactionCount} | Analyzed: ${displayedCount}${colors.reset}`);
          if (filterMode === 'analyze-all') {
            displayAllSignersSummary();
          }
        }
      }, 60000); // Every minute
    }
    // Table modes update in real-time, no interval needed
    
    // Show ALT cache stats periodically if ALT resolution is enabled
    if (process.env.RPC_URL && process.env.ALT_RESOLUTION !== 'false') {
      const { getLookupTableStats } = require('./utils/lookupTableResolver');
      setInterval(() => {
        const stats = getLookupTableStats();
        if (stats.cachedTables > 0) {
          console.log(`\n${colors.dim}[ALT Cache] Tables: ${stats.cachedTables} | Success: ${stats.successfulTables} | Failed: ${stats.failedTables} | Hit Rate: ${stats.cacheHitRate}${colors.reset}\n`);
        }
      }, 60000); // Every minute
    }

    // Start the subscription with auto-reconnect
    await subscribeWithReconnect(
      client, 
      subscriptionRequest, 
      handleTransactionData,
      streamConfig
    );
    
  } catch (error) {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
    process.exit(1);
  }
}

// Start the monitor
startMevMonitor();
