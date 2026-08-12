import { Logger } from '@nestjs/common';
import { OpenAPI } from '@defuse-protocol/one-click-sdk-typescript';
import { NearIntentPollerService } from './nearIntentPoller.service';

jest.mock('@defuse-protocol/one-click-sdk-typescript', () => ({
  OpenAPI: {},
  OneClickService: {
    getExecutionStatus: jest.fn(),
  },
}));

describe('NearIntentPollerService', () => {
  let swapOrderService: {
    findById: jest.Mock;
    findByProviderAndStatusesSince: jest.Mock;
    updateOrderById: jest.Mock;
  };
  let redisService: {
    getKey: jest.Mock;
    setKey: jest.Mock;
    delKey: jest.Mock;
  };
  let firebaseNotificationService: {
    sendNotification: jest.Mock;
  };
  let exhaustedOrderRepository: {
    upsertBySwapOrderId: jest.Mock;
  };
  let portfolioService: {
    refreshPortfolio: jest.Mock;
  };

  const createService = () =>
    new NearIntentPollerService(
      swapOrderService as any,
      redisService as any,
      firebaseNotificationService as any,
      exhaustedOrderRepository as any,
      portfolioService as any,
    );

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    swapOrderService = {
      findById: jest.fn(),
      findByProviderAndStatusesSince: jest.fn(),
      updateOrderById: jest.fn(),
    };
    redisService = {
      getKey: jest.fn(),
      setKey: jest.fn(),
      delKey: jest.fn(),
    };
    firebaseNotificationService = {
      sendNotification: jest.fn(),
    };
    exhaustedOrderRepository = {
      upsertBySwapOrderId: jest.fn(),
    };
    portfolioService = {
      refreshPortfolio: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('configures the OneClick SDK from environment variables', () => {
    const previousBase = OpenAPI.BASE;
    const previousToken = OpenAPI.TOKEN;
    const previousBaseEnv = process.env.ONECLICK_BASE_URL;
    const previousTokenEnv = process.env.ONECLICK_JWT_TOKEN;

    process.env.ONECLICK_BASE_URL = 'https://one-click.example';
    process.env.ONECLICK_JWT_TOKEN = 'jwt-token';

    try {
      createService();

      expect(OpenAPI.BASE).toBe('https://one-click.example');
      expect(OpenAPI.TOKEN).toBe('jwt-token');
    } finally {
      OpenAPI.BASE = previousBase;
      OpenAPI.TOKEN = previousToken;
      if (previousBaseEnv === undefined) delete process.env.ONECLICK_BASE_URL;
      else process.env.ONECLICK_BASE_URL = previousBaseEnv;
      if (previousTokenEnv === undefined) delete process.env.ONECLICK_JWT_TOKEN;
      else process.env.ONECLICK_JWT_TOKEN = previousTokenEnv;
    }
  });

  it('refreshes the source portfolio from the stored order id', async () => {
    swapOrderService.findById.mockResolvedValue({
      ok: true,
      data: {
        deviceId: { toString: () => 'device-id' },
        walletAddress: '0xwallet',
        fromChain: 'ETH',
      },
    });

    const service = createService();

    await (service as any).refreshSourcePortfolio('order-id');

    expect(swapOrderService.findById).toHaveBeenCalledWith('order-id');
    expect(portfolioService.refreshPortfolio).toHaveBeenCalledWith(
      'device-id',
      '0xwallet',
      ['ETH'],
    );
  });
});
