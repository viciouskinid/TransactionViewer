# ABI Files Documentation

This directory contains JSON files with Application Binary Interface (ABI) definitions for common smart contracts on Ethereum and compatible networks.

## File Structure

### Core Token Standards
- **`erc20.json`** - Complete ERC20 token standard including mint/burn functions
- **`weth.json`** - Wrapped Ethereum (WETH) contract with deposit/withdrawal functions

### DeFi Protocols
- **`uniswapV2Router.json`** - Uniswap V2 Router contract for token swaps and liquidity
- **`uniswapV2Pair.json`** - Uniswap V2 Pair contract for individual trading pairs
- **`uniswapV3Pool.json`** - Uniswap V3 Pool contract with concentrated liquidity

### Utilities
- **`multicall.json`** - Multicall contract for batching multiple calls

### Index File
- **`index.js`** - Main export file that combines all ABIs and provides categorized exports

## Usage

```javascript
import { allABIs, erc20ABI, defiABIs } from './abis';

// Use all ABIs for transaction decoding
const decoded = decodeInputWithABI(inputData, allABIs);

// Use specific ABI for targeted decoding
const interface = new ethers.utils.Interface(erc20ABI);
```

## ABI Categories

### `allABIs`
Combined array of all ABI definitions - use this for comprehensive transaction decoding.

### `tokenABIs`
Token-related ABIs including ERC20 and WETH.

### `defiABIs`
DeFi protocol ABIs including Uniswap V2/V3 contracts.

### `utilityABIs`
Utility contract ABIs like Multicall.

## Enhanced ERC20 Features

The ERC20 ABI includes extended functionality:
- Standard ERC20 functions (transfer, approve, etc.)
- Metadata functions (name, symbol, decimals)
- Minting and burning capabilities
- Allowance management (increase/decrease)

## WETH Features

The WETH ABI includes:
- All ERC20 functionality
- `deposit()` - Convert ETH to WETH
- `withdraw(uint256)` - Convert WETH back to ETH
- Deposit and Withdrawal events

## Notes

- All ABIs are in human-readable format (strings)
- Event definitions are included for log decoding
- ABIs are focused on the most commonly used functions and events
- Compatible with ethers.js Interface constructor
