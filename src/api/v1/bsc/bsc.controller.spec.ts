import { BscController } from './bsc.controller';
import { RATE_LIMIT_KEY } from '../common/decorators/rate-limit.decorator';
import {
  BODY_SIZE_LIMIT_KEY,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';

describe('BscController', () => {
  let controller: BscController;
  const bscService = {
    getSwapQuote: jest.fn(),
  };
  const tokenMetadataService = {
    normalizeSwapQuote: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BscController(
      bscService as any,
      tokenMetadataService as any,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('applies wallet-scoped rate limits to broadcast and prepare routes', () => {
    expect(
      Reflect.getMetadata(RATE_LIMIT_KEY, controller.broadcastTransaction),
    ).toEqual([
      {
        points: 20,
        duration: 60,
        key: 'bsc-transaction-broadcast-ip',
        keyBy: 'ip',
      },
      {
        points: 10,
        duration: 60,
        key: 'bsc-transaction-broadcast-device',
        keyBy: 'device',
      },
      {
        points: 10,
        duration: 60,
        key: 'bsc-transaction-broadcast-wallet',
        keyBy: 'wallet',
      },
    ]);
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, controller.swapPrepare)).toEqual(
      [
        {
          points: 30,
          duration: 60,
          key: 'bsc-swap-transaction-prepare-ip',
          keyBy: 'ip',
        },
        {
          points: 15,
          duration: 60,
          key: 'bsc-swap-transaction-prepare-device',
          keyBy: 'device',
        },
        {
          points: 15,
          duration: 60,
          key: 'bsc-swap-transaction-prepare-wallet',
          keyBy: 'wallet',
        },
      ],
    );
  });

  it('applies route-specific body size limits to expensive write routes', () => {
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.broadcastTransaction),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.signedTransactionBatch,
      key: 'bsc-transaction-broadcast',
    });
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.swapPrepare),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.standard,
      key: 'bsc-swap-transaction-prepare',
    });
  });
});
