require('dotenv').config();
const Client = require("@triton-one/yellowstone-grpc").default;
const { CommitmentLevel } = require("@triton-one/yellowstone-grpc");
const { PublicKey } = require("@solana/web3.js");
const bs58 = require("bs58");

// MEV Program ID to monitor
const MEV_PROGRAM_ID = "MEViEnscUm6tsQRoGd9h6nLQaQspKj7DB2M5FwM3Xvz";

// Global counter for transactions
let transactionCount = 0;

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
    
    // The structure from Yellowstone gRPC is: data.transaction
    const txData = data.transaction;
    if (!txData) {
      console.log(`${colors.red}No transaction data found${colors.reset}`);
      return;
    }
    
    const slot = txData.slot;
    const rawTx = txData.transaction;
    const meta = txData.meta;
    
    // Extract and decode signature
    let signature = 'N/A';
    if (rawTx?.signatures && rawTx.signatures.length > 0) {
      try {
        // Signatures come as Buffer/Uint8Array
        signature = bs58.encode(rawTx.signatures[0]);
      } catch (e) {
        console.error('Error decoding signature:', e.message);
      }
    }
    
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.bright}${colors.green}[MEV Transaction #${transactionCount}]${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    
    console.log(`${colors.yellow}Signature:${colors.reset} ${signature}`);
    console.log(`${colors.yellow}Slot:${colors.reset} ${slot}`);
    console.log(`${colors.yellow}Time:${colors.reset} ${new Date().toISOString()}`);
    
    // Parse message
    const message = rawTx?.message;
    if (!message) {
      console.log(`${colors.red}No message found in transaction${colors.reset}`);
      return;
    }
    
    // Decode account keys
    const accountKeys = [];
    if (message.accountKeys) {
      message.accountKeys.forEach((key) => {
        try {
          // Account keys come as base64 encoded strings or buffers
          if (typeof key === 'string') {
            accountKeys.push(new PublicKey(Buffer.from(key, 'base64')).toBase58());
          } else {
            accountKeys.push(new PublicKey(key).toBase58());
          }
        } catch (e) {
          accountKeys.push('Invalid key');
        }
      });
    }
    
    // Display account keys
    if (accountKeys.length > 0) {
      console.log(`\n${colors.bright}${colors.blue}Account Keys:${colors.reset}`);
      accountKeys.forEach((pubkey, index) => {
        let accountType = [];
        
        // Check account properties from header
        if (message.header) {
          const header = message.header;
          const isWritable = index < header.numRequiredSignatures - header.numReadonlySignedAccounts ||
                            (index >= header.numRequiredSignatures && 
                             index < accountKeys.length - header.numReadonlyUnsignedAccounts);
          const isSigner = index < header.numRequiredSignatures;
          
          if (isSigner) accountType.push(`${colors.green}signer${colors.reset}`);
          if (isWritable) accountType.push(`${colors.yellow}writable${colors.reset}`);
        }
        
        if (pubkey === MEV_PROGRAM_ID) accountType.push(`${colors.magenta}MEV Program${colors.reset}`);
        
        console.log(`  [${index}] ${pubkey} ${accountType.length > 0 ? `(${accountType.join(', ')})` : ''}`);
      });
    }
    
    // Parse instructions
    if (message.instructions && message.instructions.length > 0) {
      console.log(`\n${colors.bright}${colors.blue}Instructions:${colors.reset}`);
      message.instructions.forEach((ix, index) => {
        const programId = accountKeys[ix.programIdIndex] || `Unknown (index: ${ix.programIdIndex})`;
        console.log(`  [${index}] Program: ${programId}`);
        
        // Decode instruction data
        if (ix.data) {
          try {
            let dataHex;
            if (typeof ix.data === 'string') {
              // Base64 encoded
              dataHex = Buffer.from(ix.data, 'base64').toString('hex');
            } else {
              // Buffer or Uint8Array
              dataHex = Buffer.from(ix.data).toString('hex');
            }
            console.log(`      Data: ${dataHex.substring(0, 64)}${dataHex.length > 64 ? '...' : ''}`);
          } catch (e) {
            console.log(`      Data: Unable to decode`);
          }
        }
        
        // Account indices
        if (ix.accounts && ix.accounts.length > 0) {
          const accountsList = ix.accounts.map(idx => `${idx}(${accountKeys[idx] ? accountKeys[idx].substring(0, 8) + '...' : 'unknown'})`);
          console.log(`      Accounts: [${accountsList.join(', ')}]`);
        }
      });
    }
    
    // Transaction metadata
    if (meta) {
      const status = meta.err || meta.errorInfo ? `${colors.red}Failed${colors.reset}` : `${colors.green}Success${colors.reset}`;
      
      console.log(`\n${colors.bright}${colors.blue}Transaction Result:${colors.reset}`);
      console.log(`  Status: ${status}`);
      
      if (meta.err || meta.errorInfo) {
        console.log(`  ${colors.red}Error:${colors.reset} ${JSON.stringify(meta.err || meta.errorInfo)}`);
      }
      
      if (meta.fee) {
        console.log(`  Fee: ${meta.fee} lamports`);
      }
      
      if (meta.computeUnitsConsumed) {
        console.log(`  Compute Units: ${meta.computeUnitsConsumed}`);
      }
      
      // Balance changes
      if (meta.preBalances && meta.postBalances) {
        const balanceChanges = [];
        meta.preBalances.forEach((preBalance, index) => {
          const postBalance = meta.postBalances[index];
          const change = postBalance - preBalance;
          if (change !== 0) {
            const pubkey = accountKeys[index] || `Account[${index}]`;
            balanceChanges.push({ pubkey, change });
          }
        });
        
        if (balanceChanges.length > 0) {
          console.log(`\n${colors.bright}${colors.blue}Balance Changes:${colors.reset}`);
          balanceChanges.forEach(({ pubkey, change }) => {
            const changeStr = change > 0 ? `+${change}` : `${change}`;
            const changeColor = change > 0 ? colors.green : colors.red;
            console.log(`  ${pubkey}: ${changeColor}${changeStr}${colors.reset} lamports`);
          });
        }
      }
      
      // Log messages
      if (meta.logMessages && meta.logMessages.length > 0) {
        console.log(`\n${colors.bright}${colors.blue}Program Logs:${colors.reset}`);
        meta.logMessages.forEach((log, index) => {
          // Highlight MEV program logs
          if (log.includes(MEV_PROGRAM_ID)) {
            console.log(`  ${colors.magenta}[${index}] ${log}${colors.reset}`);
          } else {
            console.log(`  [${index}] ${log}`);
          }
        });
      }
    }
    
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
    
  } catch (error) {
    console.error(`${colors.red}Error processing transaction:${colors.reset}`, error.message);
    console.error(error.stack);
    
    // Debug output on first error
    if (!global.errorLogged) {
      console.log(`\n${colors.yellow}Debug - Raw data structure:${colors.reset}`);
      try {
        const debugData = JSON.stringify(data, (key, value) => {
          if (value instanceof Uint8Array || value instanceof Buffer) {
            return `[${value.constructor.name} length=${value.length}]`;
          }
          return value;
        }, 2);
        console.log(debugData.substring(0, 1000) + (debugData.length > 1000 ? '...' : ''));
      } catch (e) {
        console.log('Unable to stringify data for debugging');
      }
      global.errorLogged = true;
    }
  }
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
    // X_TOKEN is optional - some gRPC endpoints don't require authentication
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

    console.log(`${colors.bright}${colors.green}MEV Transaction Monitor v1.1${colors.reset}`);
    console.log(`${colors.cyan}Connecting to gRPC stream...${colors.reset}`);
    console.log(`${colors.yellow}GRPC URL:${colors.reset} ${process.env.GRPC_URL}`);
    console.log(`${colors.yellow}Authentication:${colors.reset} ${process.env.X_TOKEN ? 'Enabled' : 'Disabled'}\n`);

    // Start the subscription
    await subscribeCommand(client, req);
  } catch (error) {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
    process.exit(1);
  }
})();
