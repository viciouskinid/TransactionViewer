# Transaction Viewer

A React application for viewing and decoding Ethereum transaction data and receipts.

## Features

- View raw transaction data and receipts
- Decode transaction input data using common ABIs (ERC-20, Uniswap V2)
- Decode event logs from transaction receipts
- Switch between structured and raw views
- Dark mode support
- Support for any EVM-compatible blockchain RPC

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn

### Installation

1. Clone the repository or extract the project files
2. Navigate to the project directory:
   ```bash
   cd transaction_viewer
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application

1. Start the development server:
   ```bash
   npm start
   ```

2. Open your browser and navigate to `http://localhost:3000`

### Building for Production

To create a production build:

```bash
npm run build
```

The built files will be in the `build` directory.

## Usage

1. Enter an RPC URL for your blockchain network (e.g., Ethereum mainnet, Polygon, etc.)
2. Enter a transaction hash
3. Click "Fetch Transaction Data & Receipt" to load the transaction information
4. Use the "Switch to Raw View" / "Switch to Structured View" button to toggle between views

## Supported ABIs

The application comes with built-in support for decoding:

- ERC-20 token functions (approve, transfer, transferFrom) and events
- Uniswap V2 router functions and pair events

## Technical Details

- Built with React 18
- Uses Tailwind CSS for styling
- Ethers.js for blockchain interaction and data decoding
- Responsive design with dark mode support

## License

This project is open source and available under the MIT License.
