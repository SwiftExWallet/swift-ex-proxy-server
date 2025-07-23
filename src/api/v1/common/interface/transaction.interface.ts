export interface FullTransaction {
  unsignedTx: string;
  nonce: number;
  gasPrice: bigint | null;
  gasLimit: bigint;
  chainId: bigint;
}
