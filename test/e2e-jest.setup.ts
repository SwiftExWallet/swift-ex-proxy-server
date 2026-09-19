process.env.NODE_ENV = 'test';
process.env.ENVIRONMENT = 'dev';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_ISSUER = process.env.JWT_ISSUER || 'swift-ex-proxy-server';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'swift-ex-mobile-app';
process.env.DEVICE_ATTESTATION_MODE =
  process.env.DEVICE_ATTESTATION_MODE || 'off';
process.env.CUSTOM_NOTIFICATION_ALLOWED_ORIGINS =
  process.env.CUSTOM_NOTIFICATION_ALLOWED_ORIGINS || 'http://localhost';
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
process.env.WETH_ADDRESS =
  process.env.WETH_ADDRESS || '0x7777777777777777777777777777777777777777';
process.env.USDT_ADDRESS =
  process.env.USDT_ADDRESS || '0x8888888888888888888888888888888888888888';
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
