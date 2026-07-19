import {
  Contract,
  FeeData,
  JsonRpcProvider,
  Network,
  TransactionResponse,
} from 'ethers';
import { ETH_ERC20_ABI } from '../abi/eth';
import { withProviderRetry } from '../utils/retry.util';

export const broadcastTransactionToNetwork = (
  provider: JsonRpcProvider,
  signedTx: string,
): Promise<TransactionResponse> => {
  return withProviderRetry(() => provider.broadcastTransaction(signedTx));
};

export const getTransactionCount = (
  provider: JsonRpcProvider,
  walletAddress: string,
): Promise<number> => {
  return withProviderRetry(() => provider.getTransactionCount(walletAddress));
};

export const getFeeData = (provider: JsonRpcProvider): Promise<FeeData> => {
  return withProviderRetry(() => provider.getFeeData());
};

export const getNetwork = (provider: JsonRpcProvider): Promise<Network> => {
  return withProviderRetry(() => provider.getNetwork());
};

export const getErc20ContractTokenBalance = (
  tokenContractAddress: string,
  walletAddress: string,
  provider: JsonRpcProvider,
): Promise<bigint> => {
  const tokenContract: Contract = new Contract(
    tokenContractAddress,
    ETH_ERC20_ABI,
    provider,
  );
  return withProviderRetry(() => tokenContract.balanceOf(walletAddress));
};

export const getNativeCurrencyBalance = (
  walletAddress: string,
  provider: JsonRpcProvider,
): Promise<bigint> => {
  return withProviderRetry(() => provider.getBalance(walletAddress));
};

export const getEstimateGas = async (
  provider: JsonRpcProvider,
  walletAddress: string,
  unsignedTx: any,
): Promise<bigint> => {
  try {
    return await withProviderRetry(() =>
      provider.estimateGas({
        data: unsignedTx.data,
        from: walletAddress,
        to: unsignedTx.to,
        value: unsignedTx.value || '0x0',
      }),
    );
  } catch (error) {
    console.error('Gas estimation error details:', error);
    throw error;
  }
};
