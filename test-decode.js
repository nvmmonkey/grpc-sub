// Test decoding of the specific account that's missing
const { decodePublicKey } = require('./utils/decoders');
const colors = require('./utils/colors');

// Test different formats that might be coming from gRPC
const testCases = [
  {
    name: "Base58 string (expected: CB9dDufT3ZuQXqqSfa1c5kY935TEreyBw9XJXxHKpump)",
    input: "CB9dDufT3ZuQXqqSfa1c5kY935TEreyBw9XJXxHKpump"
  },
  {
    name: "Base64 encoded buffer",
    // This is CB9dDufT3ZuQXqqSfa1c5kY935TEreyBw9XJXxHKpump encoded as base64
    input: Buffer.from([
      156, 202, 204, 221, 77, 82, 61, 79, 200, 174, 75, 63, 229, 137, 113, 168,
      104, 113, 116, 10, 238, 254, 228, 92, 136, 166, 74, 193, 184, 236, 208, 1
    ]).toString('base64')
  },
  {
    name: "Raw buffer",
    input: Buffer.from([
      156, 202, 204, 221, 77, 82, 61, 79, 200, 174, 75, 63, 229, 137, 113, 168,
      104, 113, 116, 10, 238, 254, 228, 92, 136, 166, 74, 193, 184, 236, 208, 1
    ])
  },
  {
    name: "Buffer-like object",
    input: {
      type: 'Buffer',
      data: [156, 202, 204, 221, 77, 82, 61, 79, 200, 174, 75, 63, 229, 137, 113, 168,
             104, 113, 116, 10, 238, 254, 228, 92, 136, 166, 74, 193, 184, 236, 208, 1]
    }
  },
  {
    name: "Raw array",
    input: [156, 202, 204, 221, 77, 82, 61, 79, 200, 174, 75, 63, 229, 137, 113, 168,
            104, 113, 116, 10, 238, 254, 228, 92, 136, 166, 74, 193, 184, 236, 208, 1]
  }
];

console.log(`${colors.bright}${colors.green}Testing decodePublicKey for CB9dDufT3ZuQXqqSfa1c5kY935TEreyBw9XJXxHKpump${colors.reset}\n`);

testCases.forEach((testCase) => {
  console.log(`${colors.yellow}Test: ${testCase.name}${colors.reset}`);
  console.log(`Input:`, testCase.input);
  
  try {
    const result = decodePublicKey(testCase.input);
    console.log(`Result: ${colors.green}${result}${colors.reset}`);
    
    if (result === 'CB9dDufT3ZuQXqqSfa1c5kY935TEreyBw9XJXxHKpump') {
      console.log(`${colors.bright}${colors.green}✓ SUCCESS - Correctly decoded!${colors.reset}`);
    } else {
      console.log(`${colors.red}✗ FAILED - Got different result${colors.reset}`);
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
