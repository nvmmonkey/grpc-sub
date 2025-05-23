# MEV Transaction Monitor v3.0

Real-time monitoring of Solana MEV program transactions using Yellowstone gRPC.

## Project Structure

```
grpc-sub/
├── index.js           # Main entry point
├── utils/             # Modular utilities
│   ├── colors.js      # Terminal color codes
│   ├── constants.js   # Program IDs and constants
│   ├── decoders.js    # Data decoding functions
│   ├── formatters.js  # Display formatting utilities
│   ├── transactionParser.js  # Transaction parsing logic
│   └── streamHandler.js      # gRPC stream management
├── package.json       # Node.js dependencies
├── .env.example       # Environment variables template
└── README.md          # This file
```

## Features

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
```

## Usage

Run the monitor:

```bash
npm start
```

The monitor will:

1. Connect to the Yellowstone gRPC stream
2. Subscribe to all transactions involving the MEV program
3. Log detailed information for each transaction in real-time
4. Automatically reconnect if the connection is lost

## Output Format

Each transaction is displayed with:

- Colored headers for easy identification
- Transaction signature and slot number
- All account keys with their roles
- Instruction details
- Transaction status and errors (if any)
- Balance changes for all accounts
- Compute units consumed
- Program logs

## Requirements

- Node.js >= 14.0.0
- Valid Yellowstone gRPC endpoint URL
- X_TOKEN (only if your gRPC endpoint requires authentication)
- Network connection to the gRPC endpoint

## Notes

- The monitor uses `CONFIRMED` commitment level for reliable transaction data
- Failed transactions are also captured and displayed
- The monitor excludes vote transactions to reduce noise