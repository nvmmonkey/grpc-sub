# Utility Modules

This folder contains modular utilities for the MEV Transaction Monitor.

## Files

### `colors.js`
Terminal color codes for formatted console output.

### `constants.js`
- MEV Program ID
- Common Solana program addresses
- Configuration constants

### `decoders.js`
Functions for decoding Solana data:
- `decodePublicKey()` - Decode base64 encoded public keys
- `decodeSignature()` - Decode transaction signatures
- `formatSol()` - Convert lamports to SOL
- `decodeInstructionData()` - Decode instruction data to hex

### `formatters.js`
Display formatting functions:
- `formatAccountKeys()` - Process account keys with metadata
- `displayAccountKeys()` - Display formatted account list
- `displayBalanceChanges()` - Show SOL balance changes
- `displayProgramLogs()` - Format and display program logs

### `transactionParser.js`
Main transaction parsing logic:
- `parseAndLogTransaction()` - Complete transaction parser and display

### `streamHandler.js`
gRPC stream management:
- `subscribeWithReconnect()` - Handle stream connection with auto-reconnect
- `createStream()` - Create and configure gRPC stream

## Usage

All utilities are imported by the main `index.js` file. The modular structure allows for:
- Easy testing of individual components
- Clear separation of concerns
- Reusable functions for other projects
- Simple maintenance and updates
