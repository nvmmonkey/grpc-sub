# MEV Bot Analyzer

A comprehensive tool for monitoring and analyzing MEV (Maximum Extractable Value) bot activities on Solana.

## Features

### Real-time Monitoring
1. **Raw Subscription** - Monitor all MEV transactions in real-time
2. **Filtered Mode** - Monitor only transactions from specific signers (configured in `onchain-sniper-address.json`)
3. **Save Mode** - Save transaction details for later analysis (max 100 transactions)

### Analysis Tools
4. **Analyze Specific Signer** - Deep dive into a single signer's activity
5. **Analyze All Signers** - Compare all signers' performance and patterns

## Key Metrics Tracked

### Transaction Types
- **Spam Transactions**: Single balance change (only fee paid)
- **Jito Transactions**: Tips sent to Jito validators
  - Direct transfers
  - Separate account transfers (bypassing tip limits)

### Per Signer Analysis
- Total transactions (successful vs failed)
- Success rate
- Spam tip ranges (min/max/average)
- Jito tip ranges (min/max/average)
- Most traded mints
- Most used DEX pools
- Time range of activity

### Supported DEXs
- Raydium (v4, CLMM, CPMM)
- Meteora DLMM
- Orca Whirlpool
- Pump.fun
- And more...

## Usage

### Start the Monitor
```bash
npm start
```

### Generate Reports
```bash
npm run report
```

This generates:
- `signer-analysis-report.json` - Detailed JSON report
- `signer-analysis-report.csv` - CSV for spreadsheet analysis

### Other Commands
```bash
npm run view          # View saved transactions
npm run analyze       # Analyze accounts command
npm run verify        # Verify saved transaction integrity
npm run analyze-mev   # Analyze MEV instruction structure
npm run analyze-signers # Interactive signer analysis
```

## Configuration

### Environment Variables (.env)
```env
GRPC_URL=your_grpc_url_here
X_TOKEN=your_access_token (optional)
RPC_URL=https://api.mainnet-beta.solana.com
ALT_RESOLUTION=true
RPC_RATE_LIMIT=10
DEBUG=false
```

### Signer Filter (onchain-sniper-address.json)
```json
[
  {
    "address": "SignerPublicKeyHere",
    "active": true
  }
]
```

## Jito Tip Addresses
The analyzer automatically detects tips sent to these official Jito addresses:
- 96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5
- HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe
- Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY
- ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49
- DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh
- ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt
- DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL
- 3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT

## Transaction Analysis Logic

### Failed Transactions
Identified by the log message: "No profitable arbitrage opportunity found"

### Spam vs Jito
- **Spam**: Only one balance change (the signer paying the fee)
- **Jito**: Multiple balance changes with one going to a Jito tip address

### Tip Calculation
- For spam: The absolute value of the signer's balance change
- For Jito: The amount received by the Jito tip address
- Note: Separate account transfers include ~5000 lamport SOL transfer fee

## Output Files

### signer-analysis-report.json
Contains:
- Complete transaction history per signer
- Detailed statistics
- Top mints and pools
- Time-based analysis

### signer-analysis-report.csv
Spreadsheet-friendly format with:
- Signer addresses
- Transaction counts and success rates
- Average tips
- Top mint and pool per signer
- First/last seen timestamps
