require('dotenv').config();
const Client = require("@triton-one/yellowstone-grpc").default;
const { CommitmentLevel } = require("@triton-one/yellowstone-grpc");
const { PublicKey } = require("@solana/web3.js");
const bs58 = require("bs58");

// MEV Program ID to monitor
const MEV_PROGRAM_ID = "MEViEnscUm6tsQRoGd9h6nLQaQspKj7DB2M5FwM3Xvz";

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
 * Formats and logs transaction details
 */
function logTransaction(txData) {
  const tx = txData.transaction;
  const meta = tx.meta;
  const slot = tx.slot;
  const signature = bs58.encode(tx.signature);
  
  console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bright}${colors.green}[MEV Transaction Detected]${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  
  console.log(`${colors.yellow}Signature:${colors.reset} ${signature}`);
  console.log(`${colors.yellow}Slot:${colors.reset} ${slot}`);
  console.log(`${colors.yellow}Time:${colors.reset} ${new Date().toISOString()}`);
  
  // Parse the transaction message
  const message = tx.transaction.message;
  const accountKeys = message.accountKeys;
  
  console.log(`\n${colors.bright}${colors.blue}Account Keys:${colors.reset}`);
  accountKeys.forEach((key, index) => {
    const pubkey = bs58.encode(key);
    const isWritable = index < message.header.numRequiredSignatures - message.header.numReadonlySignedAccounts ||
                      (index >= message.header.numRequiredSignatures && 
                       index < accountKeys.length - message.header.numReadonlyUnsignedAccounts);
    const isSigner = index < message.header.numRequiredSignatures;
    
    let accountType = [];
    if (isSigner) accountType.push(`${colors.green}signer${colors.reset}`);
    if (isWritable) accountType.push(`${colors.yellow}writable${colors.reset}`);
    if (pubkey === MEV_PROGRAM_ID) accountType.push(`${colors.magenta}MEV Program${colors.reset}`);
    
    console.log(`  [${index}] ${pubkey} ${accountType.length > 0 ? `(${accountType.join(', ')})` : ''}`);
  });
  
  // Log instructions
  console.log(`\n${colors.bright}${colors.blue}Instructions:${colors.reset}`);
  message.instructions.forEach((ix, index) => {
    const programId = bs58.encode(accountKeys[ix.programIdIndex]);
    console.log(`  [${index}] Program: ${programId}`);
    if (ix.data && ix.data.length > 0) {
      const dataHex = Buffer.from(ix.data).toString('hex');
      console.log(`      Data: ${dataHex.substring(0, 64)}${dataHex.length > 64 ? '...' : ''}`);
    }
    if (ix.accounts && ix.accounts.length > 0) {
      console.log(`      Accounts: [${ix.accounts.join(', ')}]`);
    }
  });
  
  // Log transaction result
  if (meta) {
    const status = meta.err ? `${colors.red}Failed${colors.reset}` : `${colors.green}Success${colors.reset}`;
    console.log(`\n${colors.bright}${colors.blue}Status:${colors.reset} ${status}`);
    
    if (meta.err) {
      console.log(`${colors.red}Error:${colors.reset} ${JSON.stringify(meta.err)}`);
    }
    
    console.log(`${colors.yellow}Fee:${colors.reset} ${meta.fee} lamports`);
    console.log(`${colors.yellow}Compute Units:${colors.reset} ${meta.computeUnitsConsumed || 'N/A'}`);
    
    // Log balance changes
    if (meta.preBalances && meta.postBalances) {
      console.log(`\n${colors.bright}${colors.blue}Balance Changes:${colors.reset}`);
      meta.preBalances.forEach((preBalance, index) => {
        const postBalance = meta.postBalances[index];
        const change = postBalance - preBalance;
        if (change !== 0) {
          const pubkey = bs58.encode(accountKeys[index]);
          const changeStr = change > 0 ? `+${change}` : `${change}`;
          const changeColor = change > 0 ? colors.green : colors.red;
          console.log(`  ${pubkey}: ${changeColor}${changeStr}${colors.reset} lamports`);
        }
      });
    }
    
    // Log logs
    if (meta.logMessages && meta.logMessages.length > 0) {
      console.log(`\n${colors.bright}${colors.blue}Logs:${colors.reset}`);
      meta.logMessages.forEach((log, index) => {
        console.log(`  [${index}] ${log}`);
      });
    }
  }
  
  console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
}

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

    stream.on("end", resolve);
    stream.on("close", resolve);
  });

  // Handle incoming transaction data
  stream.on("data", (data) => {
    if (data?.transaction) {
      logTransaction(data);
    }
  });

  // Send the subscription request
  await new Promise((resolve, reject) => {
    stream.write(args, (err) => {
      err ? reject(err) : resolve();
    });
  }).catch((err) => {
    console.error(`${colors.red}Failed to send subscription request:${colors.reset}`, err);
    throw err;
  });

  console.log(`${colors.green}✓ Connected to gRPC stream${colors.reset}`);
  console.log(`${colors.cyan}Monitoring MEV Program: ${MEV_PROGRAM_ID}${colors.reset}\n`);

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
    if (!process.env.GRPC_URL || !process.env.X_TOKEN) {
      console.error(`${colors.red}Error: Missing required environment variables!${colors.reset}`);
      console.error('Please create a .env file with:');
      console.error('GRPC_URL=your_grpc_url');
      console.error('X_TOKEN=your_access_token');
      process.exit(1);
    }

    // Initialize Yellowstone gRPC client
    const client = new Client(
      process.env.GRPC_URL,
      process.env.X_TOKEN,
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
      commitment: CommitmentLevel.CONFIRMED,
    };

    console.log(`${colors.bright}${colors.green}MEV Transaction Monitor${colors.reset}`);
    console.log(`${colors.cyan}Connecting to gRPC stream...${colors.reset}\n`);

    // Start the subscription
    await subscribeCommand(client, req);
  } catch (error) {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
    process.exit(1);
  }
})();
