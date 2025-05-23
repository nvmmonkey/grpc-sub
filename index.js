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
  white: '\x1b[37m',
};

/**
 * Decode base64 encoded public key
 */
function decodePublicKey(key) {
  try {
    if (typeof key === 'string') {
      return new PublicKey(Buffer.from(key, 'base64')).toBase58();
    } else if (Buffer.isBuffer(key) || key instanceof Uint8Array) {
      return new PublicKey(key).toBase58();
    }
    return 'Invalid key';
  } catch (e) {
    return 'Decode error';
  }
}

/**
 * Format SOL amount from lamports
 */
function formatSol(lamports) {
  return (lamports / 1e9).toFixed(9).replace(/\.?0+$/, '');
}

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
    
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.bright}${colors.green}[MEV Transaction #${transactionCount}]${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    
    console.log(`${colors.yellow}Signature:${colors.reset} ${signature}`);
    console.log(`${colors.yellow}Slot:${colors.reset} ${slot}`);
    console.log(`${colors.yellow}Index:${colors.reset} ${txInfo.index}`);
    console.log(`${colors.yellow}Time:${colors.reset} ${new Date().toISOString()}`);
    
    // Process transaction content
    const tx = txInfo.transaction;
    const meta = txInfo.meta;
    
    // Initialize accountKeys at the top level
    let accountKeys = [];
    
    if (tx && tx.message) {
      const message = tx.message;
      
      // Decode account keys
      if (message.accountKeys) {
        console.log(`\n${colors.bright}${colors.blue}Account Keys (${message.accountKeys.length} total):${colors.reset}`);
        
        message.accountKeys.forEach((key, index) => {
          const pubkey = decodePublicKey(key);
          accountKeys.push(pubkey);
          
          // Determine account type
          let accountType = [];
          if (message.header) {
            const header = message.header;
            const isWritable = index < header.numRequiredSignatures - header.numReadonlySignedAccounts ||
                              (index >= header.numRequiredSignatures && 
                               index < accountKeys.length - header.numReadonlyUnsignedAccounts);
            const isSigner = index < header.numRequiredSignatures;
            
            if (isSigner) accountType.push(`${colors.green}signer${colors.reset}`);
            if (isWritable) accountType.push(`${colors.yellow}writable${colors.reset}`);
          }
          
          if (pubkey === MEV_PROGRAM_ID) {
            accountType.push(`${colors.bright}${colors.magenta}◆ MEV PROGRAM ◆${colors.reset}`);
          }
          
          // Show first 10 accounts in detail
          if (index < 10 || pubkey === MEV_PROGRAM_ID) {
            console.log(`  [${index.toString().padStart(2)}] ${pubkey} ${accountType.length > 0 ? `(${accountType.join(', ')})` : ''}`);
          } else if (index === 10) {
            console.log(`  ... and ${accountKeys.length - 10} more accounts`);
          }
        });
      }
      
      // Process instructions
      if (message.instructions && message.instructions.length > 0) {
        console.log(`\n${colors.bright}${colors.blue}Instructions (${message.instructions.length} total):${colors.reset}`);
        
        message.instructions.forEach((ix, index) => {
          const programId = accountKeys[ix.programIdIndex] || `Unknown (index: ${ix.programIdIndex})`;
          const isMevInstruction = programId === MEV_PROGRAM_ID;
          
          if (isMevInstruction) {
            console.log(`  ${colors.bright}${colors.magenta}[${index}] ◆ MEV Program Instruction ◆${colors.reset}`);
          } else {
            console.log(`  [${index}] Program: ${programId}`);
          }
          
          // Decode instruction data
          if (ix.data) {
            let dataHex;
            if (typeof ix.data === 'string') {
              dataHex = Buffer.from(ix.data, 'base64').toString('hex');
            } else {
              dataHex = Buffer.from(ix.data).toString('hex');
            }
            
            // Show first 32 bytes of data
            const displayData = dataHex.length > 64 ? dataHex.substring(0, 64) + '...' : dataHex;
            console.log(`      Data: ${displayData} (${Math.floor(dataHex.length / 2)} bytes)`);
          }
          
          // Show accounts used
          if (ix.accounts && ix.accounts.length > 0) {
            const accountsInfo = [];
            
            // Process first 5 accounts
            for (let i = 0; i < Math.min(5, ix.accounts.length); i++) {
              const idx = ix.accounts[i];
              const key = accountKeys[idx];
              if (key) {
                accountsInfo.push(`[${idx}] ${key.substring(0, 8)}...`);
              } else {
                accountsInfo.push(`[${idx}]`);
              }
            }
            
            // Add "more" indicator if needed
            if (ix.accounts.length > 5) {
              accountsInfo.push(`+${ix.accounts.length - 5} more`);
            }
            
            console.log(`      Accounts: ${accountsInfo.join(', ')}`);
          }
        });
      }
      
      // Process inner instructions
      if (meta && meta.innerInstructions && meta.innerInstructions.length > 0) {
        console.log(`\n${colors.bright}${colors.blue}Inner Instructions:${colors.reset}`);
        meta.innerInstructions.forEach((inner) => {
          console.log(`  From instruction [${inner.index}]:`);
          inner.instructions.forEach((innerIx, idx) => {
            const programId = accountKeys[innerIx.programIdIndex] || `Unknown`;
            console.log(`    [${idx}] ${programId.substring(0, 44)}...`);
          });
        });
      }
    }
    
    // Process metadata
    if (meta) {
      // Transaction status
      const status = meta.err || meta.errorInfo ? `${colors.red}✗ Failed${colors.reset}` : `${colors.green}✓ Success${colors.reset}`;
      console.log(`\n${colors.bright}${colors.blue}Transaction Result:${colors.reset}`);
      console.log(`  Status: ${status}`);
      
      if (meta.err || meta.errorInfo) {
        console.log(`  ${colors.red}Error:${colors.reset} ${JSON.stringify(meta.err || meta.errorInfo)}`);
      }
      
      // Fees and compute
      if (meta.fee) {
        console.log(`  Fee: ${colors.yellow}◎ ${formatSol(meta.fee)}${colors.reset} SOL`);
      }
      
      if (meta.computeUnitsConsumed) {
        const maxUnits = 1400000; // Max compute units
        const percentage = ((meta.computeUnitsConsumed / maxUnits) * 100).toFixed(1);
        console.log(`  Compute Units: ${colors.cyan}${meta.computeUnitsConsumed.toLocaleString()}${colors.reset} (${percentage}% of max)`);
      }
      
      // Balance changes
      if (meta.preBalances && meta.postBalances && accountKeys.length > 0) {
        const significantChanges = [];
        
        meta.preBalances.forEach((preBalance, index) => {
          const postBalance = meta.postBalances[index];
          const change = postBalance - preBalance;
          
          if (change !== 0 && accountKeys[index]) {
            significantChanges.push({
              pubkey: accountKeys[index],
              change,
              isMev: accountKeys[index] === MEV_PROGRAM_ID
            });
          }
        });
        
        if (significantChanges.length > 0) {
          console.log(`\n${colors.bright}${colors.blue}Balance Changes:${colors.reset}`);
          
          // Sort by absolute change amount
          significantChanges.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
          
          // Show top 5 changes
          significantChanges.slice(0, 5).forEach(({ pubkey, change, isMev }) => {
            const changeStr = change > 0 ? `+${formatSol(change)}` : formatSol(change);
            const changeColor = change > 0 ? colors.green : colors.red;
            const prefix = isMev ? `${colors.magenta}◆ MEV${colors.reset} ` : '';
            console.log(`  ${prefix}${pubkey.substring(0, 20)}...  ${changeColor}${changeStr} SOL${colors.reset}`);
          });
          
          if (significantChanges.length > 5) {
            console.log(`  ... and ${significantChanges.length - 5} more balance changes`);
          }
        }
      }
      
      // Token balance changes
      if (meta.postTokenBalances && meta.postTokenBalances.length > 0) {
        console.log(`\n${colors.bright}${colors.blue}Token Transfers:${colors.reset} ${meta.postTokenBalances.length} token balance(s) affected`);
      }
      
      // Log messages
      if (meta.logMessages && meta.logMessages.length > 0) {
        console.log(`\n${colors.bright}${colors.blue}Program Logs:${colors.reset}`);
        
        let mevLogs = [];
        let otherLogs = [];
        
        meta.logMessages.forEach((log) => {
          if (log.includes(MEV_PROGRAM_ID) || log.includes('Program log: MEV')) {
            mevLogs.push(log);
          } else {
            otherLogs.push(log);
          }
        });
        
        // Show MEV logs first
        if (mevLogs.length > 0) {
          console.log(`  ${colors.magenta}◆ MEV Program Logs:${colors.reset}`);
          mevLogs.slice(0, 10).forEach((log, idx) => {
            console.log(`    ${colors.magenta}[${idx}]${colors.reset} ${log}`);
          });
        }
        
        // Show other logs
        if (otherLogs.length > 0) {
          console.log(`  Other Logs (${otherLogs.length} total):`);
          otherLogs.slice(0, 5).forEach((log, idx) => {
            console.log(`    [${idx}] ${log.substring(0, 100)}${log.length > 100 ? '...' : ''}`);
          });
          
          if (otherLogs.length > 5) {
            console.log(`    ... and ${otherLogs.length - 5} more logs`);
          }
        }
      }
    }
    
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
    
  } catch (error) {
    console.error(`${colors.red}Error processing transaction:${colors.reset}`, error.message);
    console.error(error.stack);
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
  console.log(`${colors.magenta}Streaming full transaction details...${colors.reset}\n`);

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

    console.log(`${colors.bright}${colors.green}MEV Transaction Monitor v2.1${colors.reset}`);
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
