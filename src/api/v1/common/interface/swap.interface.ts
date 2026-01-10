import { TransactionReceipt, TransactionResponse } from "ethers";

export interface SwapTransaction {
  to: string;
  data: string;
  value?: string;
  gasLimit: number;
  nonce: number;
  chainId: bigint;
  type: number;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface SwapTx {
  to: string;
  data: string;
  value: bigint;
  gasLimit: bigint;
}

export interface SwapQuote {
  inputAmount: string;
  inputToken: string;
  outputAmount: string;
  outputToken: string;
  pricePerToken: string;
  fee: string;
  poolAddress?: string;
  isMultiHop?: boolean;
  path?: string;
}

export interface QuotedOutput {
  amountOut: number;
  sqrtPriceX96After: number;
  initializedTicksCrossed: number;
  gasEstimate: number;
}

export interface PancakeSwapQuoteParams {
    fromTokenAddress: string;
    toTokenAddress: string;
    amount: string;
    slippage?: number;
}

export interface PancakeSwapParams extends PancakeSwapQuoteParams {
    fromAddress: string;
    gasPrice?: string;
}

export interface PancakeSwapQuote {
    fromToken: PancakeTokenInfo;
    toToken: PancakeTokenInfo;
    fromTokenAmount: string;
    toTokenAmount: string;
    priceImpact: string;
    minimumReceived: string;
    route: string[];
    gasEstimate?: string;
    transaction?: any;
}

export interface PancakeTokenInfo {
    symbol: string;
    name: string;
    address: string;
    decimals: number;
}

export interface PancakeUnsignedSwapTransaction {
    transaction: {
      to: string;
      value: string;
      data: string;
      gasLimit: string;
      gasPrice: string;
      nonce: number;
      chainId: number;
    };
    approvalTransaction?: {
      to: string;
      value: string;
      data: string;
      gasLimit: string;
      gasPrice: string;
      nonce: number;
      chainId: number;
    } | null;
    quote: PancakeSwapQuote;
  }
  
export interface ExecutedTransaction {
    txResponse: TransactionResponse;
    receipt?: TransactionReceipt;
  }