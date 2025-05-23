require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

async function testRpcConnection() {
  if (!process.env.RPC_URL) {
    console.log('No RPC_URL configured in .env file');
    return;
  }
  
  console.log('Testing RPC connection to:', process.env.RPC_URL);
  
  try {
    const connection = new Connection(process.env.RPC_URL, 'confirmed');
    
    // Test 1: Get slot
    const slot = await connection.getSlot();
    console.log('✓ Current slot:', slot);
    
    // Test 2: Get version
    const version = await connection.getVersion();
    console.log('✓ Solana version:', version['solana-core']);
    
    // Test 3: Try to load a known ALT (Jupiter v6)
    const testALT = new PublicKey('D1ZN9Wj1fRSUQfCjhvnu1hqDMT7hzjzBBpi12nVniYD6');
    console.log('\nTesting Address Lookup Table fetch...');
    
    try {
      const altAccount = await connection.getAddressLookupTable(testALT);
      if (altAccount.value) {
        console.log('✓ Successfully loaded ALT');
        console.log('  Addresses in table:', altAccount.value.state.addresses.length);
      } else {
        console.log('✗ ALT not found (might be wrong network)');
      }
    } catch (error) {
      console.log('✗ Failed to load ALT:', error.message);
    }
    
    console.log('\nRPC connection is working properly!');
    
  } catch (error) {
    console.error('✗ RPC connection failed:', error.message);
    console.error('\nPlease check:');
    console.error('1. Your RPC_URL is correct');
    console.error('2. You have internet connection');
    console.error('3. The RPC endpoint is accessible');
  }
}

testRpcConnection();
