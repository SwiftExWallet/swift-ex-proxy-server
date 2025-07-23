import { Contract } from 'ethers';
import { QuotedOutput } from '../interface/swap.interface';

export const getErc20ContractInfo = async (
  tokenContract: Contract,
  walletAddress: string,
) => {
  const [name, symbol, decimals, balance] = (await Promise.all([
    tokenContract.name(),
    tokenContract.symbol(),
    tokenContract.decimals(),
    tokenContract.balanceOf(walletAddress),
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
  return (await factoryContract.getPool(
    tokenInAddress,
    tokenOutAddress,
    process.env.FEE_TIER,
  )) as string;
};

export const getPoolContractFee = async (
  poolContract: Contract,
): Promise<bigint> => {
  return (await poolContract.fee()) as bigint;
};

export const quoteExactInputSingle = async (
  quoterContract: Contract,
  tokenIn: string,
  tokenOut: string,
  fee: bigint,
  amountIn: bigint,
): Promise<QuotedOutput> => {
  return (await quoterContract.quoteExactInputSingle({
    tokenIn,
    tokenOut,
    fee,
    amountIn,
    sqrtPriceLimitX96: 0n,
  })) as QuotedOutput;
};
