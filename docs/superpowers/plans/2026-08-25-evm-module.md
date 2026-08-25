# EVM Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic `/api/v1/evm` route surface for common EVM wallet, token, transaction, quote, and swap-build operations without changing existing ETH or BSC routes.

**Architecture:** Add a new `EvmModule` beside the current `EthModule` and `BscModule`. `EvmService` resolves route `:chain` values to existing `ChainEnum` values, reuses `ProviderService` and common blockchain helpers for RPC operations, and delegates swap quote/build calls to the existing `QuoterService` and `UniswapService`.

**Tech Stack:** NestJS, TypeScript, ethers v6, Jest, existing common DTOs/helpers/decorators.

**Spec:** `docs/superpowers/specs/2026-08-25-evm-module-design.md`

## Global Constraints

- Keep `/api/v1/eth` unchanged.
- Keep `/api/v1/bsc` unchanged.
- Add no new dependencies.
- Do not introduce a generic DEX adapter.
- Do not migrate Pancake-specific BSC swap behavior into `/api/v1/evm`.
- Generic EVM routes use `SupportedWalletChain.multi` for verified wallet checks.
- Invalid or non-EVM `:chain` values return `BadRequestException('Unsupported EVM chain')`.
- Broadcast transaction failures use `ProviderErrorCode.TransactionRejected`.

---

## File Structure

- Create `src/api/v1/evm/evm.service.ts`: shared EVM RPC operations and swap delegation.
- Create `src/api/v1/evm/evm.service.spec.ts`: direct Jest unit tests for service behavior.
- Create `src/api/v1/evm/evm.controller.ts`: `/api/v1/evm` routes and existing rate/body-limit decorators.
- Create `src/api/v1/evm/evm.controller.spec.ts`: thin controller delegation and metadata tests.
- Create `src/api/v1/evm/evm.module.ts`: Nest module wiring.
- Modify `src/app.module.ts`: import and register `EvmModule`.
- Modify `src/app.module.spec.ts`: assert `EvmModule` is registered.

---

### Task 1: Add EVM Service

**Files:**
- Create: `src/api/v1/evm/evm.service.ts`
- Create: `src/api/v1/evm/evm.service.spec.ts`

**Interfaces:**
- Consumes: `ProviderService.getProvider(chain: ChainEnum)`, `ProviderService.getContract(address: string, abi: any, chain: ChainEnum)`.
- Consumes: `QuoterService.getQuoteResponse(body: SwapQuoteDto, verifiedWallet?: Wallet)`.
- Consumes: `UniswapService.buildSwapResponse(dto: SwapQuoteDto, verifiedWallet?: Wallet)`.
- Produces: `EvmService.getBalance(chain: string, walletAddressDto: WalletAddressDto, verifiedWallet?: Wallet): Promise<bigint>`.
- Produces: `EvmService.getWalletAddressInfo(chain: string, walletAddressDto: WalletAddressDto, verifiedWallet?: Wallet): Promise<{ transactionCount: number; gasFeeData: FeeData }>` .
- Produces: `EvmService.getTokenBalance(chain: string, tokenBalanceDto: WalletAddressDto & { tokenAddress: string }, verifiedWallet?: Wallet): Promise<{ walletBalance: bigint; tokenBalance: bigint }>` .
- Produces: `EvmService.getTokenInfo(chain: string, getTokenInfoDto: GetTokenInfoDto, verifiedWallet?: Wallet): Promise<TokenInfo[]>`.
- Produces: `EvmService.prepareTransaction(chain: string, prepareTransactionDto: PrepareTransactionDto, verifiedWallet?: Wallet): Promise<FullTransaction>`.
- Produces: `EvmService.broadcastTransaction(chain: string, broadcastTransactionDto: BroadcastTransactionDto): Promise<any>`.
- Produces: `EvmService.getSwapQuote(swapQuoteDto: SwapQuoteDto, verifiedWallet?: Wallet): Promise<any>`.
- Produces: `EvmService.prepareSwapTransaction(swapQuoteDto: SwapQuoteDto, verifiedWallet?: Wallet): Promise<any>`.

- [ ] **Step 1: Write the failing service tests**

Create `src/api/v1/evm/evm.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
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
    ).rejects.toThrow(BadRequestException);
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
```

- [ ] **Step 2: Run the service tests to verify they fail**

Run:

```bash
npm test -- src/api/v1/evm/evm.service.spec.ts --runInBand
```

Expected: FAIL because `src/api/v1/evm/evm.service.ts` does not exist.

- [ ] **Step 3: Write the minimal service implementation**

Create `src/api/v1/evm/evm.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { Contract, FeeData, formatUnits, JsonRpcProvider, TransactionResponse } from 'ethers';
import { ETH_ERC20_ABI } from '../common/abi/eth';
import { BroadcastTransactionDto } from '../common/dto/broadcastTransaction.dto';
import { GetTokenInfoDto } from '../common/dto/fetchTokenInfo.dto';
import { PrepareTransactionDto } from '../common/dto/prepareTransaction.dto';
import { SwapQuoteDto } from '../common/dto/swapQuote.dto';
import { WalletAddressDto } from '../common/dto/walletAddress.dto';
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
import {
  type Wallet,
  withExplicitVerifiedWalletAddress,
} from '../common/helpers/requestWallet';
import { ValidateAddress } from '../common/helpers/utilityMethods';
import { FullTransaction } from '../common/interface/transaction.interface';
import { TokenInfo } from '../common/interface/tokenInfo.interface';
import {
  createProviderBadRequestException,
  ProviderErrorCode,
  throwIfHttpException,
} from '../common/utils/provider-error.util';
import { withProviderControls } from '../common/utils/retry.util';
import { ProviderService } from '../provider/provider.service';
import { QuoterService } from '../quoter/quoter.service';
import { UniswapService } from '../swap/uniswap/uniswap.service';

type TokenBalanceDto = WalletAddressDto & { tokenAddress: string };

type BroadcastResult = {
  transactionHash: string;
  type: string;
  status: string;
};

const EVM_CHAIN_BY_PARAM: Record<string, ChainEnum> = {
  eth: ChainEnum.ETH,
  bsc: ChainEnum.BSC,
  bnb: ChainEnum.BSC,
  pol: ChainEnum.POL,
  matic: ChainEnum.POL,
  arb: ChainEnum.ARB,
  opt: ChainEnum.OP,
  op: ChainEnum.OP138,
  op138: ChainEnum.OP138,
  avax: ChainEnum.AVAX,
  ava: ChainEnum.AVAX,
  base: ChainEnum.BASE,
  bas: ChainEnum.BASE,
  gnosis: ChainEnum.GNO,
  gno: ChainEnum.GNO,
  zksync: ChainEnum.ZK,
  zk: ChainEnum.ZK,
  linea: ChainEnum.LINEA,
  sonic: ChainEnum.SONIC,
  unichain: ChainEnum.UNI,
  uni: ChainEnum.UNI,
};

@Injectable()
export class EvmService {
  constructor(
    private readonly providerService: ProviderService,
    private readonly quoterService: QuoterService,
    private readonly uniswapService: UniswapService,
  ) {}

  private resolveChain(chain: string): ChainEnum {
    const resolved = EVM_CHAIN_BY_PARAM[String(chain ?? '').trim().toLowerCase()];

    if (!resolved) {
      throw new BadRequestException('Unsupported EVM chain');
    }

    return resolved;
  }

  private provider(chain: string): JsonRpcProvider {
    return this.providerService.getProvider(this.resolveChain(chain));
  }

  private withVerifiedWallet<T extends Record<string, any>>(
    dto: T,
    verifiedWallet?: Wallet,
  ): T {
    return verifiedWallet
      ? withExplicitVerifiedWalletAddress(
          dto,
          verifiedWallet,
          'walletAddress',
          SupportedWalletChain.multi,
        )
      : dto;
  }

  private async withProviderControl<T>(
    chain: ChainEnum,
    action: string,
    operation: (attempt: number) => Promise<T>,
  ): Promise<T> {
    return withProviderControls(`evm:${chain}:${action}`, operation);
  }

  async getBalance(
    chain: string,
    walletAddressDto: WalletAddressDto,
    verifiedWallet?: Wallet,
  ): Promise<bigint> {
    try {
      const { walletAddress } = this.withVerifiedWallet(
        walletAddressDto,
        verifiedWallet,
      );
      return await getNativeCurrencyBalance(walletAddress, this.provider(chain));
    } catch (error) {
      throwIfHttpException(error);
      throw createProviderBadRequestException(error);
    }
  }

  async getWalletAddressInfo(
    chain: string,
    walletAddressDto: WalletAddressDto,
    verifiedWallet?: Wallet,
  ): Promise<{ transactionCount: number; gasFeeData: FeeData }> {
    try {
      const provider = this.provider(chain);
      const { walletAddress } = this.withVerifiedWallet(
        walletAddressDto,
        verifiedWallet,
      );
      const [transactionCount, gasFeeData] = await Promise.all([
        getTransactionCount(provider, walletAddress),
        getFeeData(provider),
      ]);

      return { transactionCount, gasFeeData };
    } catch (error) {
      throwIfHttpException(error);
      throw createProviderBadRequestException(error);
    }
  }

  async getTokenBalance(
    chain: string,
    tokenBalanceDto: TokenBalanceDto,
    verifiedWallet?: Wallet,
  ): Promise<{ walletBalance: bigint; tokenBalance: bigint }> {
    try {
      const provider = this.provider(chain);
      const { walletAddress, tokenAddress } = this.withVerifiedWallet(
        tokenBalanceDto,
        verifiedWallet,
      );
      const validTokenAddress = ValidateAddress(tokenAddress)[0];

      if (!validTokenAddress) {
        throw new BadRequestException('No valid token addresses provided');
      }

      const [walletBalance, tokenBalance] = await Promise.all([
        getNativeCurrencyBalance(walletAddress, provider),
        getErc20ContractTokenBalance(validTokenAddress, walletAddress, provider),
      ]);

      return { walletBalance, tokenBalance };
    } catch (error) {
      throwIfHttpException(error);
      throw createProviderBadRequestException(error);
    }
  }

  async getTokenInfo(
    chain: string,
    getTokenInfoDto: GetTokenInfoDto,
    verifiedWallet?: Wallet,
  ): Promise<TokenInfo[]> {
    try {
      const resolvedChain = this.resolveChain(chain);
      const { addresses, walletAddress } = this.withVerifiedWallet(
        getTokenInfoDto,
        verifiedWallet,
      );
      const validAddresses = ValidateAddress(addresses);

      if (validAddresses.length === 0) {
        throw new BadRequestException('No valid token addresses provided');
      }

      return await Promise.all(
        validAddresses.map(async (address) => {
          const tokenContract: Contract = this.providerService.getContract(
            address,
            ETH_ERC20_ABI,
            resolvedChain,
          );
          const { name, symbol, decimals, balance } =
            await getErc20ContractInfo(tokenContract, walletAddress);

          return {
            name,
            symbol,
            balance: formatUnits(balance, decimals),
            address,
            imageUrl: '',
            decimals,
          };
        }),
      );
    } catch (error) {
      throwIfHttpException(error);
      throw createProviderBadRequestException(error);
    }
  }

  async prepareTransaction(
    chain: string,
    prepareTransactionDto: PrepareTransactionDto,
    verifiedWallet?: Wallet,
  ): Promise<FullTransaction> {
    try {
      const provider = this.provider(chain);
      const { unsignedTx, walletAddress } = this.withVerifiedWallet(
        prepareTransactionDto,
        verifiedWallet,
      );
      const [nonce, gasLimit, feeData, network] = await Promise.all([
        getTransactionCount(provider, walletAddress),
        getEstimateGas(provider, walletAddress, unsignedTx),
        getFeeData(provider),
        getNetwork(provider),
      ]);

      return {
        unsignedTx,
        nonce,
        gasLimit,
        gasPrice: feeData?.maxFeePerGas ?? feeData?.gasPrice ?? null,
        chainId: network.chainId,
      };
    } catch (error) {
      throwIfHttpException(error);
      throw createProviderBadRequestException(error);
    }
  }

  async broadcastTransaction(
    chain: string,
    broadcastTransactionDto: BroadcastTransactionDto,
  ): Promise<any> {
    try {
      const resolvedChain = this.resolveChain(chain);
      const provider = this.providerService.getProvider(resolvedChain);
      const { signedTx, signedTransactions } = broadcastTransactionDto;
      const txArray = signedTransactions
        ? signedTransactions
        : signedTx
          ? [signedTx]
          : [];

      if (txArray.length === 0) {
        throw new BadRequestException('No signed transaction provided');
      }

      const results: BroadcastResult[] = [];

      for (let i = 0; i < txArray.length; i++) {
        const txResponse: TransactionResponse = await this.withProviderControl(
          resolvedChain,
          'broadcast',
          () => provider.broadcastTransaction(txArray[i]),
        );

        results.push({
          transactionHash: txResponse.hash,
          type: i === 0 && txArray.length > 1 ? 'approve' : 'transfer',
          status: 'pending',
        });
      }

      if (signedTx && !signedTransactions) {
        return {
          txHash: results[0].transactionHash,
          receipt: null,
        };
      }

      return {
        success: true,
        totalTransactions: txArray.length,
        results,
      };
    } catch (error) {
      throwIfHttpException(error);
      throw createProviderBadRequestException(
        error,
        ProviderErrorCode.TransactionRejected,
      );
    }
  }

  async getSwapQuote(
    swapQuoteDto: SwapQuoteDto,
    verifiedWallet?: Wallet,
  ): Promise<any> {
    return await this.quoterService.getQuoteResponse(
      swapQuoteDto,
      verifiedWallet,
    );
  }

  async prepareSwapTransaction(
    swapQuoteDto: SwapQuoteDto,
    verifiedWallet?: Wallet,
  ): Promise<any> {
    return await this.uniswapService.buildSwapResponse(
      swapQuoteDto,
      verifiedWallet,
    );
  }
}
```

- [ ] **Step 4: Run the service tests to verify they pass**

Run:

```bash
npm test -- src/api/v1/evm/evm.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit the service task**

Run:

```bash
git add src/api/v1/evm/evm.service.ts src/api/v1/evm/evm.service.spec.ts
git commit -m "feat: add generic evm service"
```

---

### Task 2: Add EVM Routes And Module Wiring

**Files:**
- Create: `src/api/v1/evm/evm.controller.ts`
- Create: `src/api/v1/evm/evm.controller.spec.ts`
- Create: `src/api/v1/evm/evm.module.ts`
- Modify: `src/app.module.ts`
- Modify: `src/app.module.spec.ts`

**Interfaces:**
- Consumes: all public methods produced by `EvmService` in Task 1.
- Produces: `EvmController` routes under `/api/v1/evm`.
- Produces: `EvmModule`, imported by `AppModule`.

- [ ] **Step 1: Write the failing controller and app-module tests**

Create `src/api/v1/evm/evm.controller.spec.ts`:

```ts
import {
  BODY_SIZE_LIMIT_KEY,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';
import { RATE_LIMIT_KEY } from '../common/decorators/rate-limit.decorator';
import { EvmController } from './evm.controller';

describe('EvmController', () => {
  let controller: EvmController;
  const evmService = {
    getSwapQuote: jest.fn(),
    prepareSwapTransaction: jest.fn(),
    broadcastTransaction: jest.fn(),
    getTokenInfo: jest.fn(),
    getBalance: jest.fn(),
    getWalletAddressInfo: jest.fn(),
    getTokenBalance: jest.fn(),
    prepareTransaction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new EvmController(evmService as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates native balance requests with chain and verified wallet', async () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const req = { wallet: { addresses: new Map() } };
    evmService.getBalance.mockResolvedValue(123n);

    await controller.getBalance(req, res, 'base', {
      walletAddress: '0x1111111111111111111111111111111111111111',
    });

    expect(evmService.getBalance).toHaveBeenCalledWith(
      'base',
      { walletAddress: '0x1111111111111111111111111111111111111111' },
      req.wallet,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(123n);
  });

  it('delegates transaction broadcast with chain', async () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const body = { signedTx: '0xsigned' };
    const result = { txHash: '0xhash', receipt: null };
    evmService.broadcastTransaction.mockResolvedValue(result);

    await controller.broadcastTransaction(res, 'arb', body as any);

    expect(evmService.broadcastTransaction).toHaveBeenCalledWith('arb', body);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it('delegates swap quotes without a route chain', async () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const req = { wallet: { addresses: new Map() } };
    const dto = { amount: '1' };
    const result = { success: true };
    evmService.getSwapQuote.mockResolvedValue(result);

    await controller.getSwapQuote(req, res, dto as any);

    expect(evmService.getSwapQuote).toHaveBeenCalledWith(dto, req.wallet);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it('applies route-specific body size limits to expensive write routes', () => {
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.broadcastTransaction),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.signedTransactionBatch,
      key: 'evm-transaction-broadcast',
    });
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.prepareTransaction),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.standard,
      key: 'evm-transaction-prepare',
    });
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.prepareSwap),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.standard,
      key: 'evm-swap-transaction-prepare',
    });
  });

  it('applies wallet-scoped rate limits to broadcast and swap prepare routes', () => {
    expect(
      Reflect.getMetadata(RATE_LIMIT_KEY, controller.broadcastTransaction),
    ).toEqual([
      {
        points: 20,
        duration: 60,
        key: 'evm-transaction-broadcast-ip',
        keyBy: 'ip',
      },
      {
        points: 10,
        duration: 60,
        key: 'evm-transaction-broadcast-device',
        keyBy: 'device',
      },
      {
        points: 10,
        duration: 60,
        key: 'evm-transaction-broadcast-wallet',
        keyBy: 'wallet',
      },
    ]);
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, controller.prepareSwap)).toEqual(
      [
        {
          points: 30,
          duration: 60,
          key: 'evm-swap-transaction-prepare-ip',
          keyBy: 'ip',
        },
        {
          points: 15,
          duration: 60,
          key: 'evm-swap-transaction-prepare-device',
          keyBy: 'device',
        },
        {
          points: 15,
          duration: 60,
          key: 'evm-swap-transaction-prepare-wallet',
          keyBy: 'wallet',
        },
      ],
    );
  });
});
```

Modify `src/app.module.spec.ts` by adding this test inside the existing `describe` block:

```ts
  it('registers the generic EVM module', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AppModule,
    ) as unknown[];
    const moduleNames = imports.map((moduleRef) => {
      if (typeof moduleRef === 'function') {
        return moduleRef.name;
      }
      return undefined;
    });

    expect(moduleNames).toContain('EvmModule');
  });
```

- [ ] **Step 2: Run the controller and app-module tests to verify they fail**

Run:

```bash
npm test -- src/api/v1/evm/evm.controller.spec.ts src/app.module.spec.ts --runInBand
```

Expected: FAIL because `EvmController` and `EvmModule` are not wired yet.

- [ ] **Step 3: Add the controller**

Create `src/api/v1/evm/evm.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import {
  BodySizeLimit,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';
import {
  RateLimit,
  rateLimitByIpDeviceAndWallet,
} from '../common/decorators/rate-limit.decorator';
import { BroadcastTransactionDto } from '../common/dto/broadcastTransaction.dto';
import { GetTokenInfoDto } from '../common/dto/fetchTokenInfo.dto';
import { PrepareTransactionDto } from '../common/dto/prepareTransaction.dto';
import { SwapQuoteDto } from '../common/dto/swapQuote.dto';
import { WalletAddressDto } from '../common/dto/walletAddress.dto';
import { EvmService } from './evm.service';

@Controller('/api/v1/evm')
export class EvmController {
  constructor(private readonly evmService: EvmService) {}

  @Post('swap-quote')
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'evm-swap-quote')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('evm-swap-quote', {
      ip: 60,
      device: 30,
      wallet: 30,
    }),
  )
  async getSwapQuote(
    @Req() req: any,
    @Res() res,
    @Body() swapQuoteDto: SwapQuoteDto,
  ) {
    const data = await this.evmService.getSwapQuote(swapQuoteDto, req.wallet);
    res.status(200).json(data);
  }

  @Post('swap-transaction/prepare')
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'evm-swap-transaction-prepare')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('evm-swap-transaction-prepare', {
      ip: 30,
      device: 15,
      wallet: 15,
    }),
  )
  async prepareSwap(
    @Req() req: any,
    @Res() res,
    @Body() swapQuoteDto: SwapQuoteDto,
  ) {
    const data = await this.evmService.prepareSwapTransaction(
      swapQuoteDto,
      req.wallet,
    );
    res.status(200).json(data);
  }

  @Post(':chain/transaction/broadcast')
  @BodySizeLimit(
    BODY_SIZE_LIMITS.signedTransactionBatch,
    'evm-transaction-broadcast',
  )
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('evm-transaction-broadcast', {
      ip: 20,
      device: 10,
      wallet: 10,
    }),
  )
  async broadcastTransaction(
    @Res() res,
    @Param('chain') chain: string,
    @Body() broadcastTransactionDto: BroadcastTransactionDto,
  ) {
    const data = await this.evmService.broadcastTransaction(
      chain,
      broadcastTransactionDto,
    );
    res.status(200).json(data);
  }

  @Post(':chain/token/info')
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'evm-token-info')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('evm-token-info', {
      ip: 60,
      device: 30,
      wallet: 30,
    }),
  )
  async fetchTokenInfo(
    @Req() req: any,
    @Res() res,
    @Param('chain') chain: string,
    @Body() getTokenInfoDto: GetTokenInfoDto,
  ) {
    const data = await this.evmService.getTokenInfo(
      chain,
      getTokenInfoDto,
      req.wallet,
    );
    res.status(200).json(data);
  }

  @Get(':chain/:walletAddress/balance')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('evm-balance', {
      ip: 120,
      device: 60,
      wallet: 60,
    }),
  )
  async getBalance(
    @Req() req: any,
    @Res() res,
    @Param('chain') chain: string,
    @Param() walletAddressDto: WalletAddressDto,
  ) {
    const data = await this.evmService.getBalance(
      chain,
      walletAddressDto,
      req.wallet,
    );
    res.status(200).json(data);
  }

  @Get(':chain/wallet-address/:walletAddress/info')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('evm-wallet-info', {
      ip: 120,
      device: 60,
      wallet: 60,
    }),
  )
  async getAddressInfo(
    @Req() req: any,
    @Res() res,
    @Param('chain') chain: string,
    @Param() walletAddressDto: WalletAddressDto,
  ) {
    const data = await this.evmService.getWalletAddressInfo(
      chain,
      walletAddressDto,
      req.wallet,
    );
    res.status(200).json(data);
  }

  @Get(':chain/:walletAddress/token/:tokenAddress/balance')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('evm-token-balance', {
      ip: 120,
      device: 60,
      wallet: 60,
    }),
  )
  async getTokenBalance(
    @Req() req: any,
    @Res() res,
    @Param('chain') chain: string,
    @Param() tokenBalanceDto: WalletAddressDto & { tokenAddress: string },
  ) {
    const data = await this.evmService.getTokenBalance(
      chain,
      tokenBalanceDto,
      req.wallet,
    );
    res.status(200).json(data);
  }

  @Post(':chain/transaction/prepare')
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'evm-transaction-prepare')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('evm-transaction-prepare', {
      ip: 30,
      device: 15,
      wallet: 15,
    }),
  )
  async prepareTransaction(
    @Req() req: any,
    @Res() res,
    @Param('chain') chain: string,
    @Body() prepareTransactionDto: PrepareTransactionDto,
  ) {
    const data = await this.evmService.prepareTransaction(
      chain,
      prepareTransactionDto,
      req.wallet,
    );
    res.status(200).json(data);
  }
}
```

- [ ] **Step 4: Add the module**

Create `src/api/v1/evm/evm.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ProviderModule } from '../provider/provider.module';
import { QuoterModule } from '../quoter/quoter.module';
import { UniswapModule } from '../swap/uniswap/uniswap.module';
import { EvmController } from './evm.controller';
import { EvmService } from './evm.service';

@Module({
  imports: [ProviderModule, QuoterModule, UniswapModule],
  providers: [EvmService],
  controllers: [EvmController],
})
export class EvmModule {}
```

- [ ] **Step 5: Register EvmModule in AppModule**

Modify `src/app.module.ts`:

```ts
import { EvmModule } from './api/v1/evm/evm.module';
```

Add `EvmModule` to the `imports` array after `BscModule`:

```ts
    BscModule,
    EvmModule,
```

- [ ] **Step 6: Run the focused route and service tests**

Run:

```bash
npm test -- src/api/v1/evm/evm.service.spec.ts src/api/v1/evm/evm.controller.spec.ts src/app.module.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Run build and lint check**

Run:

```bash
npm run build
npm run lint:check
```

Expected: both commands exit 0.

- [ ] **Step 8: Commit the route wiring task**

Run:

```bash
git add src/api/v1/evm/evm.controller.ts src/api/v1/evm/evm.controller.spec.ts src/api/v1/evm/evm.module.ts src/app.module.ts src/app.module.spec.ts
git commit -m "feat: add generic evm routes"
```

---

## Final Verification

- [ ] **Step 1: Run the full unit suite**

Run:

```bash
npm test -- --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run coverage check**

Run:

```bash
npm run test:coverage:check
```

Expected: PASS.

- [ ] **Step 3: Check git status**

Run:

```bash
git status --short
```

Expected: no unstaged or uncommitted files unless the test suite intentionally writes coverage artifacts ignored by git.
