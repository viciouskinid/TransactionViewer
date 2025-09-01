// Import all ABI files
import erc20ABI from './erc20.json';
import wethABI from './weth.json';
import uniswapV2RouterABI from './uniswapV2Router.json';
import uniswapV2PairABI from './uniswapV2Pair.json';
import uniswapV3PoolABI from './uniswapV3Pool.json';
import multicallABI from './multicall.json';
import aaveWethGatewayABI from './aaveWethGateway.json';
import piteasRouterABI from './piteasRouter.json';

// Export individual ABIs
export { 
  erc20ABI, 
  wethABI, 
  uniswapV2RouterABI, 
  uniswapV2PairABI, 
  uniswapV3PoolABI, 
  multicallABI,
  aaveWethGatewayABI,
  piteasRouterABI 
};

// Export combined ABI for transaction decoding
export const allABIs = [
  ...erc20ABI,
  ...wethABI,
  ...uniswapV2RouterABI,
  ...uniswapV2PairABI,
  ...uniswapV3PoolABI,
  ...multicallABI,
  ...aaveWethGatewayABI,
  ...piteasRouterABI
];

// Export ABI collections by category
export const defiABIs = [
  ...uniswapV2RouterABI,
  ...uniswapV2PairABI,
  ...uniswapV3PoolABI,
  ...aaveWethGatewayABI,
  ...piteasRouterABI
];

export const tokenABIs = [
  ...erc20ABI,
  ...wethABI
];

export const utilityABIs = [
  ...multicallABI
];
