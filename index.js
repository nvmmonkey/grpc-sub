require('dotenv').config();
const Client = require("@triton-one/yellowstone-grpc").default;
const { CommitmentLevel } = require("@triton-one/yellowstone-grpc");
const { PublicKey } = require("@solana/web3.js");
const bs58 = require("bs58");

// MEV Program ID to monitor
const MEV_PROGRAM_ID = "MEViEnscUm6tsQRoGd9h6nLQaQspKj7DB2M5FwM3Xvz";

// Global counter for transactions
let transactionCount = 0;
let debugMode = true; // Enable debug mode to see raw data

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
 * Deep inspect object structure
 */
function inspectStructure(obj, path = 'root', maxDepth = 3, currentDepth = 0) {
  if (currentDepth >= maxDepth) return;
  
  const indent = '  '.repeat(currentDepth);
  
  if (obj === null || obj === undefined) {
    console.log(`${indent}${path}: ${obj}`);
    return;
  }
  
  if (obj instanceof Buffer || obj instanceof Uint8Array) {
    console.log(`${indent}${path}: [${obj.constructor.name} length=${obj.length}]`);
    return;
  }
  
  if (typeof obj !== 'object') {
    console.log(`${indent}${path}: ${typeof obj} = ${JSON.stringify(obj).substring(0, 100)}`);
    return;
  }
  
  console.log(`${indent}${path}: {`);
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      inspectStructure(obj[key], key, maxDepth, currentDepth + 1);
    }
  }
  console.log(`${indent}}`);
}

/**
 * Formats and logs transaction details from Yellowstone gRPC format
 */
function logTransaction(data) {
  try {
    transactionCount++;
    
    // Debug mode: Show raw structure for first few transactions
    if (debugMode && transactionCount <= 3) {
      console.log(`\n${colors.yellow}=== DEBUG: Raw Data Structure for Transaction #${transactionCount} ===${colors.reset}`);
      inspectStructure(data, 'data', 4);
      console.log(`${colors.yellow}=== END DEBUG ===${colors.reset}\n`);
    }
    
    // Try different paths to find the transaction data
    let txData = null;
    let signature = 'N/A';
    let slot = 'N/A';
    
    // Path 1: data.transaction
    if (data.transaction) {
      txData = data.transaction;
      slot = txData.slot || 'N/A';
      
      // Try to find signature in various locations
      if (txData.signature) {
        signature = tryDecodeSignature(txData.signature);
      } else if (txData.transaction?.signatures?.[0]) {
        signature = tryDecodeSignature(txData.transaction.signatures[0]);
      } else if (txData.transaction?.signature) {
        signature = tryDecodeSignature(txData.transaction.signature);
      }
    }
    
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.bright}${colors.green}[MEV Transaction #${transactionCount}]${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    
    console.log(`${colors.yellow}Signature:${colors.reset} ${signature}`);
    console.log(`${colors.yellow}Slot:${colors.reset} ${slot}`);
    console.log(`${colors.yellow}Time:${colors.reset} ${new Date().toISOString()}`);
    
    // Check if we have the actual transaction data
    if (!txData) {
      console.log(`${colors.red}No transaction data found at expected path${colors.reset}`);
      return;
    }
    
    // Look for message in different possible locations
    let message = null;
    if (txData.transaction?.message) {
      message = txData.transaction.message;
      console.log(`${colors.green}Found message at: txData.transaction.message${colors.reset}`);
    } else if (txData.message) {
      message = txData.message;
      console.log(`${colors.green}Found message at: txData.message${colors.reset}`);
    }
    
    if (!message) {
      console.log(`${colors.red}No message found in transaction${colors.reset}`);
      
      // Show what fields are available in txData
      if (debugMode) {
        console.log(`${colors.yellow}Available fields in txData:${colors.reset}`, Object.keys(txData));
        if (txData.transaction) {
          console.log(`${colors.yellow}Available fields in txData.transaction:${colors.reset}`, Object.keys(txData.transaction));
        }
      }
      return;
    }
    
    // Decode account keys
    const accountKeys = [];
    let accountKeysSource = null;
    
    if (message.accountKeys) {
      accountKeysSource = message.accountKeys;
    } else if (message.staticAccountKeys) {
      accountKeysSource = message.staticAccountKeys;
    } else if (message.accounts) {
      accountKeysSource = message.accounts;
    }
    
    if (accountKeysSource) {
      console.log(`${colors.green}Found ${accountKeysSource.length} account keys${colors.reset}`);
      accountKeysSource.forEach((key, idx) => {
        try {
          let decoded = tryDecodePublicKey(key);
          accountKeys.push(decoded);
          
          // Check if this is the MEV program
          if (decoded === MEV_PROGRAM_ID && idx < 5) {
            console.log(`${colors.magenta}MEV Program found at index ${idx}${colors.reset}`);
          }
        } catch (e) {
          accountKeys.push('Invalid key');
          console.error(`Error decoding key at index ${idx}:`, e.message);
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
    
    // After showing first few complete transactions, turn off debug mode
    if (transactionCount >= 3) {
      debugMode = false;
    }
    
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
    
  } catch (error) {
    console.error(`${colors.red}Error processing transaction:${colors.reset}`, error.message);
    console.error(error.stack);
  }
}

/**
 * Try to decode a signature from various formats
 */
function tryDecodeSignature(sig) {
  try {
    if (!sig) return 'N/A';
    
    // If it's already a string, return it
    if (typeof sig === 'string') {
      return sig;
    }
    
    // If it's a Buffer or Uint8Array, encode it
    if (sig instanceof Buffer || sig instanceof Uint8Array) {
      return bs58.encode(sig);
    }
    
    // If it's an array of numbers, convert to Uint8Array first
    if (Array.isArray(sig)) {
      return bs58.encode(new Uint8Array(sig));
    }
    
    // Try to convert whatever it is to a buffer
    return bs58.encode(Buffer.from(sig));
  } catch (e) {
    console.error('Signature decode error:', e.message);
    return 'Unable to decode';
  }
}

/**
 * Try to decode a public key from various formats
 */
function tryDecodePublicKey(key) {
  try {
    if (!key) return 'N/A';
    
    // If it's already a string, assume it's base58
    if (typeof key === 'string') {
      // Try to validate it's a valid public key
      new PublicKey(key);
      return key;
    }
    
    // If it's base64 encoded string in a buffer
    if (key instanceof Buffer || key instanceof Uint8Array) {
      return new PublicKey(key).toBase58();
    }
    
    // If it's an array of numbers
    if (Array.isArray(key)) {
      return new PublicKey(new Uint8Array(key)).toBase58();
    }
    
    // Try base64 decode
    return new PublicKey(Buffer.from(key, 'base64')).toBase58();
  } catch (e) {
    return 'Invalid key';
  }
}

/**
 * Test if we're receiving any data at all
 */
let dataReceivedCount = 0;
let lastDataReceivedTime = Date.now();

function checkDataFlow() {
  const now = Date.now();
  const timeSinceLastData = (now - lastDataReceivedTime) / 1000;
  
  console.log(`\n${colors.yellow}=== Stream Health Check ===${colors.reset}`);
  console.log(`Total data events received: ${dataReceivedCount}`);
  console.log(`Transactions processed: ${transactionCount}`);
  console.log(`Time since last data: ${timeSinceLastData.toFixed(1)}s`);
  
  if (dataReceivedCount === 0) {
    console.log(`${colors.red}WARNING: No data received from stream!${colors.reset}`);
    console.log(`Possible issues:`);
    console.log(`- RPC endpoint might not have the MEV program indexed`);
    console.log(`- The program ID might be incorrect`);
    console.log(`- Network connectivity issues`);
  } else if (transactionCount === 0) {
    console.log(`${colors.yellow}Receiving data but no MEV transactions found${colors.reset}`);
    console.log(`The MEV program might not be active right now`);
  }
  console.log(`${colors.yellow}===========================${colors.reset}\n`);
}

// Run health check every 30 seconds
setInterval(checkDataFlow, 30000);

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
    
    // Log every 100th data event to show we're receiving data
    if (dataReceivedCount % 100 === 0) {
      console.log(`${colors.cyan}[Stream Active] Received ${dataReceivedCount} data events${colors.reset}`);
    }
    
    // Check if this is a transaction
    if (data?.transaction) {
      logTransaction(data);
    } else if (dataReceivedCount <= 5) {
      // Show structure of non-transaction data for debugging
      console.log(`${colors.yellow}Received non-transaction data. Structure:${colors.reset}`);
      console.log(Object.keys(data));
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
  console.log(`${colors.magenta}Debug mode enabled for first 3 transactions${colors.reset}`);
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

    console.log(`${colors.bright}${colors.green}MEV Transaction Monitor v1.2 (Debug Mode)${colors.reset}`);
    console.log(`${colors.cyan}Connecting to gRPC stream...${colors.reset}`);
    console.log(`${colors.yellow}GRPC URL:${colors.reset} ${process.env.GRPC_URL}`);
    console.log(`${colors.yellow}Authentication:${colors.reset} ${process.env.X_TOKEN ? 'Enabled' : 'Disabled'}`);
    console.log(`${colors.yellow}Program Filter:${colors.reset} ${MEV_PROGRAM_ID}\n`);

    // Start the subscription
    await subscribeCommand(client, req);
  } catch (error) {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
    process.exit(1);
  }
})();
