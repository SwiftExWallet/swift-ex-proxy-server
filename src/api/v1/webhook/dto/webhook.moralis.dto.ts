export class WebhookMoralisDto {
    abi: any[];
    block: { number: string; hash: string; timestamp: string };
    txs: any[];
    txsInternal: any[];
    logs: any[];
    chainId: string;
    confirmed: boolean;
    retries: number;
    tag: string;
    streamId: string;
    erc20Approvals: any[];
    erc20Transfers: any[];
    nftTokenApprovals: any[];
    nftApprovals: {
      ERC721: any[];
      ERC1155: any[];
    };
    nftTransfers: any[];
    nativeBalances: any[];
  
    isTestPayload(): boolean {
      if (Object.keys(this).length === 0) {
        return true;
      }
    
      return (
        this.chainId === '' &&
        this.block?.number === '' &&
        this.block?.hash === '' &&
        this.block?.timestamp === '' &&
        Array.isArray(this.abi) && this.abi.length === 0 &&
        Array.isArray(this.txs) && this.txs.length === 0 &&
        Array.isArray(this.logs) && this.logs.length === 0 &&
        Array.isArray(this.erc20Transfers) && this.erc20Transfers.length === 0 &&
        Array.isArray(this.nftTransfers) && this.nftTransfers.length === 0 &&
        Array.isArray(this.nativeBalances) && this.nativeBalances.length === 0 &&
        Array.isArray(this.erc20Approvals) && this.erc20Approvals.length === 0 &&
        Array.isArray(this.nftTokenApprovals) && this.nftTokenApprovals.length === 0 &&
        Array.isArray(this.nftApprovals?.ERC721) && this.nftApprovals.ERC721.length === 0 &&
        Array.isArray(this.nftApprovals?.ERC1155) && this.nftApprovals.ERC1155.length === 0
      );
    }
    
  }
  