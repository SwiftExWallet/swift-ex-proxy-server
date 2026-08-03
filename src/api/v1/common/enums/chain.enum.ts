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

export enum ChainId {
  ETH = 1,
  BNB = 56,
  BSC = 56,
  MATIC = 137,
  POL = 137,
  ARB = 42161,
  OP = 10,
  OPT = 10,
  OP138 = 138,
  AVAX = 43114,
  AVA = 43114,
  BASE = 8453,
  BAS = 8453,
  GNO = 100,
  ZK = 324,
  LINEA = 59144,
  SONIC = 146,
  UNI = 130,
  SOL = 501,
}

export const SUPPORTED_QUOTE_CHAIN_IDS = [
  ChainId.ETH,
  ChainId.ARB,
  ChainId.AVAX,
  ChainId.BASE,
  ChainId.BSC,
  ChainId.POL,
  ChainId.OP138,
] as const;

export enum swapProvider {
  UNISWAP = 'UNISWAP',
  ONEINCH_FUSION = 'ONEINCH_FUSION',
  ONEINCH_FUSION_PLUS = 'ONEINCH_FUSION_PLUS',
  ALLBRIDGE = 'ALLBRIDGE',
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
