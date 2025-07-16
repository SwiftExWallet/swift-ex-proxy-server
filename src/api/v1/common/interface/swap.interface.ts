export interface I_SwapTransaction {
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

export interface I_SwapQuote {
  inputAmount: string;
  inputToken: string;
  outputAmount: string;
  outputToken: string;
  pricePerToken: string;
  fee: string;
  poolAddress: string;
}

export interface I_QuotedOutput {
  amountOut: number;
  sqrtPriceX96After: number;
  initializedTicksCrossed: number;
  gasEstimate: number;
}
