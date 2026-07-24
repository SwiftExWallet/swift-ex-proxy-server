import { Contract } from 'ethers';
import { QuotedOutput } from '../interface/swap.interface';
import { withProviderControls } from '../utils/retry.util';

export const getErc20ContractInfo = async (
  tokenContract: Contract,
  walletAddress: string,
) => {
  const [name, symbol, decimals, balance] = (await Promise.all([
    withProviderControls('contract:erc20-info', () => tokenContract.name()),
    withProviderControls('contract:erc20-info', () => tokenContract.symbol()),
    withProviderControls('contract:erc20-info', () => tokenContract.decimals()),
    withProviderControls('contract:erc20-info', () =>
      tokenContract.balanceOf(walletAddress),
    ),
  ])) as [string, string, number, bigint];
  return {
    name,
    symbol,
    decimals,
    balance,
  };
};

export const getPool = async (
  factoryContract: Contract,
  tokenInAddress: string,
  tokenOutAddress: string,
): Promise<string> => {
  return (await withProviderControls('contract:get-pool', () =>
    factoryContract.getPool(
      tokenInAddress,
      tokenOutAddress,
      process.env.FEE_TIER,
    ),
  )) as string;
};

export const getPoolContractFee = async (
  poolContract: Contract,
): Promise<bigint> => {
  return (await withProviderControls('contract:pool-fee', () =>
    poolContract.fee(),
  )) as bigint;
};

export const quoteExactInputSingle = async (
  quoterContract: Contract,
  tokenIn: string,
  tokenOut: string,
  fee: bigint,
  amountIn: bigint,
): Promise<QuotedOutput> => {
  return (await withProviderControls('contract:quote-exact-input-single', () =>
    quoterContract.quoteExactInputSingle({
      tokenIn,
      tokenOut,
      fee,
      amountIn,
      sqrtPriceLimitX96: 0n,
    }),
  )) as QuotedOutput;
};
