const { PublicKey } = require("@solana/web3.js");
const bs58 = require("bs58");

/**
 * Decode base64 encoded public key with better error handling
 */
function decodePublicKey(key) {
  try {
    if (!key) {
      console.warn('decodePublicKey: Received null/undefined key');
      return 'Invalid key';
    }
    
    // If it's already a string in base58 format, return it
    if (typeof key === 'string' && key.length === 44) {
      try {
        // Validate it's a valid base58 pubkey
        new PublicKey(key);
        return key;
      } catch (e) {
        // Not a valid base58, continue to decode
      }
    }
    
    if (typeof key === 'string') {
      // Assume it's base64 encoded
      const buffer = Buffer.from(key, 'base64');
      if (buffer.length !== 32) {
        console.warn(`decodePublicKey: Invalid buffer length ${buffer.length}, expected 32`);
        return 'Invalid key length';
      }
      return new PublicKey(buffer).toBase58();
    } else if (Buffer.isBuffer(key) || key instanceof Uint8Array) {
      if (key.length !== 32) {
        console.warn(`decodePublicKey: Invalid key length ${key.length}, expected 32`);
        return 'Invalid key length';
      }
      return new PublicKey(key).toBase58();
    } else if (key.type === 'Buffer' && Array.isArray(key.data)) {
      // Handle { type: 'Buffer', data: [...] } format
      const buffer = Buffer.from(key.data);
      if (buffer.length !== 32) {
        console.warn(`decodePublicKey: Invalid buffer data length ${buffer.length}, expected 32`);
        return 'Invalid key length';
      }
      return new PublicKey(buffer).toBase58();
    } else if (Array.isArray(key)) {
      // Handle raw array format
      const buffer = Buffer.from(key);
      if (buffer.length !== 32) {
        console.warn(`decodePublicKey: Invalid array length ${buffer.length}, expected 32`);
        return 'Invalid key length';
      }
      return new PublicKey(buffer).toBase58();
    }
    
    console.warn('decodePublicKey: Unhandled key type:', typeof key, key);
    return 'Invalid key';
  } catch (e) {
    console.error('decodePublicKey error:', e.message, 'Key:', key);
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
      // If it's already base58, return it
      if (signature.length >= 87 && signature.length <= 88) {
        return signature;
      }
      // Otherwise assume base64
      return bs58.encode(Buffer.from(signature, 'base64'));
    }
    
    if (signature instanceof Buffer || signature instanceof Uint8Array) {
      return bs58.encode(signature);
    }
    
    if (Array.isArray(signature)) {
      return bs58.encode(new Uint8Array(signature));
    }
    
    if (signature.type === 'Buffer' && Array.isArray(signature.data)) {
      return bs58.encode(Buffer.from(signature.data));
    }
    
    return bs58.encode(Buffer.from(signature));
  } catch (e) {
    console.error('decodeSignature error:', e.message);
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
    } else if (data.type === 'Buffer' && Array.isArray(data.data)) {
      dataHex = Buffer.from(data.data).toString('hex');
    } else {
      dataHex = Buffer.from(data).toString('hex');
    }
    
    return {
      hex: dataHex,
      length: Math.floor(dataHex.length / 2)
    };
  } catch (e) {
    console.error('decodeInstructionData error:', e.message);
    return { hex: 'decode error', length: 0 };
  }
}

module.exports = {
  decodePublicKey,
  decodeSignature,
  formatSol,
  decodeInstructionData
};
