const { Connection, PublicKey } = require('@solana/web3.js');
const colors = require('./colors');
const { decodePublicKey } = require('./decoders');
const { RateLimiter } = require('./rateLimiter');

// Cache for lookup tables to avoid repeated RPC calls
const lookupTableCache = new Map();
const cacheTimestamps = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Track failed tables to avoid spamming logs
const failedTables = new Set();

// Rate limiter - adjust the number based on your RPC limits
const rateLimiter = new RateLimiter(process.env.RPC_RATE_LIMIT ? parseInt(process.env.RPC_RATE_LIMIT) : 10);

// Periodically clean up old cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of cacheTimestamps.entries()) {
    if (now - timestamp > CACHE_TTL) {
      lookupTableCache.delete(key);
      cacheTimestamps.delete(key);
      failedTables.delete(key);
    }
  }
}, 60000); // Clean up every minute

/**
 * Load address lookup table from Solana RPC
 */
async function loadAddressLookupTable(connection, tableAddress) {
  try {
    // Check cache first
    const cacheKey = tableAddress.toString();
    if (lookupTableCache.has(cacheKey)) {
      return lookupTableCache.get(cacheKey);
    }
    
    // Fetch from RPC with rate limiting and timeout
    const fetchPromise = rateLimiter.call(async () => {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );
      
      const lookupPromise = connection.getAddressLookupTable(tableAddress);
      return Promise.race([lookupPromise, timeoutPromise]);
    });
    
    const lookupTableAccount = await fetchPromise;
    
    if (!lookupTableAccount.value) {
      // Cache null result to avoid repeated failures
      lookupTableCache.set(cacheKey, null);
      cacheTimestamps.set(cacheKey, Date.now());
      return null;
    }
    
    // Cache the result
    lookupTableCache.set(cacheKey, lookupTableAccount.value);
    cacheTimestamps.set(cacheKey, Date.now());
    return lookupTableAccount.value;
  } catch (error) {
    // Cache null result to avoid repeated failures
    const cacheKey = tableAddress.toString();
    lookupTableCache.set(cacheKey, null);
    cacheTimestamps.set(cacheKey, Date.now());
    
    // Only log error once per table
    if (!failedTables.has(cacheKey)) {
      failedTables.add(cacheKey);
      if (process.env.DEBUG === 'true') {
        console.error(`${colors.yellow}Warning: Could not load ALT ${tableAddress.toString().substring(0, 8)}...${colors.reset}`);
      }
    }
    return null;
  }
}

/**
 * Resolve all accounts including those from lookup tables
 */
async function resolveAccountsWithLookupTables(accountKeys, loadedAddresses, connection) {
  const resolvedAccounts = [];
  
  // First, add all static account keys
  accountKeys.forEach((key, index) => {
    const pubkey = decodePublicKey(key);
    resolvedAccounts.push({
      index,
      pubkey,
      source: 'static'
    });
  });
  
  // If no loaded addresses, return what we have
  if (!loadedAddresses || !connection) {
    return resolvedAccounts;
  }
  
  let currentIndex = accountKeys.length;
  
  // Process writable loaded addresses
  if (loadedAddresses.writable && loadedAddresses.writable.length > 0) {
    for (const addr of loadedAddresses.writable) {
      const pubkey = decodePublicKey(addr);
      resolvedAccounts.push({
        index: currentIndex++,
        pubkey,
        source: 'alt-writable'
      });
    }
  }
  
  // Process readonly loaded addresses
  if (loadedAddresses.readonly && loadedAddresses.readonly.length > 0) {
    for (const addr of loadedAddresses.readonly) {
      const pubkey = decodePublicKey(addr);
      resolvedAccounts.push({
        index: currentIndex++,
        pubkey,
        source: 'alt-readonly'
      });
    }
  }
  
  return resolvedAccounts;
}

/**
 * Extract lookup table addresses from transaction
 */
function extractLookupTableAddresses(transaction) {
  const lookupTables = [];
  
  // Check if transaction has address table lookups
  if (transaction?.message?.addressTableLookups) {
    transaction.message.addressTableLookups.forEach(lookup => {
      if (lookup.accountKey) {
        const tableAddress = decodePublicKey(lookup.accountKey);
        lookupTables.push({
          address: tableAddress,
          writableIndexes: lookup.writableIndexes || [],
          readonlyIndexes: lookup.readonlyIndexes || []
        });
      }
    });
  }
  
  return lookupTables;
}

/**
 * Load all lookup tables used in a transaction
 */
async function loadTransactionLookupTables(transaction, connection) {
  const lookupTables = extractLookupTableAddresses(transaction);
  const loadedTables = new Map();
  
  for (const table of lookupTables) {
    const tableData = await loadAddressLookupTable(connection, new PublicKey(table.address));
    if (tableData) {
      loadedTables.set(table.address, {
        data: tableData,
        writableIndexes: table.writableIndexes,
        readonlyIndexes: table.readonlyIndexes
      });
    }
  }
  
  return loadedTables;
}

/**
 * Resolve loaded addresses from lookup tables
 */
async function resolveLoadedAddresses(transaction, meta, connection) {
  // If meta already has loaded addresses, use them
  if (meta?.loadedAddresses) {
    return meta.loadedAddresses;
  }
  
  // Otherwise, try to load from lookup tables
  const loadedTables = await loadTransactionLookupTables(transaction, connection);
  
  if (loadedTables.size === 0) {
    return null;
  }
  
  const writable = [];
  const readonly = [];
  
  // Extract addresses based on indexes
  loadedTables.forEach((tableInfo, tableAddress) => {
    const addresses = tableInfo.data.state.addresses;
    
    // Add writable addresses
    tableInfo.writableIndexes.forEach(idx => {
      if (idx < addresses.length) {
        writable.push(addresses[idx].toBytes());
      }
    });
    
    // Add readonly addresses
    tableInfo.readonlyIndexes.forEach(idx => {
      if (idx < addresses.length) {
        readonly.push(addresses[idx].toBytes());
      }
    });
  });
  
  return { writable, readonly };
}

/**
 * Get lookup table stats
 */
function getLookupTableStats() {
  const cacheHits = Array.from(lookupTableCache.values()).filter(v => v !== null).length;
  const cacheMisses = Array.from(lookupTableCache.values()).filter(v => v === null).length;
  
  return {
    cachedTables: lookupTableCache.size,
    successfulTables: cacheHits,
    failedTables: cacheMisses,
    cacheHitRate: lookupTableCache.size > 0 ? ((cacheHits / lookupTableCache.size) * 100).toFixed(1) + '%' : 'N/A',
    clearCache: () => {
      lookupTableCache.clear();
      cacheTimestamps.clear();
      failedTables.clear();
    }
  };
}

module.exports = {
  loadAddressLookupTable,
  resolveAccountsWithLookupTables,
  extractLookupTableAddresses,
  loadTransactionLookupTables,
  resolveLoadedAddresses,
  getLookupTableStats
};
