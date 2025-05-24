// Test decoding of the specific account that's missing
const { decodePublicKey } = require('./utils/decoders');
const colors = require('./utils/colors');
const bs58 = require('bs58');
const { PublicKey } = require('@solana/web3.js');

// Get the correct byte representation of CB9dDufT3ZuQXqqSfa1c5kY935TEreyBw9XJXxHKpump
const targetPubkey = 'CB9dDufT3ZuQXqqSfa1c5kY935TEreyBw9XJXxHKpump';
const pubkeyBytes = bs58.decode(targetPubkey);
const base64Encoded = Buffer.from(pubkeyBytes).toString('base64');

console.log(`${colors.bright}${colors.green}Testing decodePublicKey for ${targetPubkey}${colors.reset}\n`);
console.log(`Correct byte representation:`);
console.log(`  Bytes: [${Array.from(pubkeyBytes).join(', ')}]`);
console.log(`  Base64: ${base64Encoded}`);
console.log(`  Hex: ${Buffer.from(pubkeyBytes).toString('hex')}\n`);

// Test different formats that might be coming from gRPC
const testCases = [
  {
    name: "Base58 string",
    input: targetPubkey
  },
  {
    name: "Base64 encoded buffer (correct)",
    input: base64Encoded
  },
  {
    name: "Raw buffer",
    input: Buffer.from(pubkeyBytes)
  },
  {
    name: "Buffer-like object",
    input: {
      type: 'Buffer',
      data: Array.from(pubkeyBytes)
    }
  },
  {
    name: "Raw array",
    input: Array.from(pubkeyBytes)
  }
];

testCases.forEach((testCase) => {
  console.log(`${colors.yellow}Test: ${testCase.name}${colors.reset}`);
  console.log(`Input:`, testCase.input);
  
  try {
    const result = decodePublicKey(testCase.input);
    console.log(`Result: ${colors.green}${result}${colors.reset}`);
    
    if (result === targetPubkey) {
      console.log(`${colors.bright}${colors.green}✓ SUCCESS - Correctly decoded!${colors.reset}`);
    } else {
      console.log(`${colors.red}✗ FAILED - Expected ${targetPubkey}, got ${result}${colors.reset}`);
    }
  } catch (error) {
    console.log(`${colors.red}✗ ERROR: ${error.message}${colors.reset}`);
  }
  
  console.log('---\n');
});

// Also test if the issue is with a null/undefined value
console.log(`${colors.yellow}Test: null value${colors.reset}`);
console.log(`Result: ${decodePublicKey(null)}`);

console.log(`\n${colors.yellow}Test: undefined value${colors.reset}`);
console.log(`Result: ${decodePublicKey(undefined)}`);

console.log(`\n${colors.yellow}Test: empty string${colors.reset}`);
console.log(`Result: ${decodePublicKey('')}`);

// Test with the actual moonpig account from Solscan
console.log(`\n${colors.bright}${colors.cyan}Testing moonpig account (Ai3eKAWjzKMV8wRwd41nVP83yqfbAVJykhvJVPxspump)${colors.reset}`);
const moonpigPubkey = 'Ai3eKAWjzKMV8wRwd41nVP83yqfbAVJykhvJVPxspump';
const moonpigBytes = bs58.decode(moonpigPubkey);
const moonpigBase64 = Buffer.from(moonpigBytes).toString('base64');

console.log(`Moonpig byte representation:`);
console.log(`  Base64: ${moonpigBase64}`);
console.log(`  Decoded: ${decodePublicKey(moonpigBase64)}`);
