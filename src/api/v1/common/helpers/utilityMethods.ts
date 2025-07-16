import { FeeData, JsonRpcProvider, Network, TransactionResponse } from 'ethers';

export const broadcastTransactionToNetwork = (
  provider: JsonRpcProvider,
  signedTx: string,
): Promise<TransactionResponse> => {
  return provider.broadcastTransaction(signedTx);
};

export const getTransactionCount = (
  provider: JsonRpcProvider,
  walletAddress: string,
): Promise<number> => {
  return provider.getTransactionCount(walletAddress);
};

export const getFeeData = (provider: JsonRpcProvider): Promise<FeeData> => {
  return provider.getFeeData();
};

export const getNetwork = (provider: JsonRpcProvider): Promise<Network> => {
  return provider.getNetwork();
};
