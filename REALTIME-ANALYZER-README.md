# MEV Bot Real-Time Analyzer

A comprehensive tool for monitoring and analyzing MEV (Maximum Extractable Value) bot activities on Solana in real-time.

## Features

### Real-time Monitoring
1. **Raw Subscription** - Monitor all MEV transactions in real-time
2. **Filtered Mode** - Monitor only transactions from specific signers
3. **Save Mode** - Save transaction details for later analysis

### Real-time Analysis (NEW!)
4. **Real-time Analysis - Single Signer** - Stream and analyze one specific signer's activity
5. **Real-time Analysis - All Signers** - Stream and analyze all configured signers simultaneously

## Key Differences in Analysis Modes

### Options 1-3: Traditional Monitoring
- Display transactions in the console
- Option 3 saves to `sub-details.json` for later review

### Options 4-5: Real-time Analysis
- Stream transactions and analyze patterns in real-time
- Save individual analysis files for each signer
- Track tips, mints, pools, and success rates continuously
- Generate reports while streaming

## Analysis Output

### Individual Signer Files
Location: `signer-analysis/{signerAddress}.json`

Contains:
- Transaction counts and success rates
- Spam vs Jito transaction breakdown
- Tip ranges and averages
- Most used mints with success rates
- DEX pool usage statistics
- Compute unit consumption
- Last 10 transactions details

### Combined Report
Location: `signer-analysis/combined-report.json`

## Real-time Analysis Features

### Transaction Type Detection
- **Spam**: Only fee paid (single balance change)
- **Jito**: Tips sent to official Jito addresses
  - Direct transfers
  - Separate account transfers (5000+ lamport difference)

### Tracked Metrics
- Min/Max/Average tips for both spam and Jito
- Success/failure rates per mint
- DEX usage patterns
- Compute unit consumption
- Real-time updates displayed in console

### DEX Programs (Corrected)
- **Raydium v4**: 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8
- **Raydium CLMM**: CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK
- **Raydium CPMM**: CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C
- **Meteora DLMM**: LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo
- **Orca Whirlpool**: whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc
- **Pump.fun**: pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA

## Usage

### Start Real-time Analysis
```bash
npm start
# Choose option 4 for single signer
# Choose option 5 for all signers
```

### View Analysis Results
```bash
npm run view-analysis
```

### Generate Report from Saved Data
```bash
npm run report
```

## Configuration

### Signer Filter (onchain-sniper-address.json)
```json
[
  {
    "address": "SignerPublicKeyHere",
    "active": true
  }
]
```

Only signers with `"active": true` will be analyzed in option 5.

## Real-time Display

During analysis, you'll see updates like:
```
[10:23:45] H5qgsZ83... SUCCESS SPAM 7611 lamports moonpig [Pump.fun, Raydium CLMM]
[10:23:46] 4WjDPpyM... SUCCESS JITO 2997 lamports USDUC [Meteora DLMM]
[10:23:47] H5qgsZ83... FAILED SPAM 8084 lamports 

══ Summary for H5qgsZ83D6kyMhq9... ══
  Total: 50 (45 success, 5 failed)
  Types: 40 spam, 10 jito
  Spam tips: 5000-10000 (avg: 7500)
  Jito tips: 2000-5000 (avg: 3500)
  Top mints:
    - moonpig (15 times)
    - USDUC (10 times)
```

## Analysis Strategy

Use the real-time analysis to:
1. Identify competitors' tip ranges
2. Find their most traded mints
3. Understand their DEX preferences
4. Monitor their success rates
5. Detect pattern changes in real-time

This information helps you:
- Set competitive spam lamport amounts
- Choose appropriate Jito tips
- Focus on profitable mints
- Select optimal DEX routes
- Improve your success rate

## Files Generated

```
signer-analysis/
├── H5qgsZ83D6kyMhq9dvLzLxm27p5yPywJWESyFMr69VwH.json
├── 4WjDPpyMitD184PX6HXSQXxTmXBGEc2xbrCABo4vNFN4.json
├── ... (one file per signer)
└── combined-report.json
```

Each file updates in real-time as new transactions are processed.
