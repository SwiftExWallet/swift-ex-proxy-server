jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');

  return {
    ...actual,
    Contract: jest.fn().mockImplementation(() => ({
      name: jest.fn().mockResolvedValue('Mock Token'),
      symbol: jest.fn().mockResolvedValue('MOCK'),
      decimals: jest.fn().mockResolvedValue(18),
      balanceOf: jest.fn().mockResolvedValue(1000000000000000000n),
    })),
  };
});

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Wallet as EthersWallet } from 'ethers';
import { json, urlencoded } from 'express';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PancakeSwapService } from '../src/api/v1/bsc/pancake/bsc.pancake.service';
import {
  DEVICE_AUTH_TOKEN_HEADER,
  WALLET_AUTH_TOKEN_HEADER,
} from '../src/api/v1/common/middleware/device-auth-token.middleware';
import { bigintJsonSerializerMiddleware } from '../src/api/v1/common/middleware/bigintJsonSerializer.middleware';
import { UserQueueService } from '../src/api/v1/common/user-queue/user-queue.service';
import { DeviceRepository } from '../src/api/v1/device/device.repository';
import { EthTestnetSwapService } from '../src/api/v1/eth/eth.testnet.service';
import { UniSwapService } from '../src/api/v1/eth/uniSwap/eth.uniswap.service';
import { FirebaseNotificationService } from '../src/api/v1/notification/firebase/notification.service';
import { MarketDataRepository } from '../src/api/v1/market-data/market-data.repository';
import { AlchemyService } from '../src/api/v1/on-off-ramp/alchemy/alchemy.service';
import { BanxaService } from '../src/api/v1/on-off-ramp/banxa/banxa.service';
import { MoonPayService } from '../src/api/v1/on-off-ramp/moonpay/moonpay.service';
import { ProviderService } from '../src/api/v1/provider/provider.service';
import { RedisService } from '../src/api/v1/redis/redis.service';
import { FusionNativeService } from '../src/api/v1/swap/1inch/1inch.fusion.native.swap.service';
import { InchService } from '../src/api/v1/swap/1inch/1inch.service';
import { UniswapService } from '../src/api/v1/swap/uniswap/uniswap.service';
import { SwapOrderRepository } from '../src/api/v1/swapOrders/swapOrder.repository';
import { WalletRepository } from '../src/api/v1/wallet/wallet.repository';

type HttpMethod = 'get' | 'patch' | 'post';
type AuthMode = 'device' | 'wallet';

type RouteCase = {
  auth?: AuthMode;
  body?: any;
  expectedBody?: any;
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
      amountOut: 1000000000000000000n,
    }),
    symbol: jest.fn().mockResolvedValue('MOCK'),
  };

  const marketData = [{ symbol: 'ETH', price: 1000 }];
  const onOffRampQuote = {
    data: { quoteId: 'quote-id' },
    success: true,
  };
  const onOffRampOrder = { success: { orderId: 'order-id' } };
  const onOffRampAssets = [{ code: 'ETH' }];
  const onOffRampLink = { url: 'https://pay.example/link' };
  const updatedDevice = { ...device, fcmToken: 'new-fcm-token' };
  const userDevice = { ...device, userId: 'user-id' };
  const createdWallet = { ...wallet, label: 'Primary' };
  const ethQuote = { provider: 'eth', route: 'quote' };
  const ethSwapPrepare = { provider: 'eth', route: 'swap-prepare' };
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
  const externalUniswapQuote = { quoteId: 'uniswap-quote' };
  const quoterUniswapResponse = {
    data: externalUniswapQuote,
    provider: 'UNISWAP',
    success: true,
  };
  const quoterFusionPlusResponse = {
    data: { provider: '1inch', route: 'fusion-plus-quote' },
    provider: 'ONEINCH_FUSION_PLUS',
    success: true,
  };
  const swapResponse = { provider: 'uniswap', route: 'swap' };
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
  const inchNativeOrder = { provider: '1inch', route: 'native-order' };
  const inchNativeConfirm = { provider: '1inch', route: 'native-confirm' };
  const customNotification = { delivered: true };
  const storedSwapOrder = { orderHash: '0xorderhash' };
  const swapOrders = [{ orderHash: '0xorderhash' }];
  const swapOrder = { orderHash: '0xorderhash' };

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
  const ethTestnetSwapService = {
    getQuote: jest.fn().mockResolvedValue(ethQuote),
    prepareSwapTransaction: jest.fn().mockResolvedValue(ethSwapPrepare),
  };
  const uniSwapService = {
    buildSwapTx: jest.fn().mockResolvedValue(ethSwapPrepare),
    getQuote: jest.fn().mockResolvedValue(ethQuote),
  };
  const pancakeSwapService = {
    createUnsignedSwapTransaction: jest.fn().mockResolvedValue(bscSwapPrepare),
    getSwapQuote: jest.fn().mockResolvedValue('2.0'),
  };
  const uniswapService = {
    buildSwapResponse: jest.fn().mockResolvedValue(swapResponse),
    getSwapQuote: jest.fn().mockResolvedValue(externalUniswapQuote),
  };
  const inchService = {
    buildFusionOrder: jest.fn().mockResolvedValue(inchFusionOrder),
    buildFusionPlusOrder: jest.fn().mockResolvedValue(inchFusionPlusOrder),
    fireCustomNotification: jest.fn().mockResolvedValue(customNotification),
    getFusionPlusSwapQuote: jest.fn().mockResolvedValue(inchFusionPlusQuote),
    getSwapQuote: jest.fn().mockResolvedValue(inchQuote),
    orderStatus: jest.fn().mockResolvedValue(inchOrderStatus),
    submitFusionOrder: jest.fn().mockResolvedValue(inchSubmitOrder),
    submitFusionPlusOrder: jest
      .fn()
      .mockResolvedValue(inchSubmitFusionPlusOrder),
  };
  const fusionNativeService = {
    confirmSwapOrder: jest.fn().mockResolvedValue(inchNativeConfirm),
    createSwapOrder: jest.fn().mockResolvedValue(inchNativeOrder),
  };
  const banxaService = {
    buyOrderCreate: jest.fn().mockResolvedValue({ orderId: 'order-id' }),
    fetchAssets: jest.fn().mockResolvedValue(onOffRampAssets),
    fetchQuotes: jest.fn().mockResolvedValue({
      data: { quoteId: 'quote-id' },
      status: true,
    }),
    sellOrderCreate: jest.fn().mockResolvedValue({ orderId: 'order-id' }),
  };
  const moonPayService = {
    buildLink: jest.fn().mockResolvedValue(onOffRampLink),
    getCurrencies: jest.fn().mockResolvedValue(onOffRampAssets),
    getQuote: jest.fn().mockResolvedValue(onOffRampQuote),
  };
  const alchemyService = {
    fetchQuotes: jest.fn().mockResolvedValue({
      data: { quoteId: 'alchemy-quote-id' },
      status: true,
    }),
    orderCreate: jest.fn().mockResolvedValue({ orderId: 'alchemy-order-id' }),
    sellOrderCreate: jest
      .fn()
      .mockResolvedValue({ orderId: 'alchemy-sell-order-id' }),
  };
  const userQueueService = {
    processUserRequest: jest.fn((handler: () => Promise<any>) => handler()),
  };

  beforeAll(async () => {
    broadcastTransaction.mockResolvedValue({ hash: '0xmockhash' });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useValue({
        delKey: jest.fn().mockResolvedValue(undefined),
        getHealthSnapshot: jest.fn().mockReturnValue({
          healthy: true,
          state: 'ready',
        }),
        getKey: jest.fn().mockResolvedValue(null),
        isHealthy: jest.fn().mockReturnValue(true),
        onModuleDestroy: jest.fn(),
        onModuleInit: jest.fn(),
        pingHealth: jest.fn().mockResolvedValue(true),
        setKey: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(ProviderService)
      .useValue({
        getContract: jest.fn().mockReturnValue(tokenContract),
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
      .overrideProvider(EthTestnetSwapService)
      .useValue(ethTestnetSwapService)
      .overrideProvider(UniSwapService)
      .useValue(uniSwapService)
      .overrideProvider(PancakeSwapService)
      .useValue(pancakeSwapService)
      .overrideProvider(UniswapService)
      .useValue(uniswapService)
      .overrideProvider(InchService)
      .useValue(inchService)
      .overrideProvider(FusionNativeService)
      .useValue(fusionNativeService)
      .overrideProvider(BanxaService)
      .useValue(banxaService)
      .overrideProvider(MoonPayService)
      .useValue(moonPayService)
      .overrideProvider(AlchemyService)
      .useValue(alchemyService)
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
        body: { title: 'Swap', message: 'Done' },
        expectedBody: customNotification,
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
        body: quoteBody,
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
        body: { amount: '1' },
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
        body: { amount: '1' },
        expectedBody: swapResponse,
        method: 'post',
        name: 'builds a Uniswap swap response',
        path: '/api/v1/swap',
      },
      {
        auth: 'wallet',
        body: { amount: '1' },
        expectedBody: inchQuote,
        expectedStatus: 201,
        method: 'post',
        name: 'gets a 1inch quote',
        path: '/api/v1/swap/1inch/getSwapQuote',
      },
      {
        auth: 'wallet',
        body: { amount: '1' },
        expectedBody: inchFusionPlusQuote,
        expectedStatus: 201,
        method: 'post',
        name: 'gets a 1inch Fusion+ quote',
        path: '/api/v1/swap/1inch/fusion-plus/getSwapQuote',
      },
      {
        auth: 'wallet',
        body: { order: 'order' },
        expectedBody: inchFusionOrder,
        expectedStatus: 201,
        method: 'post',
        name: 'builds a 1inch fusion order',
        path: '/api/v1/swap/1inch/buildFusionOrder',
      },
      {
        auth: 'wallet',
        body: { order: 'order' },
        expectedBody: inchFusionPlusOrder,
        expectedStatus: 201,
        method: 'post',
        name: 'builds a 1inch Fusion+ order',
        path: '/api/v1/swap/1inch/buildFusionPlusOrder',
      },
      {
        auth: 'wallet',
        body: { order: 'order' },
        expectedBody: inchSubmitOrder,
        expectedStatus: 201,
        method: 'post',
        name: 'submits a 1inch order',
        path: '/api/v1/swap/1inch/submitOrder',
      },
      {
        auth: 'wallet',
        body: { order: 'order' },
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
        query: { orderHash: '0xorderhash' },
      },
      {
        auth: 'wallet',
        body: { amount: '1' },
        expectedBody: inchNativeOrder,
        expectedStatus: 201,
        method: 'post',
        name: 'builds a 1inch native Fusion+ order',
        path: '/api/v1/swap/1inch/buildFusionPlusNativeOrder',
      },
      {
        auth: 'wallet',
        body: { orderHash: '0xorderhash' },
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
