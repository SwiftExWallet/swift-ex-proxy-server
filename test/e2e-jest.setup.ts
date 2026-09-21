process.env.NODE_ENV = 'test';
process.env.ENVIRONMENT = 'dev';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_ISSUER = process.env.JWT_ISSUER || 'swift-ex-proxy-server';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'swift-ex-mobile-app';
process.env.DEVICE_ATTESTATION_MODE =
  process.env.DEVICE_ATTESTATION_MODE || 'off';
process.env.CUSTOM_NOTIFICATION_ALLOWED_ORIGINS =
  process.env.CUSTOM_NOTIFICATION_ALLOWED_ORIGINS || 'http://localhost';
process.env.BANXA_API_KEY = process.env.BANXA_API_KEY || 'test-banxa-key';
process.env.BANXA_QUOTE_REQUEST_URL =
  process.env.BANXA_QUOTE_REQUEST_URL || 'https://banxa.example/quote/';
process.env.BANXA_BASE_URL =
  process.env.BANXA_BASE_URL || 'https://banxa.example/';
process.env.BANXA_REDIRECT_URL =
  process.env.BANXA_REDIRECT_URL || 'https://app.example/banxa/redirect';
process.env.ALCHEMY_PAY_APPID =
  process.env.ALCHEMY_PAY_APPID || 'test-alchemy-app';
process.env.ALCHEMY_PAY_SECRET =
  process.env.ALCHEMY_PAY_SECRET || 'test-alchemy-secret';
process.env.ALCHEMY_PAY_QUOTE_REQUEST_URL =
  process.env.ALCHEMY_PAY_QUOTE_REQUEST_URL || 'https://alchemy.example/quote';
process.env.ALCHEMY_PAY_USER_SELL_ORDER_URL =
  process.env.ALCHEMY_PAY_USER_SELL_ORDER_URL ||
  'https://alchemy.example/order?';
process.env.ALCHEMY_PAY_USER_SELL_ORDER_REQUEST_URL =
  process.env.ALCHEMY_PAY_USER_SELL_ORDER_REQUEST_URL || '/order';
process.env.ALCHEMY_PAY_REDIRECT_URL =
  process.env.ALCHEMY_PAY_REDIRECT_URL || 'https://app.example/alchemy';
process.env.ALCHEMY_PAY_WEBHOOK_URL =
  process.env.ALCHEMY_PAY_WEBHOOK_URL || 'https://app.example/webhook';
process.env.MOON_PAY_BASE =
  process.env.MOON_PAY_BASE || 'https://moonpay.example';
process.env.MOON_PAY_BUY_WIDGET =
  process.env.MOON_PAY_BUY_WIDGET || 'https://moonpay.example/buy';
process.env.MOON_PAY_SELL_WIDGET =
  process.env.MOON_PAY_SELL_WIDGET || 'https://moonpay.example/sell';
process.env.MOON_PAY_PUBLISHABLE_KEY =
  process.env.MOON_PAY_PUBLISHABLE_KEY || 'test-moonpay-pub';
process.env.MOON_PAY_SECRET_KEY =
  process.env.MOON_PAY_SECRET_KEY || 'test-moonpay-secret';
process.env.INCH_API_KEY = process.env.INCH_API_KEY || 'test-inch-key';
process.env.QUOTER_BASE =
  process.env.QUOTER_BASE || 'https://api.1inch.dev/quoter';
process.env.FUSION_PLUS_QUOTER_BASE =
  process.env.FUSION_PLUS_QUOTER_BASE ||
  'https://api.1inch.dev/fusion-plus/quoter';
process.env.INCH_RELAYER_BASE =
  process.env.INCH_RELAYER_BASE || 'https://api.1inch.dev/relayer';
process.env.FUSION_PLUS_RELAYER_BASE =
  process.env.FUSION_PLUS_RELAYER_BASE ||
  'https://api.1inch.dev/fusion-plus/relayer';
process.env.INCH_ORDER_BASE =
  process.env.INCH_ORDER_BASE || 'https://api.1inch.dev/order';
process.env.FUSION_PLUS_ORDER_BASE =
  process.env.FUSION_PLUS_ORDER_BASE ||
  'https://api.1inch.dev/fusion-plus/order';
process.env.FUSION_SECRETS_ENCRYPTION_KEY =
  process.env.FUSION_SECRETS_ENCRYPTION_KEY ||
  '12345678901234567890123456789012';
process.env.MASTER_HASH_KEY =
  process.env.MASTER_HASH_KEY || 'test-master-hash-key';
process.env.POOL_FACTORY_CONTRACT_ADDRESS =
  process.env.POOL_FACTORY_CONTRACT_ADDRESS ||
  '0x3333333333333333333333333333333333333333';
process.env.QUOTER_CONTRACT_ADDRESS =
  process.env.QUOTER_CONTRACT_ADDRESS ||
  '0x4444444444444444444444444444444444444444';
process.env.SWAP_ROUTER_ADDRESS =
  process.env.SWAP_ROUTER_ADDRESS ||
  '0x5555555555555555555555555555555555555555';
process.env.BSC_ROUTER_ADDRESS =
  process.env.BSC_ROUTER_ADDRESS ||
  '0x6666666666666666666666666666666666666666';
process.env.BSC_TRANSACTION_WAIT_TIME_IN_SECONDS =
  process.env.BSC_TRANSACTION_WAIT_TIME_IN_SECONDS || '600';
process.env.BSC_TRANSACTION_GAS_LIMIT =
  process.env.BSC_TRANSACTION_GAS_LIMIT || '300000';
process.env.PROVIDER_RPC_BSC =
  process.env.PROVIDER_RPC_BSC || 'http://127.0.0.1:8545';
process.env.PROVIDER_RPC_ETH_1 =
  process.env.PROVIDER_RPC_ETH_1 || 'http://127.0.0.1:8545';
process.env.WETH_ADDRESS =
  process.env.WETH_ADDRESS || '0x7777777777777777777777777777777777777777';
process.env.USDT_ADDRESS =
  process.env.USDT_ADDRESS || '0x8888888888888888888888888888888888888888';
process.env.USDC_ADDRESS =
  process.env.USDC_ADDRESS || '0x9999999999999999999999999999999999999999';
process.env.ETH_SWAP_GAS_FEE_LIMIT =
  process.env.ETH_SWAP_GAS_FEE_LIMIT || '300000';
process.env.ETH_SWAP_TYPE = process.env.ETH_SWAP_TYPE || '2';
process.env.SIGNING_DEVICE_UNIQUE_ID =
  process.env.SIGNING_DEVICE_UNIQUE_ID || 'web-device';

jest.mock('@nestjs/mongoose', () => {
  const actual = jest.requireActual('@nestjs/mongoose');

  class MockQuery<T> {
    constructor(private readonly value: T) {}

    exec(): Promise<T> {
      return Promise.resolve(this.value);
    }

    then<TResult1 = T, TResult2 = never>(
      onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return this.exec().then(onfulfilled, onrejected);
    }

    catch<TResult = never>(
      onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
    ): Promise<T | TResult> {
      return this.exec().catch(onrejected);
    }

    sort(): MockQuery<T> {
      return this;
    }

    skip(): MockQuery<T> {
      return this;
    }

    limit(): MockQuery<T> {
      return this;
    }

    lean(): MockQuery<T> {
      return this;
    }
  }

  function query<T>(value: T): MockQuery<T> {
    return new MockQuery(value);
  }

  function createMockModel() {
    function MockModel(this: Record<string, any>, doc: Record<string, any>) {
      Object.assign(this, doc);
      this._id = this._id || 'mock-id';
      this.save = jest.fn().mockResolvedValue(this);
    }

    MockModel.findOne = jest.fn(() => query(null));
    MockModel.find = jest.fn(() => query([]));
    MockModel.findById = jest.fn(() => query(null));
    MockModel.findByIdAndUpdate = jest.fn(() => query(null));
    MockModel.findOneAndUpdate = jest.fn(() => query(null));
    MockModel.updateOne = jest.fn(() => query({ modifiedCount: 1 }));
    MockModel.countDocuments = jest.fn(() => query(0));
    MockModel.aggregate = jest.fn(() => query([]));
    MockModel.create = jest.fn((doc: Record<string, any>) =>
      Promise.resolve({ _id: 'mock-id', ...doc }),
    );

    return MockModel;
  }

  const MongooseModule = {
    forRoot: jest.fn(() => ({
      module: class MockMongooseRootModule {},
    })),
    forRootAsync: jest.fn(() => ({
      module: class MockMongooseRootAsyncModule {},
    })),
    forFeature: jest.fn((models: Array<{ name: string }> = []) => {
      const providers = models.map((model) => ({
        provide: actual.getModelToken(model.name),
        useValue: createMockModel(),
      }));

      return {
        module: class MockMongooseFeatureModule {},
        providers,
        exports: providers,
      };
    }),
  };

  return {
    ...actual,
    MongooseModule,
  };
});
