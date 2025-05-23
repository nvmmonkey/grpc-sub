const { Connection, PublicKey } = require('@solana/web3.js');
const colors = require('./colors');
const { decodePublicKey } = require('./decoders');

// Cache for lookup tables to avoid repeated RPC calls
const lookupTableCache = new Map();

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
    
    // Fetch from RPC
    const lookupTableAccount = await connection.getAddressLookupTable(tableAddress);
    
    if (!lookupTableAccount.value) {
      console.warn(`${colors.yellow}Warning: Could not load lookup table ${tableAddress.toString()}${colors.reset}`);
      return null;
    }
    
    // Cache the result
    lookupTableCache.set(cacheKey, lookupTableAccount.value);
    return lookupTableAccount.value;
  } catch (error) {
    console.error(`${colors.red}Error loading lookup table ${tableAddress.toString()}:${colors.reset}`, error.message);
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
  return {
    cachedTables: lookupTableCache.size,
    clearCache: () => lookupTableCache.clear()
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
