const mockAlphaRoute = jest.fn();
const mockUniswapRpcProvider = {
  getFeeData: jest.fn(),
  getTransactionCount: jest.fn(),
};
const mockEthersJsonRpcProvider = {
  call: jest.fn(),
  waitForTransaction: jest.fn(),
};
const mockCrossChainSdk = {
  createOrder: jest.fn(),
  getOrderStatus: jest.fn(),
  getQuote: jest.fn(),
  getReadyToAcceptSecretFills: jest.fn(),
  submitNativeOrder: jest.fn(),
  submitSecret: jest.fn(),
};
const mockFusionSdk = {
  createOrder: jest.fn(),
  getOrderStatus: jest.fn(),
  getQuote: jest.fn(),
  submitNativeOrder: jest.fn(),
};
const mockEvmCrossChainOrder = class EvmCrossChainOrder {};

jest.mock('@uniswap/smart-order-router', () => ({
  AlphaRouter: jest.fn().mockImplementation(() => ({
    route: mockAlphaRoute,
  })),
  SwapType: {
    SWAP_ROUTER_02: 'SWAP_ROUTER_02',
  },
}));

jest.mock('@ethersproject/providers', () => ({
  JsonRpcProvider: jest.fn().mockImplementation(() => mockUniswapRpcProvider),
}));

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  const mockContract = jest.fn().mockImplementation(() => ({
    name: jest.fn().mockResolvedValue('Mock Token'),
    symbol: jest.fn().mockResolvedValue('MOCK'),
    decimals: jest.fn().mockResolvedValue(18),
    balanceOf: jest.fn().mockResolvedValue(1000000000000000000n),
  }));
  const mockJsonRpcProvider = jest
    .fn()
    .mockImplementation(() => mockEthersJsonRpcProvider);

  return {
    ...actual,
    Contract: mockContract,
    JsonRpcProvider: mockJsonRpcProvider,
    ethers: {
      ...actual.ethers,
      Contract: mockContract,
      JsonRpcProvider: mockJsonRpcProvider,
    },
  };
});

jest.mock('@1inch/cross-chain-sdk', () => ({
  Address: jest.fn().mockImplementation((value: string) => ({
    toString: () => value,
  })),
  EvmAddress: { fromString: jest.fn((value: string) => value) },
  EvmCrossChainOrder: mockEvmCrossChainOrder,
  HashLock: {
    forMultipleFills: jest.fn((leaves: string[]) => ({
      leaves,
      type: 'multiple',
    })),
    forSingleFill: jest.fn((secret: string) => ({
      secret,
      type: 'single',
    })),
    getMerkleLeavesFromSecretHashes: jest.fn((hashes: string[]) => hashes),
    hashSecret: jest.fn((secret: string) => `hash:${secret}`),
  },
  MerkleLeaf: jest.fn(),
  NativeOrdersFactory: {
    default: jest.fn(() => ({
      create: jest.fn(() => ({
        data: '0xnativecalldata',
        to: {
          toString: () => '0x9999999999999999999999999999999999999999',
        },
        value: {
          toString: () => '0',
        },
      })),
    })),
  },
  OrderStatus: {
    Cancelled: 'Cancelled',
    Executed: 'Executed',
    Expired: 'Expired',
    Pending: 'Pending',
    Refunded: 'Refunded',
    Refunding: 'Refunding',
  },
  PresetEnum: { fast: 'fast' },
  SDK: jest.fn().mockImplementation(() => mockCrossChainSdk),
}));

jest.mock('@1inch/fusion-sdk', () => ({
  Address: jest.fn().mockImplementation((value: string) => ({
    toString: () => value,
  })),
  FusionSDK: jest.fn().mockImplementation(() => mockFusionSdk),
  OrderStatus: {
    Cancelled: 'Cancelled',
    Expired: 'Expired',
    Filled: 'Filled',
  },
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    request: jest.fn(),
  },
  get: jest.fn(),
  post: jest.fn(),
  request: jest.fn(),
}));

import axios from 'axios';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Wallet as EthersWallet } from 'ethers';
import { json, urlencoded } from 'express';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import {
  DEVICE_AUTH_TOKEN_HEADER,
  WALLET_AUTH_TOKEN_HEADER,
} from '../src/api/v1/common/middleware/device-auth-token.middleware';
import { bigintJsonSerializerMiddleware } from '../src/api/v1/common/middleware/bigintJsonSerializer.middleware';
import { UserQueueService } from '../src/api/v1/common/user-queue/user-queue.service';
import { DeviceRepository } from '../src/api/v1/device/device.repository';
import { FirebaseNotificationService } from '../src/api/v1/notification/firebase/notification.service';
import { MarketDataRepository } from '../src/api/v1/market-data/market-data.repository';
import { HttpService as AlchemyHttpService } from '../src/api/v1/on-off-ramp/alchemy/http.service';
import { HttpService as CommonHttpService } from '../src/api/v1/common/services/httpService';
import { ProviderService } from '../src/api/v1/provider/provider.service';
import { RedisService } from '../src/api/v1/redis/redis.service';
import { SwapOrderRepository } from '../src/api/v1/swapOrders/swapOrder.repository';
import { WalletRepository } from '../src/api/v1/wallet/wallet.repository';

type HttpMethod = 'get' | 'patch' | 'post';
type AuthMode = 'device' | 'wallet';

type RouteCase = {
  auth?: AuthMode;
  body?: any;
  expectedBody?: any;
  expectedText?: string;
  expectedStatus?: number;
  method: HttpMethod;
  name: string;
  origin?: string;
  path: string;
  query?: Record<string, string>;
};

const walletAddress = '0x1111111111111111111111111111111111111111';
const tokenAddress = '0x2222222222222222222222222222222222222222';
const nativeTokenAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const deviceId = 'device-id';
const stellarAddress =
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const signedTx = '0xsignedtransaction';

const device = {
  _id: deviceId,
  deviceToken: 'device-token',
  fcmToken: 'old-fcm-token',
  userId: 'user-id',
};
const wallet = {
  _id: 'wallet-id',
  addresses: {
    bnb: walletAddress,
    eth: walletAddress,
    multi: walletAddress,
    xlm: stellarAddress,
  },
};
const feeData = {
  gasPrice: 1n,
  maxFeePerGas: 2n,
  maxPriorityFeePerGas: 1n,
};
const unsignedTx = {
  data: '0x',
  to: tokenAddress,
  value: '0x0',
};
const quoteBody = {
  amount: '1',
  tokenIn: {
    address: nativeTokenAddress,
    chainId: 1,
  },
  tokenOut: {
    address: nativeTokenAddress,
    chainId: 1,
  },
};
const bscQuoteBody = {
  amount: '1',
  tokenIn: {
    address: nativeTokenAddress,
    chainId: 56,
  },
  tokenOut: {
    address: nativeTokenAddress,
    chainId: 56,
  },
};
const gaslessQuoteBody = {
  ...quoteBody,
  option: 'gasLess',
  tokenOut: {
    address: nativeTokenAddress,
    chainId: 56,
  },
};
const ethSwapPrepareBody = {
  approveData: '0x095ea7b3',
  depositData: '0xdeposit',
  swapData: '0xswap',
  swapType: 'EthToUsdc',
  value: '1000000000000000000',
};
const inchQuoteBody = {
  amount: '1',
  chain: 'ETH',
  tokenIn: tokenAddress,
  tokenOut: nativeTokenAddress,
};
const fusionPlusQuoteBody = {
  amount: '1',
  dstChain: 'BSC',
  dstTokenAddress: nativeTokenAddress,
  srcChain: 'ETH',
  srcTokenAddress: tokenAddress,
};
const fusionNativeOrderBody = {
  ...fusionPlusQuoteBody,
};
const fusionNativeConfirmBody = {
  orderHash: '0xnativehash',
  srcChain: 'ETH',
  txHash: '0xnativefulfillment',
};
const fusionOrderBody = {
  amount: '1',
  chain: 'ETH',
  quote: { quoteId: 'quote-id' },
  tokenIn: tokenAddress,
  tokenOut: nativeTokenAddress,
};
const fusionPlusOrderBody = {
  quoteId: 'quote-id',
  requiresApprovalTransaction: false,
  secretCount: 1,
};
const submitOrderBody = {
  chain: 'ETH',
  extension: '0xextension',
  order: {
    maker: walletAddress,
    makerAsset: tokenAddress,
    makerTraits: 'traits',
    makingAmount: '1',
    receiver: walletAddress,
    salt: 'salt',
    takerAsset: nativeTokenAddress,
    takingAmount: '2',
  },
  orderHash: '0xorderhash',
  quoteId: 'quote-id',
  signature: '0xsignature',
};
const signingWallet = EthersWallet.createRandom();
const validSigningPayload = `Sign:\nNonce: integration-test\nExpires At: ${new Date(
  Date.now() + 60 * 60 * 1000,
).toISOString()}`;

describe('AppModule HTTP integration', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  const broadcastTransaction = jest.fn();
  const provider = {
    broadcastTransaction,
    estimateGas: jest.fn().mockResolvedValue(21000n),
    getBalance: jest.fn().mockResolvedValue(1000000000000000000n),
    getFeeData: jest.fn().mockResolvedValue(feeData),
    getNetwork: jest.fn().mockResolvedValue({ chainId: 1n }),
    getTransactionCount: jest.fn().mockResolvedValue(7),
  };
  const tokenContract = {
    balanceOf: jest.fn().mockResolvedValue(1000000000000000000n),
    decimals: jest.fn().mockResolvedValue(18),
    fee: jest.fn().mockResolvedValue(3000n),
    getAmountsOut: jest
      .fn()
      .mockResolvedValue([1000000000000000000n, 2000000000000000000n]),
    getPool: jest.fn().mockResolvedValue(tokenAddress),
    interface: {
      encodeFunctionData: jest.fn().mockReturnValue('0xencoded'),
    },
    name: jest.fn().mockResolvedValue('Mock Token'),
    quoteExactInputSingle: jest.fn().mockResolvedValue({
      0: 1000000000000000000n,
      amountOut: 1000000000000000000n,
    }),
    symbol: jest.fn().mockResolvedValue('MOCK'),
  };

  const marketData = [{ symbol: 'ETH', price: 1000 }];
  const onOffRampQuote = {
    data: { quoteId: 'quote-id' },
    success: true,
  };
  const onOffRampOrder = {
    success: { data: { orderId: 'order-id' }, status: true },
  };
  const onOffRampAssets = {
    data: {
      crypto_assets: [{ code: 'ETH' }],
      fiat_currencies: [{ code: 'USD' }],
      order_type: 'buy',
      payment_methods: [{ id: 'card', type: 'buy' }],
      status: true,
    },
    status: true,
  };
  const onOffRampLink = {
    externalTransactionId: expect.any(String),
    url: expect.stringContaining('https://moonpay.example/buy?'),
  };
  const updatedDevice = { ...device, fcmToken: 'new-fcm-token' };
  const userDevice = { ...device, userId: 'user-id' };
  const createdWallet = { ...wallet, label: 'Primary' };
  const ethQuote = {
    fee: '3000',
    inputAmount: '1',
    inputToken: 'ETH',
    outputAmount: '1.0',
    outputToken: 'ETH',
    poolAddress: tokenAddress,
    pricePerToken: '1.000000',
  };
  const ethSwapPrepare = [
    {
      chainId: '1',
      data: ethSwapPrepareBody.depositData,
      gasLimit: 27300,
      maxFeePerGas: '2',
      maxPriorityFeePerGas: '1',
      nonce: 7,
      to: process.env.WETH_ADDRESS,
      type: 2,
      value: ethSwapPrepareBody.value,
    },
    {
      chainId: '1',
      data: ethSwapPrepareBody.approveData,
      gasLimit: 27300,
      maxFeePerGas: '2',
      maxPriorityFeePerGas: '1',
      nonce: 8,
      to: process.env.WETH_ADDRESS,
      type: 2,
    },
    {
      chainId: '1',
      data: ethSwapPrepareBody.swapData,
      gasLimit: 27300,
      maxFeePerGas: '2',
      maxPriorityFeePerGas: '1',
      nonce: 9,
      to: process.env.SWAP_ROUTER_ADDRESS,
      type: 2,
    },
  ];
  const broadcastResponse = { receipt: null, txHash: '0xmockhash' };
  const tokenInfoResponse = [
    {
      address: tokenAddress,
      balance: '1.0',
      decimals: 18,
      imageUrl: '',
      name: 'Mock Token',
      symbol: 'MOCK',
    },
  ];
  const walletInfoResponse = {
    gasFeeData: {
      gasPrice: '1',
      maxFeePerGas: '2',
      maxPriorityFeePerGas: '1',
    },
    transactionCount: 7,
  };
  const preparedTransactionResponse = {
    chainId: '1',
    gasLimit: '21000',
    gasPrice: '2',
    nonce: 7,
    unsignedTx,
  };
  const bscPreparedTransactionResponse = {
    ...preparedTransactionResponse,
    gasPrice: '1',
  };
  const usdtPrepare = {
    data: '0xencoded',
    gasLimit: '300000',
    to: process.env.SWAP_ROUTER_ADDRESS,
    value: '0',
  };
  const bscSwapPrepare = {
    chainId: '1',
    data: expect.stringMatching(/^0x7ff36ab5[0-9a-f]+$/),
    gasLimit: '300000',
    maxFeePerGas: '2',
    maxPriorityFeePerGas: '1',
    nonce: 7,
    to: process.env.BSC_ROUTER_ADDRESS,
    value: '1000000000000000000',
  };
  const tokenBalanceResponse = {
    tokenBalance: '1000000000000000000',
    walletBalance: '1000000000000000000',
  };
  const uniswapQuote = {
    fee: '3000',
    inputAmount: '1',
    inputToken: 'ETH',
    isMultiHop: false,
    minimumReceived: '1.000000000000000000',
    networkFee: 0.000021,
    outputAmount: '2',
    outputToken: 'ETH',
    pricePerToken: '2',
  };
  const uniswapRoute = {
    estimatedGasUsed: {
      toString: () => '21000',
    },
    gasPriceWei: {
      toString: () => '1000000000',
    },
    methodParameters: {
      calldata: '0xswapcalldata',
      to: '0x9999999999999999999999999999999999999999',
      value: '0',
    },
    quote: {
      toExact: () => '2',
    },
    route: [
      {
        pools: [
          {
            fee: {
              toString: () => '3000',
            },
          },
        ],
        tokenPath: [{ symbol: 'ETH' }, { symbol: 'ETH' }],
      },
    ],
  };
  const quoterUniswapResponse = {
    data: uniswapQuote,
    provider: 'UNISWAP',
    success: true,
  };
  const quoterFusionPlusResponse = {
    data: { provider: '1inch', route: 'fusion-plus-quote' },
    provider: 'ONEINCH_FUSION_PLUS',
    success: true,
  };
  const swapResponse = {
    data: [
      {
        chainId: 1,
        data: '0xswapcalldata',
        from: walletAddress,
        gasLimit: '220000',
        maxFeePerGas: '2',
        maxPriorityFeePerGas: '1',
        nonce: 7,
        to: '0x9999999999999999999999999999999999999999',
        type: 2,
        value: '0',
      },
    ],
    success: true,
  };
  const inchQuote = { provider: '1inch', route: 'quote' };
  const inchFusionPlusQuote = { provider: '1inch', route: 'fusion-plus-quote' };
  const inchFusionOrder = { provider: '1inch', route: 'fusion-order' };
  const inchFusionPlusOrder = {
    provider: '1inch',
    route: 'fusion-plus-order',
  };
  const inchSubmitOrder = { provider: '1inch', route: 'submit-order' };
  const inchSubmitFusionPlusOrder = {
    provider: '1inch',
    route: 'submit-fusion-plus-order',
  };
  const inchOrderStatus = { status: 'pending' };
  const inchNativeQuote = {
    presets: {
      fast: {
        secretsCount: 1,
      },
    },
    recommendedPreset: 'fast',
    srcChainId: 1,
  };
  const inchNativeOrder = {
    orderHash: '0xnativehash',
    quote: inchNativeQuote,
    transaction: {
      data: '0xnativecalldata',
      to: '0x9999999999999999999999999999999999999999',
      value: '0',
    },
  };
  const inchNativeConfirm = {
    message: 'Fulfillment loop initiated on backend.',
    success: true,
    typeTx: 'fusion',
  };
  const storedSwapOrder = { orderHash: '0xorderhash' };
  const swapOrders = [{ orderHash: '0xorderhash' }];
  const swapOrder = { orderHash: '0xorderhash' };
  const redisStore = new Map<string, string>();

  const deviceRepository = {
    create: jest.fn().mockResolvedValue(device),
    findOne: jest.fn((condition: Record<string, any>) => {
      if (condition?._id === deviceId || condition?.uniqueId === 'web-device') {
        return Promise.resolve(device);
      }

      return Promise.resolve(null);
    }),
    updateFcmToken: jest.fn().mockResolvedValue(updatedDevice),
    updateUser: jest.fn().mockResolvedValue(userDevice),
  };
  const walletRepository = {
    create: jest.fn().mockResolvedValue(createdWallet),
    find: jest.fn().mockResolvedValue([wallet]),
    findOne: jest.fn((condition: Record<string, any>) => {
      if (condition?._id === createdWallet._id) {
        return Promise.resolve(createdWallet);
      }

      return Promise.resolve(wallet);
    }),
  };
  const marketDataRepository = {
    getMarketData: jest.fn().mockResolvedValue(marketData),
    updateBulk: jest.fn().mockResolvedValue(undefined),
  };
  const swapOrderRepository = {
    create: jest.fn().mockResolvedValue(storedSwapOrder),
    findById: jest.fn().mockResolvedValue({ ok: true, data: null }),
    findByProviderAndStatusesSince: jest
      .fn()
      .mockResolvedValue({ ok: true, data: [] }),
    findByTxHash: jest.fn().mockResolvedValue({ ok: true, data: null }),
    findByTxHashForWallet: jest.fn().mockResolvedValue({
      ok: true,
      data: swapOrder,
    }),
    findByWalletWithPagination: jest.fn().mockResolvedValue({
      ok: true,
      data: {
        data: swapOrders,
        hasNext: false,
        hasPrev: false,
        limit: 10,
        page: 1,
        total: 1,
        totalPages: 1,
      },
    }),
    findPendingByProvider: jest.fn().mockResolvedValue({ ok: true, data: [] }),
    findPendingByProviderSince: jest
      .fn()
      .mockResolvedValue({ ok: true, data: [] }),
    updateOrderStatus: jest.fn().mockResolvedValue(swapOrder),
    updateStatus: jest.fn().mockResolvedValue({ ok: true }),
  };
  const commonHttpService = {
    delete: jest.fn(),
    get: jest.fn((request: { url: string }) => {
      if (request.url.endsWith('/v2/crypto')) {
        return Promise.resolve({ data: [{ code: 'ETH' }], status: true });
      }

      if (request.url.endsWith('/v2/fiats')) {
        return Promise.resolve({ data: [{ code: 'USD' }], status: true });
      }

      if (request.url.endsWith('/v2/payment-methods')) {
        return Promise.resolve({
          data: { data: { payment_methods: [{ id: 'card', type: 'buy' }] } },
          status: true,
        });
      }

      return Promise.resolve({ data: [], status: true });
    }),
    post: jest.fn(),
    put: jest.fn(),
    request: jest.fn((request: { url: string }) => {
      if (request.url.includes('/quote/')) {
        return Promise.resolve({ data: { quoteId: 'quote-id' }, status: true });
      }

      return Promise.resolve({ data: { orderId: 'order-id' }, status: true });
    }),
  };
  const alchemyHttpService = {
    delete: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    request: jest.fn().mockResolvedValue({
      data: { quoteId: 'alchemy-quote-id' },
      status: true,
    }),
  };
  const userQueueService = {
    processUserRequest: jest.fn((handler: () => Promise<any>) => handler()),
  };

  beforeAll(async () => {
    broadcastTransaction.mockResolvedValue({ hash: '0xmockhash' });
    redisStore.clear();
    mockAlphaRoute.mockResolvedValue(uniswapRoute);
    mockUniswapRpcProvider.getFeeData.mockResolvedValue(feeData);
    mockUniswapRpcProvider.getTransactionCount.mockResolvedValue(7);
    mockEthersJsonRpcProvider.call.mockResolvedValue('0x');
    mockEthersJsonRpcProvider.waitForTransaction.mockReturnValue(
      new Promise(() => undefined),
    );
    mockCrossChainSdk.getQuote.mockResolvedValue(inchNativeQuote);
    mockCrossChainSdk.createOrder.mockReturnValue({
      hash: '0xnativehash',
      order: new mockEvmCrossChainOrder(),
      quoteId: 'native-quote-id',
    });
    mockCrossChainSdk.submitNativeOrder.mockResolvedValue({
      order: { provider: '1inch', route: 'native-order' },
    });
    mockCrossChainSdk.getOrderStatus.mockResolvedValue({ status: 'Pending' });
    mockCrossChainSdk.getReadyToAcceptSecretFills.mockResolvedValue({
      fills: [],
    });
    mockCrossChainSdk.submitSecret.mockResolvedValue(undefined);
    mockFusionSdk.getOrderStatus.mockResolvedValue({ status: 'Filled' });
    const mockedAxios = axios as jest.Mocked<typeof axios>;
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/fusion-plus/quoter/quote/receive')) {
        return Promise.resolve({ data: inchFusionPlusQuote });
      }

      if (url.includes('/quote/receive')) {
        return Promise.resolve({ data: inchQuote });
      }

      if (
        url.includes('/order/status/') ||
        url.includes('/fusion-plus/order')
      ) {
        return Promise.resolve({ data: inchOrderStatus });
      }

      throw new Error(`Unexpected axios.get URL: ${url}`);
    });
    mockedAxios.post.mockImplementation((url: string) => {
      if (url.includes('/fusion-plus/quoter/quote/build/evm')) {
        return Promise.resolve({ data: inchFusionPlusOrder });
      }

      if (url.includes('/quote/build')) {
        return Promise.resolve({ data: inchFusionOrder });
      }

      if (url.includes('/fusion-plus/relayer/submit')) {
        return Promise.resolve({ data: inchSubmitFusionPlusOrder });
      }

      if (url.includes('/order/submit')) {
        return Promise.resolve({ data: inchSubmitOrder });
      }

      throw new Error(`Unexpected axios.post URL: ${url}`);
    });
    (global as any).fetch = jest.fn((url: string) => {
      if (String(url).includes('/v3/currencies?')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                code: 'eth',
                isSellSupported: true,
                isSuspended: false,
                metadata: { networkCode: 'ethereum' },
                name: 'Ethereum',
                type: 'crypto',
              },
            ]),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            feeAmount: 1,
            networkFeeAmount: 0.1,
            quoteCurrencyAmount: 0.5,
            totalAmount: 101.1,
          }),
      });
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useValue({
        delKey: jest.fn((key: string) => {
          redisStore.delete(key);
          return Promise.resolve(undefined);
        }),
        getHealthSnapshot: jest.fn().mockReturnValue({
          healthy: true,
          state: 'ready',
        }),
        getKey: jest.fn((key: string) =>
          Promise.resolve(redisStore.get(key) ?? null),
        ),
        isHealthy: jest.fn().mockReturnValue(true),
        onModuleDestroy: jest.fn(),
        onModuleInit: jest.fn(),
        pingHealth: jest.fn().mockResolvedValue(true),
        setKey: jest.fn((key: string, value: unknown) => {
          redisStore.set(key, String(value));
          return Promise.resolve(undefined);
        }),
      })
      .overrideProvider(ProviderService)
      .useValue({
        getContract: jest.fn().mockReturnValue(tokenContract),
        getChainRpcUrl: jest.fn().mockReturnValue('http://127.0.0.1:8545'),
        getProvider: jest.fn().mockReturnValue(provider),
        getProviderForChainId: jest.fn().mockReturnValue(provider),
        getRpcUrl: jest.fn().mockReturnValue('http://127.0.0.1:8545'),
      })
      .overrideProvider(FirebaseNotificationService)
      .useValue({
        onModuleInit: jest.fn(),
        sendNotification: jest.fn().mockResolvedValue('mock-message-id'),
      })
      .overrideProvider(DeviceRepository)
      .useValue(deviceRepository)
      .overrideProvider(WalletRepository)
      .useValue(walletRepository)
      .overrideProvider(MarketDataRepository)
      .useValue(marketDataRepository)
      .overrideProvider(SwapOrderRepository)
      .useValue(swapOrderRepository)
      .overrideProvider(CommonHttpService)
      .useValue(commonHttpService)
      .overrideProvider(AlchemyHttpService)
      .useValue(alchemyHttpService)
      .overrideProvider(UserQueueService)
      .useValue(userQueueService)
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.use(
      json({ limit: '512kb' }),
      urlencoded({ extended: true, limit: '512kb' }),
    );
    app.use(bigintJsonSerializerMiddleware);
    jwtService = moduleFixture.get(JwtService);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  function walletToken(): string {
    return jwtService.sign({ multi: walletAddress });
  }

  function deviceToken(): string {
    return jwtService.sign({ _id: deviceId });
  }

  async function expectRoute(route: RouteCase): Promise<void> {
    const client = request(app.getHttpServer()) as any;
    let httpRequest = client[route.method](route.path);

    if (route.query) {
      httpRequest = httpRequest.query(route.query);
    }

    if (route.auth === 'wallet') {
      httpRequest = httpRequest.set(WALLET_AUTH_TOKEN_HEADER, walletToken());
    }

    if (route.auth === 'device') {
      httpRequest = httpRequest.set(DEVICE_AUTH_TOKEN_HEADER, deviceToken());
    }

    if (route.origin) {
      httpRequest = httpRequest.set('Origin', route.origin);
    }

    const body =
      typeof route.body === 'function' ? await route.body() : route.body;

    if (body !== undefined) {
      httpRequest = httpRequest.send(body);
    }

    const response = await httpRequest.expect(route.expectedStatus ?? 200);

    if ('expectedBody' in route) {
      expect(response.body).toEqual(route.expectedBody);
    }

    if (route.expectedText !== undefined) {
      expect(response.text).toBe(route.expectedText);
    }
  }

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  describe('public routes', () => {
    const cases: RouteCase[] = [
      {
        expectedBody: {
          payload: expect.stringMatching(
            /^Sign:\nNonce: [a-f0-9]{32}\nExpires At: .+$/,
          ),
        },
        method: 'get',
        name: 'creates a signing request',
        path: '/api/v1/signing/request',
      },
      {
        body: async () => ({
          payload: validSigningPayload,
          signature: await signingWallet.signMessage(validSigningPayload),
        }),
        expectedBody: { jwt: expect.any(String), valid: true },
        method: 'post',
        name: 'verifies a signing response',
        path: '/api/v1/signing/verify',
      },
      {
        body: {
          fcmToken: 'fcm-token',
          type: 'ios',
          uniqueId: 'device-unique-id',
        },
        expectedBody: { deviceToken: expect.any(String) },
        expectedStatus: 201,
        method: 'post',
        name: 'creates a device',
        path: '/api/v1/device',
      },
      {
        expectedBody: { marketData },
        expectedStatus: 201,
        method: 'get',
        name: 'returns market data',
        path: '/api/v1/market-data',
      },
      {
        body: {
          blockchain: 'ETH',
          crypto: 'ETH',
          fiat: 'USD',
          fiatAmount: '100',
          paymentMethodId: 'card',
          provider: 'banxa',
          side: 'buy',
        },
        expectedBody: onOffRampQuote,
        expectedStatus: 201,
        method: 'post',
        name: 'gets an on/off-ramp quote',
        path: '/api/v1/on-off-ramp/quote',
      },
      {
        body: {
          blockchain: 'ETH',
          crypto: 'ETH',
          fiat: 'USD',
          fiatAmount: '100',
          paymentMethodId: 'card',
          provider: 'banxa',
          side: 'buy',
          walletAddress,
        },
        expectedBody: onOffRampOrder,
        expectedStatus: 201,
        method: 'post',
        name: 'creates an on/off-ramp order',
        path: '/api/v1/on-off-ramp/order',
      },
      {
        expectedBody: onOffRampAssets,
        method: 'get',
        name: 'lists on/off-ramp assets',
        path: '/api/v1/on-off-ramp/assets',
        query: { provider: 'banxa', side: 'buy' },
      },
      {
        body: {
          amount: 1,
          code: 'eth',
          fiat: 'usd',
          provider: 'moonpay',
          side: 'buy',
          wallet: walletAddress,
        },
        expectedBody: onOffRampLink,
        expectedStatus: 201,
        method: 'post',
        name: 'builds an on/off-ramp link',
        path: '/api/v1/on-off-ramp/link',
      },
      {
        auth: 'device',
        body: { title: 'Swap', message: 'Done' },
        expectedText: 'true',
        expectedStatus: 201,
        method: 'post',
        name: 'fires a custom notification from an allowed origin',
        origin: 'http://localhost',
        path: '/api/v1/swap/1inch/customNotification',
      },
    ];

    it.each(cases)('$name', expectRoute);
  });

  describe('device-authenticated routes', () => {
    const cases: RouteCase[] = [
      {
        auth: 'device',
        body: { fcmToken: 'new-fcm-token' },
        expectedBody: { device: updatedDevice },
        method: 'patch',
        name: 'updates an FCM token',
        path: '/api/v1/device/update-fcm-token',
      },
      {
        auth: 'device',
        body: { attestation: { challenge: 'challenge' } },
        expectedBody: { device: userDevice },
        method: 'patch',
        name: 'updates a device user',
        path: '/api/v1/device/update-user',
      },
      {
        auth: 'device',
        body: { addresses: wallet.addresses },
        expectedBody: { wallet: createdWallet },
        expectedStatus: 201,
        method: 'post',
        name: 'creates a wallet',
        path: '/api/v1/wallet',
      },
      {
        auth: 'device',
        expectedBody: { wallets: [wallet] },
        method: 'get',
        name: 'finds wallets by multichain address',
        path: `/api/v1/wallet/multi/address/${walletAddress}`,
      },
      {
        auth: 'device',
        expectedBody: { wallets: [wallet] },
        method: 'get',
        name: 'finds wallets by stellar address',
        path: `/api/v1/wallet/${stellarAddress}/address`,
      },
    ];

    it.each(cases)('$name', expectRoute);
  });

  describe('wallet-authenticated chain routes', () => {
    const cases: RouteCase[] = [
      {
        auth: 'wallet',
        body: quoteBody,
        expectedBody: ethQuote,
        method: 'post',
        name: 'gets an ETH swap quote',
        path: '/api/v1/eth/swap-quote',
      },
      {
        auth: 'wallet',
        body: { signedTx },
        expectedBody: broadcastResponse,
        method: 'post',
        name: 'broadcasts an ETH transaction',
        path: '/api/v1/eth/transaction/broadcast',
      },
      {
        auth: 'wallet',
        body: ethSwapPrepareBody,
        expectedBody: ethSwapPrepare,
        method: 'post',
        name: 'prepares an ETH swap transaction',
        path: '/api/v1/eth/swap-transaction/prepare',
      },
      {
        auth: 'wallet',
        body: { broadcastChain: 'ETH', txs: [signedTx] },
        expectedBody: [{ txResponse: { hash: '0xmockhash' } }],
        method: 'post',
        name: 'executes ETH swap transactions',
        path: '/api/v1/eth/swap-transaction/execute',
      },
      {
        auth: 'wallet',
        body: { addresses: [tokenAddress], walletAddress },
        expectedBody: tokenInfoResponse,
        method: 'post',
        name: 'fetches ETH token info',
        path: '/api/v1/eth/token/info',
      },
      {
        auth: 'wallet',
        body: { unsignedTx, walletAddress },
        expectedBody: preparedTransactionResponse,
        method: 'post',
        name: 'prepares an ETH transaction',
        path: '/api/v1/eth/transaction/prepare',
      },
      {
        auth: 'wallet',
        expectedBody: '1000000000000000000',
        method: 'get',
        name: 'gets an ETH balance',
        path: `/api/v1/eth/${walletAddress}/balance`,
      },
      {
        auth: 'wallet',
        expectedBody: walletInfoResponse,
        method: 'get',
        name: 'gets ETH wallet info',
        path: `/api/v1/eth/wallet-address/${walletAddress}/info`,
      },
      {
        auth: 'wallet',
        body: { amount: '1' },
        expectedBody: usdtPrepare,
        method: 'post',
        name: 'prepares a USDT swap transaction',
        path: '/api/v1/usdt/swap-transaction/prepare',
      },
      {
        auth: 'wallet',
        body: bscQuoteBody,
        expectedBody: '2.0',
        method: 'post',
        name: 'gets a BSC swap quote',
        path: '/api/v1/bsc/swap-quote',
      },
      {
        auth: 'wallet',
        body: { signedTx },
        expectedBody: broadcastResponse,
        method: 'post',
        name: 'broadcasts a BSC transaction',
        path: '/api/v1/bsc/transaction/broadcast',
      },
      {
        auth: 'wallet',
        body: bscQuoteBody,
        expectedBody: bscSwapPrepare,
        method: 'post',
        name: 'prepares a BSC swap transaction',
        path: '/api/v1/bsc/swap-transaction/prepare',
      },
      {
        auth: 'wallet',
        body: { addresses: [tokenAddress], walletAddress },
        expectedBody: tokenInfoResponse,
        method: 'post',
        name: 'fetches BSC token info',
        path: '/api/v1/bsc/token/info',
      },
      {
        auth: 'wallet',
        expectedBody: '1000000000000000000',
        method: 'get',
        name: 'gets a BSC balance',
        path: `/api/v1/bsc/${walletAddress}/balance`,
      },
      {
        auth: 'wallet',
        expectedBody: walletInfoResponse,
        method: 'get',
        name: 'gets BSC wallet info',
        path: `/api/v1/bsc/wallet-address/${walletAddress}/info`,
      },
      {
        auth: 'wallet',
        expectedBody: tokenBalanceResponse,
        method: 'get',
        name: 'gets a BSC token balance',
        path: `/api/v1/bsc/${walletAddress}/token/${tokenAddress}/balance`,
      },
      {
        auth: 'wallet',
        body: { unsignedTx, walletAddress },
        expectedBody: bscPreparedTransactionResponse,
        method: 'post',
        name: 'prepares a BSC transaction',
        path: '/api/v1/bsc/transaction/prepare',
      },
    ];

    it.each(cases)('$name', expectRoute);
  });

  describe('generic EVM routes', () => {
    const cases: RouteCase[] = [
      {
        auth: 'wallet',
        body: quoteBody,
        expectedBody: quoterUniswapResponse,
        method: 'post',
        name: 'gets a generic EVM swap quote',
        path: '/api/v1/evm/swap-quote',
      },
      {
        auth: 'wallet',
        body: quoteBody,
        expectedBody: swapResponse,
        method: 'post',
        name: 'prepares a generic EVM swap transaction',
        path: '/api/v1/evm/swap-transaction/prepare',
      },
      {
        auth: 'wallet',
        body: { signedTx },
        expectedBody: {
          receipt: null,
          txHash: '0xmockhash',
        },
        method: 'post',
        name: 'broadcasts through the generic EVM route without real RPC',
        path: '/api/v1/evm/base/transaction/broadcast',
      },
      {
        auth: 'wallet',
        body: { addresses: [tokenAddress], walletAddress },
        expectedBody: [
          {
            address: tokenAddress,
            balance: '1.0',
            decimals: 18,
            imageUrl: '',
            name: 'Mock Token',
            symbol: 'MOCK',
          },
        ],
        method: 'post',
        name: 'fetches generic EVM token info',
        path: '/api/v1/evm/base/token/info',
      },
      {
        auth: 'wallet',
        expectedBody: '1000000000000000000',
        method: 'get',
        name: 'gets a generic EVM native balance',
        path: `/api/v1/evm/base/${walletAddress}/balance`,
      },
      {
        auth: 'wallet',
        expectedBody: {
          gasFeeData: {
            gasPrice: '1',
            maxFeePerGas: '2',
            maxPriorityFeePerGas: '1',
          },
          transactionCount: 7,
        },
        method: 'get',
        name: 'gets generic EVM wallet info',
        path: `/api/v1/evm/base/wallet-address/${walletAddress}/info`,
      },
      {
        auth: 'wallet',
        expectedBody: {
          tokenBalance: '1000000000000000000',
          walletBalance: '1000000000000000000',
        },
        method: 'get',
        name: 'gets a generic EVM token balance',
        path: `/api/v1/evm/base/${walletAddress}/token/${tokenAddress}/balance`,
      },
      {
        auth: 'wallet',
        body: { unsignedTx, walletAddress },
        expectedBody: {
          chainId: '1',
          gasLimit: '21000',
          gasPrice: '2',
          nonce: 7,
          unsignedTx,
        },
        method: 'post',
        name: 'prepares a generic EVM transaction',
        path: '/api/v1/evm/base/transaction/prepare',
      },
    ];

    it.each(cases)('$name', expectRoute);
  });

  describe('swap, quote, and order routes', () => {
    const cases: RouteCase[] = [
      {
        auth: 'wallet',
        body: quoteBody,
        expectedBody: quoterUniswapResponse,
        method: 'post',
        name: 'gets a quoter response',
        path: '/api/v1/quoter/quote',
      },
      {
        auth: 'wallet',
        body: gaslessQuoteBody,
        expectedBody: quoterFusionPlusResponse,
        method: 'post',
        name: 'gets a gasless 1inch Fusion+ quoter response',
        path: '/api/v1/quoter/quote',
      },
      {
        auth: 'wallet',
        body: quoteBody,
        expectedBody: swapResponse,
        method: 'post',
        name: 'builds a Uniswap swap response',
        path: '/api/v1/swap',
      },
      {
        auth: 'wallet',
        body: inchQuoteBody,
        expectedBody: inchQuote,
        expectedStatus: 201,
        method: 'post',
        name: 'gets a 1inch quote',
        path: '/api/v1/swap/1inch/getSwapQuote',
      },
      {
        auth: 'wallet',
        body: fusionPlusQuoteBody,
        expectedBody: inchFusionPlusQuote,
        expectedStatus: 201,
        method: 'post',
        name: 'gets a 1inch Fusion+ quote',
        path: '/api/v1/swap/1inch/fusion-plus/getSwapQuote',
      },
      {
        auth: 'wallet',
        body: fusionOrderBody,
        expectedBody: inchFusionOrder,
        expectedStatus: 201,
        method: 'post',
        name: 'builds a 1inch fusion order',
        path: '/api/v1/swap/1inch/buildFusionOrder',
      },
      {
        auth: 'wallet',
        body: fusionPlusOrderBody,
        expectedBody: inchFusionPlusOrder,
        expectedStatus: 201,
        method: 'post',
        name: 'builds a 1inch Fusion+ order',
        path: '/api/v1/swap/1inch/buildFusionPlusOrder',
      },
      {
        auth: 'wallet',
        body: submitOrderBody,
        expectedBody: inchSubmitOrder,
        expectedStatus: 201,
        method: 'post',
        name: 'submits a 1inch order',
        path: '/api/v1/swap/1inch/submitOrder',
      },
      {
        auth: 'wallet',
        body: submitOrderBody,
        expectedBody: inchSubmitFusionPlusOrder,
        expectedStatus: 201,
        method: 'post',
        name: 'submits a 1inch Fusion+ order',
        path: '/api/v1/swap/1inch/submitFusionPlusOrder',
      },
      {
        auth: 'wallet',
        expectedBody: inchOrderStatus,
        method: 'get',
        name: 'gets a 1inch order status',
        path: '/api/v1/swap/1inch/orderStatus',
        query: {
          chain: 'ETH',
          orderHash: '0xorderhash',
          swapProvider: 'ONEINCH_FUSION',
        },
      },
      {
        auth: 'wallet',
        body: fusionNativeOrderBody,
        expectedBody: inchNativeOrder,
        expectedStatus: 201,
        method: 'post',
        name: 'builds a 1inch native Fusion+ order',
        path: '/api/v1/swap/1inch/buildFusionPlusNativeOrder',
      },
      {
        auth: 'wallet',
        body: fusionNativeConfirmBody,
        expectedBody: inchNativeConfirm,
        expectedStatus: 201,
        method: 'post',
        name: 'submits a 1inch native Fusion+ order',
        path: '/api/v1/swap/1inch/submitFusionPlusNativeOrder',
      },
      {
        auth: 'wallet',
        body: {
          amountIn: '1',
          fromChain: 'eth',
          fromToken: 'ETH',
          provider: 'UNISWAP',
          toChain: 'eth',
          toToken: 'USDC',
          txHash: '0xorderhash',
          walletAddress,
        },
        expectedBody: storedSwapOrder,
        expectedStatus: 201,
        method: 'post',
        name: 'stores a swap order',
        path: '/api/v1/swapOrders/store',
      },
      {
        auth: 'wallet',
        expectedBody: {
          data: {
            data: swapOrders,
            hasNext: false,
            hasPrev: false,
            limit: 10,
            page: 1,
            total: 1,
            totalPages: 1,
          },
          ok: true,
        },
        method: 'get',
        name: 'lists swap orders for a wallet',
        path: '/api/v1/swapOrders/orderByWallet',
        query: { walletAddress },
      },
      {
        auth: 'wallet',
        expectedBody: { data: swapOrder, ok: true },
        method: 'get',
        name: 'gets a swap order by hash',
        path: '/api/v1/swapOrders/0xorderhash',
        query: { walletAddress },
      },
    ];

    it.each(cases)('$name', expectRoute);
  });

  describe('authentication and guard failures', () => {
    const cases: RouteCase[] = [
      {
        body: { amount: '1' },
        expectedStatus: 401,
        method: 'post',
        name: 'rejects wallet routes without a wallet token',
        path: '/api/v1/eth/swap-quote',
      },
      {
        body: { addresses: wallet.addresses },
        expectedStatus: 401,
        method: 'post',
        name: 'rejects device routes without a device token',
        path: '/api/v1/wallet',
      },
      {
        body: { title: 'Swap', message: 'Done' },
        expectedStatus: 403,
        method: 'post',
        name: 'rejects custom notifications without an allowed origin',
        path: '/api/v1/swap/1inch/customNotification',
      },
    ];

    it.each(cases)('$name', expectRoute);
  });
});
