import { ETH_ERC20_ABI } from '../common/abi/eth';
import { ChainEnum, SupportedWalletChain } from '../common/enums/chain.enum';
import {
  getErc20ContractTokenBalance,
  getEstimateGas,
  getFeeData,
  getNativeCurrencyBalance,
  getNetwork,
  getTransactionCount,
} from '../common/helpers/blockchainUtilityMethods';
import { getErc20ContractInfo } from '../common/helpers/contractUtilityMethod';
import { ProviderErrorCode } from '../common/utils/provider-error.util';
import { EvmService } from './evm.service';

jest.mock('../common/helpers/blockchainUtilityMethods', () => ({
  getErc20ContractTokenBalance: jest.fn(),
  getEstimateGas: jest.fn(),
  getFeeData: jest.fn(),
  getNativeCurrencyBalance: jest.fn(),
  getNetwork: jest.fn(),
  getTransactionCount: jest.fn(),
}));

jest.mock('../common/helpers/contractUtilityMethod', () => ({
  getErc20ContractInfo: jest.fn(),
}));

describe('EvmService', () => {
  const walletAddress = '0x1111111111111111111111111111111111111111';
  const otherWalletAddress = '0x9999999999999999999999999999999999999999';
  const tokenAddress = '0x2222222222222222222222222222222222222222';
  const provider = {
    broadcastTransaction: jest.fn(),
  };
  const tokenContract = {};
  const providerService = {
    getProvider: jest.fn(),
    getContract: jest.fn(),
  };
  const quoterService = {
    getQuoteResponse: jest.fn(),
  };
  const uniswapService = {
    buildSwapResponse: jest.fn(),
  };
  let service: EvmService;

  beforeEach(() => {
    jest.clearAllMocks();
    providerService.getProvider.mockReturnValue(provider);
    providerService.getContract.mockReturnValue(tokenContract);
    service = new EvmService(
      providerService as any,
      quoterService as any,
      uniswapService as any,
    );
  });

  it('uses selected chain provider and verified multi wallet for native balance', async () => {
    (getNativeCurrencyBalance as jest.Mock).mockResolvedValue(123n);
    const verifiedWallet = {
      addresses: new Map([[SupportedWalletChain.multi, walletAddress]]),
    };

    await expect(
      service.getBalance(
        'base',
        { walletAddress: otherWalletAddress },
        verifiedWallet as any,
      ),
    ).resolves.toBe(123n);

    expect(providerService.getProvider).toHaveBeenCalledWith(ChainEnum.BASE);
    expect(getNativeCurrencyBalance).toHaveBeenCalledWith(
      walletAddress,
      provider,
    );
  });

  it('rejects non-EVM chains', async () => {
    await expect(
      service.getBalance('solana', { walletAddress }),
    ).rejects.toMatchObject({
      message: 'Unsupported EVM chain',
    });
    expect(providerService.getProvider).not.toHaveBeenCalled();
  });

  it('returns wallet nonce and gas fee data for the selected chain', async () => {
    const feeData = { maxFeePerGas: 30n } as any;
    (getTransactionCount as jest.Mock).mockResolvedValue(7);
    (getFeeData as jest.Mock).mockResolvedValue(feeData);

    await expect(
      service.getWalletAddressInfo('arb', { walletAddress }),
    ).resolves.toEqual({
      transactionCount: 7,
      gasFeeData: feeData,
    });

    expect(providerService.getProvider).toHaveBeenCalledWith(ChainEnum.ARB);
    expect(getTransactionCount).toHaveBeenCalledWith(provider, walletAddress);
    expect(getFeeData).toHaveBeenCalledWith(provider);
  });

  it('returns native and token balances using bnb as a BSC alias', async () => {
    (getNativeCurrencyBalance as jest.Mock).mockResolvedValue(100n);
    (getErc20ContractTokenBalance as jest.Mock).mockResolvedValue(25n);

    await expect(
      service.getTokenBalance('bnb', { walletAddress, tokenAddress }),
    ).resolves.toEqual({
      walletBalance: 100n,
      tokenBalance: 25n,
    });

    expect(providerService.getProvider).toHaveBeenCalledWith(ChainEnum.BSC);
    expect(getErc20ContractTokenBalance).toHaveBeenCalledWith(
      tokenAddress,
      walletAddress,
      provider,
    );
  });

  it('returns ERC20 token info for the selected chain', async () => {
    (getErc20ContractInfo as jest.Mock).mockResolvedValue({
      name: 'Token',
      symbol: 'TKN',
      decimals: 6,
      balance: 123456n,
    });

    await expect(
      service.getTokenInfo('pol', {
        addresses: [tokenAddress],
        walletAddress,
      }),
    ).resolves.toEqual([
      {
        name: 'Token',
        symbol: 'TKN',
        balance: '0.123456',
        address: tokenAddress,
        imageUrl: '',
        decimals: 6,
      },
    ]);

    expect(providerService.getContract).toHaveBeenCalledWith(
      tokenAddress,
      ETH_ERC20_ABI,
      ChainEnum.POL,
    );
    expect(getErc20ContractInfo).toHaveBeenCalledWith(
      tokenContract,
      walletAddress,
    );
  });

  it('prepares a transaction from the selected chain provider', async () => {
    const unsignedTx = {
      to: tokenAddress,
      data: '0x',
      value: '0x0',
    };
    (getTransactionCount as jest.Mock).mockResolvedValue(3);
    (getEstimateGas as jest.Mock).mockResolvedValue(21000n);
    (getFeeData as jest.Mock).mockResolvedValue({
      maxFeePerGas: 30n,
      gasPrice: 20n,
    });
    (getNetwork as jest.Mock).mockResolvedValue({ chainId: 8453n });

    await expect(
      service.prepareTransaction('base', {
        unsignedTx,
        walletAddress,
      } as any),
    ).resolves.toEqual({
      unsignedTx,
      nonce: 3,
      gasLimit: 21000n,
      gasPrice: 30n,
      chainId: 8453n,
    });

    expect(getEstimateGas).toHaveBeenCalledWith(
      provider,
      walletAddress,
      unsignedTx,
    );
  });

  it('broadcasts one signed transaction', async () => {
    provider.broadcastTransaction.mockResolvedValue({ hash: '0xhash' });

    await expect(
      service.broadcastTransaction('eth', { signedTx: '0xsigned' } as any),
    ).resolves.toEqual({
      txHash: '0xhash',
      receipt: null,
    });

    expect(provider.broadcastTransaction).toHaveBeenCalledWith('0xsigned');
  });

  it('broadcasts a signed transaction batch', async () => {
    provider.broadcastTransaction
      .mockResolvedValueOnce({ hash: '0xapprove' })
      .mockResolvedValueOnce({ hash: '0xswap' });

    await expect(
      service.broadcastTransaction('eth', {
        signedTransactions: ['0xapproveSigned', '0xswapSigned'],
      } as any),
    ).resolves.toEqual({
      success: true,
      totalTransactions: 2,
      results: [
        {
          transactionHash: '0xapprove',
          type: 'approve',
          status: 'pending',
        },
        {
          transactionHash: '0xswap',
          type: 'transfer',
          status: 'pending',
        },
      ],
    });
  });

  it('wraps broadcast failures as transaction rejections', async () => {
    provider.broadcastTransaction.mockRejectedValue({
      message: 'private RPC rejected the transaction',
    });

    await expect(
      service.broadcastTransaction('eth', { signedTx: '0xsigned' } as any),
    ).rejects.toMatchObject({
      response: {
        code: ProviderErrorCode.TransactionRejected,
        message: 'Provider rejected the transaction.',
      },
    });
  });

  it('delegates swap quotes to QuoterService', async () => {
    const dto = { amount: '1' };
    const wallet = { addresses: new Map() };
    const quote = { success: true };
    quoterService.getQuoteResponse.mockResolvedValue(quote);

    await expect(service.getSwapQuote(dto as any, wallet as any)).resolves.toBe(
      quote,
    );

    expect(quoterService.getQuoteResponse).toHaveBeenCalledWith(dto, wallet);
  });

  it('delegates swap transaction preparation to UniswapService', async () => {
    const dto = { amount: '1' };
    const wallet = { addresses: new Map() };
    const response = { success: true, data: [] };
    uniswapService.buildSwapResponse.mockResolvedValue(response);

    await expect(
      service.prepareSwapTransaction(dto as any, wallet as any),
    ).resolves.toBe(response);

    expect(uniswapService.buildSwapResponse).toHaveBeenCalledWith(dto, wallet);
  });
});
