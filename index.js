require('dotenv').config();
const Client = require("@triton-one/yellowstone-grpc").default;
const { CommitmentLevel } = require("@triton-one/yellowstone-grpc");
const { PublicKey } = require("@solana/web3.js");
const bs58 = require("bs58");

// MEV Program ID to monitor
const MEV_PROGRAM_ID = "MEViEnscUm6tsQRoGd9h6nLQaQspKj7DB2M5FwM3Xvz";

// Global counter for transactions
let transactionCount = 0;
let emptyTransactionCount = 0;

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
 * Safely encode bytes to base58
 */
function safeEncode(data) {
  try {
    if (!data) return 'N/A';
    if (typeof data === 'string') return data;
    if (data instanceof Buffer || data instanceof Uint8Array) {
      return bs58.encode(data);
    }
    // Try to convert to buffer if possible
    return bs58.encode(Buffer.from(data));
  } catch (e) {
    return 'Unable to decode';
  }
}

/**
 * Formats and logs transaction details
 */
function logTransaction(data) {
  try {
    transactionCount++;
    
    // Extract transaction data based on Yellowstone gRPC structure
    const txData = data.transaction;
    
    // The signature might be at the root level of transaction
    let signature = 'N/A';
    if (data.signature) {
      signature = safeEncode(data.signature);
    } else if (txData.signature) {
      signature = safeEncode(txData.signature);
    } else if (txData.transaction?.signatures?.[0]) {
      signature = safeEncode(txData.transaction.signatures[0]);
    }
    
    // Basic transaction info
    const slot = txData.slot || data.slot || 'N/A';
    
    // If we don't have meaningful data, just count it
    if (signature === 'N/A' && (!txData.transaction || !txData.meta)) {
      emptyTransactionCount++;
      // Only show summary every 10 empty transactions
      if (emptyTransactionCount % 10 === 0) {
        console.log(`${colors.yellow}[Summary] Received ${emptyTransactionCount} transactions without details (slot: ${slot})${colors.reset}`);
      }
      return;
    }
    
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.bright}${colors.green}[MEV Transaction Detected #${transactionCount}]${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    
    // Debug: Let's see what we're actually receiving (only for first transaction with data)
    if (!global.debugLogged && (signature !== 'N/A' || txData.transaction)) {
      console.log(`${colors.yellow}Debug - Full data structure:${colors.reset}`);
      const debugData = JSON.stringify(data, (key, value) => {
        if (value instanceof Uint8Array || value instanceof Buffer) {
          return `[${value.constructor.name} length=${value.length}]`;
        }
        return value;
      }, 2);
      console.log(debugData.substring(0, 2000) + (debugData.length > 2000 ? '...' : ''));
      global.debugLogged = true;
    }
    
    console.log(`${colors.yellow}Signature:${colors.reset} ${signature}`);
    console.log(`${colors.yellow}Slot:${colors.reset} ${slot}`);
    console.log(`${colors.yellow}Time:${colors.reset} ${new Date().toISOString()}`);
    
    // Check if we have transaction details
    if (txData.transaction) {
      const tx = txData.transaction;
      
      // Handle versioned or legacy transaction
      const message = tx.message || tx;
      
      // Extract account keys
      let accountKeys = [];
      if (message.accountKeys) {
        accountKeys = message.accountKeys;
      } else if (message.staticAccountKeys) {
        accountKeys = message.staticAccountKeys;
      } else if (Array.isArray(message.accounts)) {
        accountKeys = message.accounts;
      }
      
      if (accountKeys.length > 0) {
        console.log(`\n${colors.bright}${colors.blue}Account Keys:${colors.reset}`);
        accountKeys.forEach((key, index) => {
          const pubkey = safeEncode(key);
          
          // Try to determine account properties
          let accountType = [];
          if (message.header) {
            const isWritable = index < message.header.numRequiredSignatures - message.header.numReadonlySignedAccounts ||
                              (index >= message.header.numRequiredSignatures && 
                               index < accountKeys.length - message.header.numReadonlyUnsignedAccounts);
            const isSigner = index < message.header.numRequiredSignatures;
            
            if (isSigner) accountType.push(`${colors.green}signer${colors.reset}`);
            if (isWritable) accountType.push(`${colors.yellow}writable${colors.reset}`);
          }
          
          if (pubkey === MEV_PROGRAM_ID) accountType.push(`${colors.magenta}MEV Program${colors.reset}`);
          
          console.log(`  [${index}] ${pubkey} ${accountType.length > 0 ? `(${accountType.join(', ')})` : ''}`);
        });
      }
      
      // Extract instructions
      const instructions = message.instructions || message.compiledInstructions || [];
      if (instructions.length > 0) {
        console.log(`\n${colors.bright}${colors.blue}Instructions:${colors.reset}`);
        instructions.forEach((ix, index) => {
          let programId = 'Unknown';
          
          // Get program ID
          if (typeof ix.programIdIndex === 'number' && accountKeys[ix.programIdIndex]) {
            programId = safeEncode(accountKeys[ix.programIdIndex]);
          } else if (ix.programId) {
            programId = safeEncode(ix.programId);
          }
          
          console.log(`  [${index}] Program: ${programId}`);
          
          // Instruction data
          if (ix.data) {
            const dataHex = Buffer.from(ix.data).toString('hex');
            console.log(`      Data: ${dataHex.substring(0, 64)}${dataHex.length > 64 ? '...' : ''}`);
          }
          
          // Account indices
          if (ix.accountKeyIndexes || ix.accounts) {
            const accounts = ix.accountKeyIndexes || ix.accounts;
            console.log(`      Account Indices: [${accounts.join(', ')}]`);
          }
        });
      }
    }
    
    // Transaction metadata
    if (txData.meta) {
      const meta = txData.meta;
      const status = meta.err ? `${colors.red}Failed${colors.reset}` : `${colors.green}Success${colors.reset}`;
      
      console.log(`\n${colors.bright}${colors.blue}Status:${colors.reset} ${status}`);
      
      if (meta.err) {
        console.log(`${colors.red}Error:${colors.reset} ${JSON.stringify(meta.err)}`);
      }
      
      if (meta.fee) {
        console.log(`${colors.yellow}Fee:${colors.reset} ${meta.fee} lamports`);
      }
      
      if (meta.computeUnitsConsumed) {
        console.log(`${colors.yellow}Compute Units:${colors.reset} ${meta.computeUnitsConsumed}`);
      }
      
      // Balance changes
      if (meta.preBalances && meta.postBalances && txData.transaction) {
        const accountKeys = txData.transaction.message?.accountKeys || 
                           txData.transaction.message?.staticAccountKeys || 
                           [];
        
        console.log(`\n${colors.bright}${colors.blue}Balance Changes:${colors.reset}`);
        meta.preBalances.forEach((preBalance, index) => {
          const postBalance = meta.postBalances[index];
          const change = postBalance - preBalance;
          if (change !== 0) {
            const pubkey = accountKeys[index] ? safeEncode(accountKeys[index]) : `Account [${index}]`;
            const changeStr = change > 0 ? `+${change}` : `${change}`;
            const changeColor = change > 0 ? colors.green : colors.red;
            console.log(`  ${pubkey}: ${changeColor}${changeStr}${colors.reset} lamports`);
          }
        });
      }
      
      // Logs
      if (meta.logMessages && meta.logMessages.length > 0) {
        console.log(`\n${colors.bright}${colors.blue}Logs:${colors.reset}`);
        meta.logMessages.forEach((log, index) => {
          console.log(`  [${index}] ${log}`);
        });
      }
    }
    
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
    
  } catch (error) {
    console.error(`${colors.red}Error processing transaction:${colors.reset}`, error.message);
    console.error(error.stack);
    
    // Log raw data for debugging
    console.log(`${colors.yellow}Raw data structure:${colors.reset}`);
    try {
      // Create a simplified version for logging
      const simplified = JSON.stringify(data, (key, value) => {
        if (value instanceof Uint8Array || value instanceof Buffer) {
          return `[${value.constructor.name} length=${value.length}]`;
        }
        return value;
      }, 2);
      console.log(simplified);
    } catch (e) {
      console.log('Unable to stringify raw data');
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

    console.log(`${colors.bright}${colors.green}MEV Transaction Monitor v1.0${colors.reset}`);
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
