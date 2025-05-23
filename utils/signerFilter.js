const fs = require('fs');
const path = require('path');
const colors = require('./colors');

/**
 * Load signer addresses from JSON file
 */
function loadSignerAddresses() {
  try {
    const filePath = path.join(__dirname, '..', 'onchain-sniper-address.json');
    
    if (!fs.existsSync(filePath)) {
      console.log(`${colors.yellow}Warning: onchain-sniper-address.json not found${colors.reset}`);
      return [];
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const addresses = JSON.parse(fileContent);
    
    // Filter only active addresses
    const activeAddresses = addresses.filter(addr => addr.active);
    
    console.log(`${colors.green}Loaded ${activeAddresses.length} active signer addresses${colors.reset}`);
    activeAddresses.forEach(addr => {
      console.log(`  - ${addr.name}: ${addr.address}`);
    });
    
    return activeAddresses.map(addr => addr.address);
  } catch (error) {
    console.error(`${colors.red}Error loading signer addresses:${colors.reset}`, error.message);
    return [];
  }
}

/**
 * Check if transaction has any of the specified signers
 */
function hasTargetSigner(accountKeys, header, targetSigners) {
  if (!header || !targetSigners || targetSigners.length === 0) {
    return false;
  }
  
  // Check only signer accounts (first numRequiredSignatures accounts)
  for (let i = 0; i < header.numRequiredSignatures && i < accountKeys.length; i++) {
    if (targetSigners.includes(accountKeys[i].pubkey)) {
      return {
        found: true,
        signerAddress: accountKeys[i].pubkey,
        signerIndex: i
      };
    }
  }
  
  return { found: false };
}

module.exports = {
  loadSignerAddresses,
  hasTargetSigner
};
