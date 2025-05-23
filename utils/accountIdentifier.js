const fs = require('fs');
const path = require('path');

// Load known programs and tokens
let knownPrograms = {};
let knownTokens = {};
let lookupTables = {};

try {
  const dataPath = path.join(__dirname, '..', 'data', 'known-programs.json');
  if (fs.existsSync(dataPath)) {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    knownPrograms = data.programs || {};
    knownTokens = data.tokens || {};
    lookupTables = data.lookupTables || {};
  }
} catch (error) {
  console.error('Warning: Could not load known programs data');
}

/**
 * Get human-readable name for a program or token
 */
function getAccountName(pubkey) {
  // Check if it's a known program
  if (knownPrograms[pubkey]) {
    return knownPrograms[pubkey];
  }
  
  // Check if it's a known token
  if (knownTokens[pubkey]) {
    return knownTokens[pubkey];
  }
  
  // Check if it's a lookup table
  if (lookupTables[pubkey]) {
    return lookupTables[pubkey];
  }
  
  // Return first 8 chars if unknown
  return pubkey.substring(0, 8) + '...';
}

/**
 * Check if an address is a known program
 */
function isKnownProgram(pubkey) {
  return knownPrograms.hasOwnProperty(pubkey);
}

/**
 * Check if an address is a known token
 */
function isKnownToken(pubkey) {
  return knownTokens.hasOwnProperty(pubkey);
}

/**
 * Format account for display with known names
 */
function formatAccountDisplay(pubkey, index, isWritable, isSigner) {
  const name = getAccountName(pubkey);
  const flags = [];
  
  if (isWritable) flags.push('Writable');
  if (isSigner) flags.push('Signer');
  
  const flagStr = flags.length > 0 ? ` (${flags.join(', ')})` : '';
  
  if (name === pubkey.substring(0, 8) + '...') {
    // Unknown account
    return `[${index}] ${pubkey}${flagStr}`;
  } else {
    // Known account
    return `[${index}] ${name} - ${pubkey}${flagStr}`;
  }
}

module.exports = {
  getAccountName,
  isKnownProgram,
  isKnownToken,
  formatAccountDisplay,
  knownPrograms,
  knownTokens
};
