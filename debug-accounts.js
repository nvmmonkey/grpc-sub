require('dotenv').config();
const Client = require("@triton-one/yellowstone-grpc").default;
const { CommitmentLevel } = require("@triton-one/yellowstone-grpc");
const { MEV_PROGRAM_ID } = require('./utils/constants');
const colors = require('./utils/colors');

async function debugAccounts() {
  if (!process.env.GRPC_URL) {
    console.error('Missing GRPC_URL in .env file');
    process.exit(1);
  }

  const client = new Client(
    process.env.GRPC_URL,
    process.env.X_TOKEN || undefined,
    undefined
  );

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

  const stream = await client.subscribe();
  
  const streamClosed = new Promise((resolve, reject) => {
    stream.on("error", (error) => {
      console.log("ERROR", error);
      reject(error);
      stream.end();
    });
    stream.on("end", () => {
      resolve();
    });
    stream.on("close", () => {
      resolve();
    });
  });

  let transactionCount = 0;
  
  stream.on("data", (data) => {
    if (data?.transaction) {
      transactionCount++;
      console.log(`\n${colors.bright}${colors.green}=== Transaction #${transactionCount} ===${colors.reset}`);
      
      const txData = data.transaction;
      const tx = txData.transaction;
      
      if (tx?.transaction?.message?.accountKeys) {
        const accountKeys = tx.transaction.message.accountKeys;
        console.log(`${colors.yellow}Total account keys: ${accountKeys.length}${colors.reset}`);
        
        // Debug each account key
        accountKeys.forEach((key, index) => {
          console.log(`\n${colors.cyan}Account [${index}]:${colors.reset}`);
          console.log(`  Raw key:`, key);
          console.log(`  Type:`, typeof key);
          console.log(`  Is Buffer:`, Buffer.isBuffer(key));
          console.log(`  Is string:`, typeof key === 'string');
          
          if (key) {
            try {
              let decoded;
              if (typeof key === 'string') {
                decoded = require('./utils/decoders').decodePublicKey(key);
              } else if (Buffer.isBuffer(key) || key instanceof Uint8Array) {
                decoded = require('./utils/decoders').decodePublicKey(key);
              }
              console.log(`  Decoded: ${decoded}`);
              
              // Check if this could be the missing account
              if (index === 10) {
                console.log(`  ${colors.bright}${colors.magenta}*** This is index 10 - checking for CB9dDufT... ***${colors.reset}`);
              }
            } catch (e) {
              console.log(`  ${colors.red}Decode error: ${e.message}${colors.reset}`);
            }
          }
        });
        
        // Also check loaded addresses
        if (tx.meta?.loadedAddresses) {
          console.log(`\n${colors.yellow}Loaded addresses from ALT:${colors.reset}`);
          console.log(`  Writable: ${tx.meta.loadedAddresses.writable?.length || 0}`);
          console.log(`  Readonly: ${tx.meta.loadedAddresses.readonly?.length || 0}`);
        }
      }
      
      // Exit after first transaction for debugging
      if (transactionCount >= 1) {
        console.log(`\n${colors.green}Debug complete. Exiting...${colors.reset}`);
        stream.end();
        process.exit(0);
      }
    }
  });

  await new Promise((resolve, reject) => {
    stream.write(subscriptionRequest, (err) => {
      if (err === null || err === undefined) {
        resolve();
      } else {
        reject(err);
      }
    });
  }).catch((reason) => {
    console.error(reason);
    throw reason;
  });

  await streamClosed;
}

debugAccounts().catch(console.error);
