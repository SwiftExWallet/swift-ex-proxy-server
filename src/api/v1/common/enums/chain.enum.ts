export enum ChainEnum {
  ETH = 'eth',
  BSC = 'bsc',
  BNB = 'bnb',
  POL = 'pol',
  MATIC = 'matic',
  ARB = 'arb',
  OP = 'opt',
  OPT = 'opt',
  OP138 = 'op',
  AVAX = 'avax',
  AVA = 'avax',
  BASE = 'base',
  BAS = 'base',
  GNO = 'gnosis',
  ZK = 'zksync',
  LINEA = 'linea',
  SONIC = 'sonic',
  UNI = 'unichain',
  SOL = 'solana',
}
export enum TxChainEnum {
  ETH = 'ETH',
  BSC = 'BNB',
}

export enum SwapNetwork {
  ETH = 'ETH',
  BSC = 'BSC',
  BNB = 'BSC',
  POL = 'POL',
  MATIC = 'MATIC',
  ARB = 'ARB',
  OP = 'OPT',
  OPT = 'OPT',
  OP138 = 'OP138',
  AVAX = 'AVAX',
  AVA = 'AVAX',
  BASE = 'BASE',
  BAS = 'BASE',
  GNO = 'GNO',
  ZK = 'ZK',
  LINEA = 'LINEA',
  SONIC = 'SONIC',
  UNI = 'UNI',
  SOL = 'SOL',
  SRB = 'SRB',
}

const isDevEnvironment = process.env.ENVIRONMENT === 'dev';

export enum ChainId {
  ETH = isDevEnvironment ? 11155111 : 1,
  BNB = isDevEnvironment ? 97 : 56,
  BSC = isDevEnvironment ? 97 : 56,
  MATIC = isDevEnvironment ? 80002 : 137,
  POL = isDevEnvironment ? 80002 : 137,
  ARB = isDevEnvironment ? 421614 : 42161,
  OP = isDevEnvironment ? 11155420 : 10,
  OPT = isDevEnvironment ? 11155420 : 10,
  AVAX = isDevEnvironment ? 43113 : 43114,
  AVA = isDevEnvironment ? 43113 : 43114,
  BASE = isDevEnvironment ? 84532 : 8453,
  BAS = isDevEnvironment ? 84532 : 8453,
  GNO = isDevEnvironment ? 10200 : 100,
  ZK = isDevEnvironment ? 300 : 324,
  LINEA = isDevEnvironment ? 59141 : 59144,
  SONIC = isDevEnvironment ? 14601 : 146,
  UNI = isDevEnvironment ? 1301 : 130,
  OP138 = isDevEnvironment ? 10200 : 138,
}

export const SUPPORTED_QUOTE_CHAIN_IDS = [
  ChainId.ETH,
  ChainId.ARB,
  ChainId.AVAX,
  ChainId.BASE,
  ChainId.BSC,
  ChainId.POL,
  ChainId.OP138,
  ChainId.ETH,
] as const;

export enum swapProvider {
  UNISWAP = 'UNISWAP',
  ONEINCH_FUSION = 'ONEINCH_FUSION',
  ONEINCH_FUSION_PLUS = 'ONEINCH_FUSION_PLUS',
  EVMTX = 'EVMTX',
  DYDX = 'DYDX',
  SRBTODYDX = 'SRBTODYDX',
  NEARINTENT = 'NEARINTENT',
}

export enum SupportedWalletChain {
  eth = 'eth',
  bnb = 'bnb',
  xlm = 'xlm',
  multi = 'multi',
}
