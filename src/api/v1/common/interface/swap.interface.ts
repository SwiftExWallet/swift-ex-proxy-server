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
  poolAddress: string;
}

export interface QuotedOutput {
  amountOut: number;
  sqrtPriceX96After: number;
  initializedTicksCrossed: number;
  gasEstimate: number;
}
