import { SupportedChain } from '../dto/uniswap.dto';

export interface ChainConfig {
  chainId: number;
  name: string;
  uniswapV3QuoterV2: string;
  uniswapV3Factory: string;
  wrappedNative: string;
  swapRouter: string;
  nativeSymbol: string;
}

export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  [SupportedChain.ETH]: {
    chainId: 1,
    name: 'Ethereum',
    uniswapV3QuoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    uniswapV3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    wrappedNative: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    nativeSymbol: 'ETH',
  },
  [SupportedChain.BNB]: {
    chainId: 56,
    name: 'BNB Chain',
    uniswapV3QuoterV2: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
    uniswapV3Factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    wrappedNative: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    swapRouter: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
    nativeSymbol: 'BNB',
  },
  [SupportedChain.POLYGON]: {
    chainId: 137,
    name: 'Polygon',
    uniswapV3QuoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    uniswapV3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    wrappedNative: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    nativeSymbol: 'MATIC',
  },
  [SupportedChain.ARB]: {
    chainId: 42161,
    name: 'Arbitrum One',
    uniswapV3QuoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    uniswapV3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    wrappedNative: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    nativeSymbol: 'ETH',
  },
  [SupportedChain.BASE]: {
    chainId: 8453,
    name: 'Base',
    uniswapV3QuoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    uniswapV3Factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    wrappedNative: '0x4200000000000000000000000000000000000006',
    swapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481',
    nativeSymbol: 'ETH',
  },
  [SupportedChain.AVAX]: {
    chainId: 43114,
    name: 'Avalanche',
    uniswapV3QuoterV2: '0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F',
    uniswapV3Factory: '0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD',
    wrappedNative: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    swapRouter: '0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE',
    nativeSymbol: 'AVAX',
  },
  [SupportedChain.OPT]: {
    chainId: 10,
    name: 'Optimism',
    uniswapV3QuoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    uniswapV3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    wrappedNative: '0x4200000000000000000000000000000000000006',
    swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    nativeSymbol: 'ETH',
  },
};

export const FEE_TIERS = [100, 500, 3000, 10000];

export const QUOTER_V2_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'tokenIn', type: 'address' },
          { internalType: 'address', name: 'tokenOut', type: 'address' },
          { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
          { internalType: 'uint24', name: 'fee', type: 'uint24' },
          {
            internalType: 'uint160',
            name: 'sqrtPriceLimitX96',
            type: 'uint160',
          },
        ],
        internalType: 'struct IQuoterV2.QuoteExactInputSingleParams',
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'quoteExactInputSingle',
    outputs: [
      { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
      { internalType: 'uint160', name: 'sqrtPriceX96After', type: 'uint160' },
      {
        internalType: 'uint32',
        name: 'initializedTicksCrossed',
        type: 'uint32',
      },
      { internalType: 'uint256', name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'tokenIn', type: 'address' },
          { internalType: 'address', name: 'tokenOut', type: 'address' },
          { internalType: 'uint256', name: 'amount', type: 'uint256' },
          { internalType: 'uint24', name: 'fee', type: 'uint24' },
          {
            internalType: 'uint160',
            name: 'sqrtPriceLimitX96',
            type: 'uint160',
          },
        ],
        internalType: 'struct IQuoterV2.QuoteExactOutputSingleParams',
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'quoteExactOutputSingle',
    outputs: [
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'uint160', name: 'sqrtPriceX96After', type: 'uint160' },
      {
        internalType: 'uint32',
        name: 'initializedTicksCrossed',
        type: 'uint32',
      },
      { internalType: 'uint256', name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

export const ERC20_ABI = [
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
];
