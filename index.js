require('dotenv').config();
const Client = require("@triton-one/yellowstone-grpc").default;
const { CommitmentLevel } = require("@triton-one/yellowstone-grpc");

// Import utilities
const colors = require('./utils/colors');
const { MEV_PROGRAM_ID } = require('./utils/constants');
const { parseAndLogTransaction } = require('./utils/transactionParser');
const { subscribeWithReconnect } = require('./utils/streamHandler');
const { displayMenu, displayFilterSummary, waitForEnter } = require('./utils/menu');
const { loadSignerAddresses } = require('./utils/signerFilter');
const { saveTransactionDetails, extractTransactionDetails, displaySaveProgress, MAX_SAVED_TRANSACTIONS } = require('./utils/fileSaver');

// Global counters
let transactionCount = 0;
let displayedCount = 0;
let filteredCount = 0;
let savedCount = 0;

// Configuration
let filterMode = 'raw'; // 'raw', 'filtered', or 'save'
let targetSigners = [];

/**
 * Handle incoming transaction data
 */
async function handleTransactionData(data) {
  if (data?.transaction) {
    try {
      transactionCount++;
      
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
          await waitForEnter();
          break;
          
        case '2':
          filterMode = 'filtered';
          console.log(`\n${colors.cyan}Loading signer addresses from onchain-sniper-address.json...${colors.reset}\n`);
          targetSigners = loadSignerAddresses();
          
          if (targetSigners.length === 0) {
            console.log(`${colors.red}No active signer addresses found. Please update onchain-sniper-address.json${colors.reset}`);
            await waitForEnter('Press Enter to return to menu...');
            continue;
          }
          
          displayFilterSummary('filtered', targetSigners.length);
          await waitForEnter();
          break;
          
        case '3':
          filterMode = 'save';
          console.log(`\n${colors.cyan}Save to File mode selected${colors.reset}`);
          console.log(`${colors.yellow}Transactions will be saved to sub-details.json${colors.reset}`);
          console.log(`${colors.yellow}Maximum ${MAX_SAVED_TRANSACTIONS} transactions will be kept${colors.reset}`);
          displayFilterSummary('save');
          await waitForEnter();
          break;
          
        case '4':
          console.log(`\n${colors.yellow}Exiting...${colors.reset}`);
          process.exit(0);
          
        default:
          console.log(`${colors.red}Invalid choice. Please try again.${colors.reset}`);
          await waitForEnter();
          continue;
      }
      
      if (choice === '1' || choice === '2' || choice === '3') {
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
    console.log(`${colors.bright}${colors.green}MEV Transaction Monitor v3.1${colors.reset}`);
    console.log(`${colors.cyan}Connecting to gRPC stream...${colors.reset}`);
    console.log(`${colors.yellow}GRPC URL:${colors.reset} ${process.env.GRPC_URL}`);
    console.log(`${colors.yellow}Authentication:${colors.reset} ${process.env.X_TOKEN ? 'Enabled' : 'Disabled'}`);
    console.log(`${colors.yellow}Program Filter:${colors.reset} ${MEV_PROGRAM_ID}`);
    
    if (filterMode === 'filtered') {
      console.log(`${colors.yellow}Signer Filter:${colors.reset} ${colors.magenta}Active (${targetSigners.length} addresses)${colors.reset}`);
    } else if (filterMode === 'save') {
      console.log(`${colors.yellow}Save Mode:${colors.reset} ${colors.magenta}Active (saving to sub-details.json)${colors.reset}`);
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
