require('dotenv').config();
const Client = require("@triton-one/yellowstone-grpc").default;
const { CommitmentLevel } = require("@triton-one/yellowstone-grpc");

// Import utilities
const colors = require('./utils/colors');
const { MEV_PROGRAM_ID } = require('./utils/constants');
const { parseAndLogTransaction } = require('./utils/transactionParser');
const { subscribeWithReconnect } = require('./utils/streamHandler');

// Global counter for transactions
let transactionCount = 0;

/**
 * Handle incoming transaction data
 */
function handleTransactionData(data) {
  if (data?.transaction) {
    try {
      transactionCount++;
      parseAndLogTransaction(data, transactionCount);
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
    console.log(`${colors.bright}${colors.green}MEV Transaction Monitor v3.0${colors.reset}`);
    console.log(`${colors.cyan}Connecting to gRPC stream...${colors.reset}`);
    console.log(`${colors.yellow}GRPC URL:${colors.reset} ${process.env.GRPC_URL}`);
    console.log(`${colors.yellow}Authentication:${colors.reset} ${process.env.X_TOKEN ? 'Enabled' : 'Disabled'}`);
    console.log(`${colors.yellow}Program Filter:${colors.reset} ${MEV_PROGRAM_ID}\n`);

    // Configuration for stream handler
    const streamConfig = {
      programId: MEV_PROGRAM_ID,
      commitment: 'PROCESSED'
    };

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
