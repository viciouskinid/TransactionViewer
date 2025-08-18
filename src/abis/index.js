// Import all ABI files
import erc20ABI from './erc20.json';
import wethABI from './weth.json';
import uniswapV2RouterABI from './uniswapV2Router.json';
import uniswapV2PairABI from './uniswapV2Pair.json';
import uniswapV3PoolABI from './uniswapV3Pool.json';
import multicallABI from './multicall.json';

// Export individual ABIs
export { 
  erc20ABI, 
  wethABI, 
  uniswapV2RouterABI, 
  uniswapV2PairABI, 
  uniswapV3PoolABI, 
  multicallABI 
};

// Export combined ABI for transaction decoding
export const allABIs = [
  ...erc20ABI,
  ...wethABI,
  ...uniswapV2RouterABI,
  ...uniswapV2PairABI,
  ...uniswapV3PoolABI,
  ...multicallABI
];

// Export ABI collections by category
export const defiABIs = [
  ...uniswapV2RouterABI,
  ...uniswapV2PairABI,
  ...uniswapV3PoolABI
];

export const tokenABIs = [
  ...erc20ABI,
  ...wethABI
];

export const utilityABIs = [
  ...multicallABI
];
