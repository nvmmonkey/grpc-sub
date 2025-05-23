const { PublicKey } = require("@solana/web3.js");
const bs58 = require("bs58");

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
 * Decode signature from various formats
 */
function decodeSignature(signature) {
  try {
    if (!signature) return 'N/A';
    
    if (typeof signature === 'string') {
      return signature;
    }
    
    if (signature instanceof Buffer || signature instanceof Uint8Array) {
      return bs58.encode(signature);
    }
    
    if (Array.isArray(signature)) {
      return bs58.encode(new Uint8Array(signature));
    }
    
    return bs58.encode(Buffer.from(signature));
  } catch (e) {
    return 'Unable to decode';
  }
}

/**
 * Format SOL amount from lamports
 */
function formatSol(lamports) {
  return (lamports / 1e9).toFixed(9).replace(/\.?0+$/, '');
}

/**
 * Decode instruction data from base64 or buffer
 */
function decodeInstructionData(data) {
  try {
    if (!data) return { hex: '', length: 0 };
    
    let dataHex;
    if (typeof data === 'string') {
      dataHex = Buffer.from(data, 'base64').toString('hex');
    } else {
      dataHex = Buffer.from(data).toString('hex');
    }
    
    return {
      hex: dataHex,
      length: Math.floor(dataHex.length / 2)
    };
  } catch (e) {
    return { hex: 'decode error', length: 0 };
  }
}

module.exports = {
  decodePublicKey,
  decodeSignature,
  formatSol,
  decodeInstructionData
};
