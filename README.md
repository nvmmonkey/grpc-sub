# MEV Transaction Monitor v3.2

Real-time monitoring of Solana MEV program transactions using Yellowstone gRPC with interactive menu and signer filtering.

## Project Structure

```
grpc-sub/
├── index.js           # Main entry point
├── utils/             # Modular utilities
│   ├── colors.js      # Terminal color codes
│   ├── constants.js   # Program IDs and constants
│   ├── decoders.js    # Data decoding functions
│   ├── formatters.js  # Display formatting utilities
│   ├── menu.js        # Interactive menu system
│   ├── signerFilter.js # Signer filtering logic
│   ├── transactionParser.js  # Transaction parsing logic
│   └── streamHandler.js      # gRPC stream management
├── onchain-sniper-address.json  # Signer addresses configuration
├── package.json       # Node.js dependencies
├── .env.example       # Environment variables template
└── README.md          # This file
```

## Features

- **Interactive Menu System**: Choose between different monitoring modes
- **Raw Subscription Mode**: Monitor all MEV program transactions
- **Signer Filter Mode**: Monitor only transactions from specific signers
- **Address Lookup Table (ALT) Resolution**: Automatically resolves accounts from ALTs using RPC
- Real-time transaction monitoring for MEV program `MEViEnscUm6tsQRoGd9h6nLQaQspKj7DB2M5FwM3Xvz`
- Detailed transaction logging with color-coded output
- Automatic reconnection on stream errors
- Comprehensive transaction details including:
  - Transaction signature and slot
  - Account keys with roles (signer, writable)
  - Instructions with program IDs and data
  - Transaction status (success/failed)
  - Balance changes
  - Compute units consumed
  - Transaction logs

## Installation

1. Navigate to the grpc-sub directory:
```bash
cd C:\Users\a5469\Development\mev\grpc\grpc-sub
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
copy .env.example .env
```

4. Edit `.env` and add your Yellowstone gRPC credentials:
```
GRPC_URL=your_grpc_url_here
X_TOKEN=your_access_token_here  # Optional - only if your endpoint requires authentication
RPC_URL=https://api.mainnet-beta.solana.com  # Optional - for Address Lookup Table resolution
```

**Note:** The `RPC_URL` is optional but highly recommended. It enables automatic resolution of Address Lookup Tables (ALTs), which will show actual account addresses instead of "Unknown" for accounts loaded from ALTs. You can use:
- Public endpoints: `https://api.mainnet-beta.solana.com` or `https://api.devnet.solana.com`
- Your own RPC endpoint (e.g., QuickNode, Helius, etc.)

**RPC Optimization:**
- The system prioritizes gRPC data and only uses RPC when gRPC doesn't provide loaded addresses
- RPC calls are rate-limited (default: 10 calls/second, configurable via `RPC_RATE_LIMIT`)
- ALT data is cached for 5 minutes to minimize RPC usage
- Failed lookups are cached to prevent repeated attempts

## Configuration

### Signer Filter Configuration

To use the signer filter mode, edit `onchain-sniper-address.json`:

```json
[
  {
    "address": "YourSignerAddress1111111111111111111111111111",
    "name": "Sniper Bot 1",
    "active": true
  },
  {
    "address": "YourSignerAddress2222222222222222222222222222",
    "name": "Sniper Bot 2",
    "active": false
  }
]
```

- `address`: The Solana public key to monitor
- `name`: A friendly name for identification
- `active`: Set to `true` to include in filtering, `false` to ignore

## Usage

Run the monitor:
```bash
npm start
```

### Menu Options:

1. **Raw Subscription** - Monitor all MEV transactions
   - Shows every transaction involving the MEV program
   - No filtering applied

2. **Filtered by Signer** - Monitor specific signers only
   - Loads addresses from `onchain-sniper-address.json`
   - Only shows transactions where configured addresses are signers
   - Displays progress statistics every 100 filtered transactions
   - Shows periodic stats every 30 seconds

3. **Save to File** - Monitor and save transaction details
   - Saves up to 100 most recent transactions to `sub-details.json`
   - Automatically rotates when limit is reached (oldest replaced)
   - Useful for offline analysis

4. **Real-time Analysis - Single Signer** - Detailed analysis of one signer
   - Select a specific signer from your configuration
   - Tracks detailed metrics: transaction types, tip ranges, pools used
   - Saves analysis to `signer-analysis/{address}.json`
   - Shows periodic summaries of signer activity

5. **Real-time Analysis - All Signers** - Comprehensive market analysis
   - Tracks EVERY signer that appears in MEV transactions (no filtering)
   - Provides complete market overview, not limited to configured signers
   - Individual analysis files saved to `signer-analysis/` directory
   - Combined report saved to `signer-analysis/combined-report.json`

6. **Mint Profit Table** - Real-time profit tracking by token
   - Displays top 10 most profitable mints in table format
   - Shows profit, transaction counts, success/fail rates, ROI
   - Per-mint Jito/Spam tip ranges with averages
   - Updates in real-time with each transaction
   - Tracks ALL signers automatically

7. **Mint & Pool Table** - Compact mint analysis with pool details
   - Top 10 mints with associated DEX pools
   - Compact format: profit, transactions, and ROI on one line
   - Shows top 3 pools for each mint
   - Jito/Spam statistics per mint
   - Updates in real-time

8. **Exit** - Close the monitor

### Mode-Specific Features:

#### Filtered Mode (Option 2):
- Highlights detected target signers with `◆ TARGET SIGNER DETECTED ◆`
- Shows which signer was detected and at what index
- Displays filtering statistics (scanned, displayed, filtered)
- Only processes transactions where target addresses are actual signers (not just included accounts)

#### Analysis Modes (Options 4-7):
- **Single Signer Analysis**: Deep dive into one signer's behavior
- **All Signers Analysis**: Complete market overview tracking ALL signers
- **Profit Tables**: Real-time updating tables with sortable metrics
- **Pool Tracking**: Identifies which DEX pools are being used
- Statistics include:
  - Transaction success/failure rates
  - Jito vs Spam transaction distribution
  - Tip amount ranges and averages
  - Most frequently traded mints
  - Pool usage patterns

## Output Format

### Transaction Display (Options 1-3):
Each transaction is displayed with:
- Colored headers for easy identification
- Transaction signature and slot number
- All account keys with their roles
- Instruction details
- Transaction status and errors (if any)
- Balance changes for all accounts
- Compute units consumed
- Program logs

In filtered mode, matching transactions also show:
- Target signer highlight
- Signer address and index
- Periodic statistics

### Analysis Display (Options 4-5):
- Real-time transaction updates with key metrics
- Periodic summaries showing:
  - Total transactions and success rates
  - Tip ranges for Jito and Spam transactions
  - Top mints and pools used
  - Cumulative statistics

### Table Display (Options 6-7):
- **Mint Profit Table**:
  - Rank, mint address, total profit
  - Transaction counts (success.failed format)
  - Net volume, total fees, ROI percentage
  - Per-mint Jito/Spam tip ranges
  
- **Mint & Pool Table**:
  - Compact mint info with profit and ROI
  - Jito/Spam statistics on one line
  - Top 3 DEX pools for each mint
  - Transaction counts per pool

## Requirements

- Node.js >= 14.0.0
- Valid Yellowstone gRPC endpoint URL
- X_TOKEN (only if your gRPC endpoint requires authentication)
- Network connection to the gRPC endpoint

## Notes

- The monitor uses `PROCESSED` commitment level for faster updates
- Failed transactions are also captured and displayed
- The monitor excludes vote transactions to reduce noise
- Signer filtering only matches actual transaction signers, not just accounts included in the transaction
