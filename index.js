require('dotenv').config();
const Client = require("@triton-one/yellowstone-grpc").default;
const { CommitmentLevel } = require("@triton-one/yellowstone-grpc");
const { PublicKey } = require("@solana/web3.js");
const bs58 = require("bs58");

// MEV Program ID to monitor
const MEV_PROGRAM_ID = "MEViEnscUm6tsQRoGd9h6nLQaQspKj7DB2M5FwM3Xvz";

// Global counter for transactions
let transactionCount = 0;
let minimalDataCount = 0;

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/**
 * Formats and logs transaction details from Yellowstone gRPC format
 */
function logTransaction(data) {
  try {
    transactionCount++;
    
    // Extract transaction data
    const txData = data.transaction;
    const slot = txData.slot;
    const txInfo = txData.transaction;
    
    // Decode signature
    let signature = 'N/A';
    if (txInfo.signature) {
      signature = bs58.encode(txInfo.signature);
    }
    
    // Check if we have actual transaction content
    const hasTransactionContent = txInfo.transaction && Object.keys(txInfo.transaction).length > 0;
    const hasMetaContent = txInfo.meta && Object.keys(txInfo.meta).length > 0;
    
    if (!hasTransactionContent && !hasMetaContent) {
      minimalDataCount++;
      
      // Show summary every 10 minimal transactions
      if (minimalDataCount % 10 === 0) {
        console.log(`${colors.yellow}[Summary] ${minimalDataCount} transactions received with minimal data (signatures only)${colors.reset}`);
        console.log(`${colors.yellow}Latest: ${signature.substring(0, 20)}... in slot ${slot}${colors.reset}`);
      }
      
      // Show full details for first few
      if (minimalDataCount <= 3) {
        console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
        console.log(`${colors.bright}${colors.yellow}[MEV Transaction #${transactionCount} - Minimal Data]${colors.reset}`);
        console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
        console.log(`${colors.yellow}Signature:${colors.reset} ${signature}`);
        console.log(`${colors.yellow}Slot:${colors.reset} ${slot}`);
        console.log(`${colors.yellow}Index:${colors.reset} ${txInfo.index}`);
        console.log(`${colors.yellow}Is Vote:${colors.reset} ${txInfo.isVote}`);
        console.log(`${colors.red}Note: Your RPC is not providing transaction details.${colors.reset}`);
        console.log(`${colors.red}This could mean:${colors.reset}`);
        console.log(`  - The RPC doesn't have transaction content indexed`);
        console.log(`  - The RPC is configured for minimal data streaming`);
        console.log(`  - You need a different RPC endpoint with full indexing`);
        console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
      }
      
      return;
    }
    
    // If we get here, we have actual transaction content
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.bright}${colors.green}[MEV Transaction #${transactionCount} - Full Data]${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    
    console.log(`${colors.yellow}Signature:${colors.reset} ${signature}`);
    console.log(`${colors.yellow}Slot:${colors.reset} ${slot}`);
    console.log(`${colors.yellow}Index:${colors.reset} ${txInfo.index}`);
    
    // Process transaction content if available
    if (hasTransactionContent) {
      console.log(`${colors.green}Transaction content available!${colors.reset}`);
      // Process message, accounts, instructions, etc.
    }
    
    // Process metadata if available
    if (hasMetaContent) {
      console.log(`${colors.green}Transaction metadata available!${colors.reset}`);
      // Process errors, logs, balance changes, etc.
    }
    
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
    
  } catch (error) {
    console.error(`${colors.red}Error processing transaction:${colors.reset}`, error.message);
  }
}

/**
 * Stream health monitoring
 */
let dataReceivedCount = 0;
let lastDataReceivedTime = Date.now();

function checkStreamHealth() {
  const now = Date.now();
  const timeSinceLastData = (now - lastDataReceivedTime) / 1000;
  
  console.log(`\n${colors.yellow}=== Stream Health Check ===${colors.reset}`);
  console.log(`${colors.green}✓ Stream is active${colors.reset}`);
  console.log(`Total data events: ${dataReceivedCount}`);
  console.log(`MEV transactions found: ${transactionCount}`);
  console.log(`Transactions with only signatures: ${minimalDataCount}`);
  console.log(`Time since last data: ${timeSinceLastData.toFixed(1)}s`);
  
  if (minimalDataCount > 0 && minimalDataCount === transactionCount) {
    console.log(`\n${colors.red}⚠️  WARNING: All transactions lack detailed data${colors.reset}`);
    console.log(`${colors.yellow}Your RPC endpoint appears to be streaming only transaction signatures.${colors.reset}`);
    console.log(`${colors.yellow}To get full transaction details, you need an RPC with:${colors.reset}`);
    console.log(`  - Full transaction indexing enabled`);
    console.log(`  - accountsDataSlice configuration`);
    console.log(`  - Proper gRPC streaming configuration`);
    console.log(`\n${colors.cyan}Recommended RPC providers with full indexing:${colors.reset}`);
    console.log(`  - Helius`);
    console.log(`  - Triton`);
    console.log(`  - Your own Geyser plugin with full indexing`);
  }
  
  console.log(`${colors.yellow}===========================${colors.reset}\n`);
}

// Run health check every 30 seconds
setInterval(checkStreamHealth, 30000);

/**
 * Handles the gRPC stream
 */
async function handleStream(client, args) {
  const stream = await client.subscribe();

  // Promise that resolves when the stream ends or errors out
  const streamClosed = new Promise((resolve, reject) => {
    stream.on("error", (error) => {
      console.error(`${colors.red}Stream error:${colors.reset}`, error);
      reject(error);
      stream.end();
    });

    stream.on("end", () => {
      console.log(`${colors.yellow}Stream ended${colors.reset}`);
      resolve();
    });
    
    stream.on("close", () => {
      console.log(`${colors.yellow}Stream closed${colors.reset}`);
      resolve();
    });
  });

  // Handle incoming data
  stream.on("data", (data) => {
    dataReceivedCount++;
    lastDataReceivedTime = Date.now();
    
    // Log every 100th data event
    if (dataReceivedCount % 100 === 0) {
      console.log(`${colors.cyan}[Stream Active] Received ${dataReceivedCount} data events${colors.reset}`);
    }
    
    // Check if this is a transaction
    if (data?.transaction) {
      logTransaction(data);
    }
  });

  // Send the subscription request
  await new Promise((resolve, reject) => {
    stream.write(args, (err) => {
      if (err) {
        reject(err);
      } else {
        console.log(`${colors.green}✓ Subscription request sent successfully${colors.reset}`);
        resolve();
      }
    });
  }).catch((err) => {
    console.error(`${colors.red}Failed to send subscription request:${colors.reset}`, err);
    throw err;
  });

  console.log(`${colors.green}✓ Connected to gRPC stream${colors.reset}`);
  console.log(`${colors.cyan}Monitoring MEV Program: ${MEV_PROGRAM_ID}${colors.reset}`);
  console.log(`${colors.yellow}Commitment Level: PROCESSED${colors.reset}`);
  console.log(`${colors.magenta}Waiting for transactions...${colors.reset}\n`);

  // Wait for the stream to close
  await streamClosed;
}

/**
 * Main subscription function with auto-reconnect
 */
async function subscribeCommand(client, args) {
  while (true) {
    try {
      await handleStream(client, args);
    } catch (error) {
      console.error(`${colors.red}Stream error, reconnecting in 3 seconds...${colors.reset}`, error.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

// Main execution
(async () => {
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
    const req = {
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

    console.log(`${colors.bright}${colors.green}MEV Transaction Monitor v1.3${colors.reset}`);
    console.log(`${colors.cyan}Connecting to gRPC stream...${colors.reset}`);
    console.log(`${colors.yellow}GRPC URL:${colors.reset} ${process.env.GRPC_URL}`);
    console.log(`${colors.yellow}Authentication:${colors.reset} ${process.env.X_TOKEN ? 'Enabled' : 'Disabled'}`);
    console.log(`${colors.yellow}Program Filter:${colors.reset} ${MEV_PROGRAM_ID}\n`);

    // Initial warning about RPC requirements
    console.log(`${colors.yellow}Note: This monitor requires an RPC with full transaction indexing.${colors.reset}`);
    console.log(`${colors.yellow}If you only see signatures, your RPC may not have full data.${colors.reset}\n`);

    // Start the subscription
    await subscribeCommand(client, req);
  } catch (error) {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
    process.exit(1);
  }
})();
