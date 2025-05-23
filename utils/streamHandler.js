const colors = require('./colors');

/**
 * Handle gRPC stream connection
 */
async function createStream(client, args, onData) {
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
  stream.on("data", onData);

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

  return streamClosed;
}

/**
 * Main subscription handler with auto-reconnect
 */
async function subscribeWithReconnect(client, args, onData, config) {
  console.log(`${colors.green}✓ Connected to gRPC stream${colors.reset}`);
  console.log(`${colors.cyan}Monitoring MEV Program: ${config.programId}${colors.reset}`);
  console.log(`${colors.yellow}Commitment Level: ${config.commitment}${colors.reset}`);
  console.log(`${colors.magenta}Streaming full transaction details...${colors.reset}\n`);
  
  while (true) {
    try {
      const streamClosed = await createStream(client, args, onData);
      await streamClosed;
    } catch (error) {
      console.error(`${colors.red}Stream error, reconnecting in 3 seconds...${colors.reset}`, error.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

module.exports = {
  subscribeWithReconnect
};
