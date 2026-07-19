import { EthController } from './eth.controller';
import { RATE_LIMIT_KEY } from '../common/decorators/rate-limit.decorator';
import {
  BODY_SIZE_LIMIT_KEY,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';

describe('EthController', () => {
  let controller: EthController;
  const ethService = {
    getSwapQuote: jest.fn(),
  };
  const tokenMetadataService = {
    normalizeSwapQuote: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new EthController(
      ethService as any,
      tokenMetadataService as any,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('applies wallet-scoped rate limits to broadcast and execute routes', () => {
    expect(
      Reflect.getMetadata(RATE_LIMIT_KEY, controller.broadcastTransaction),
    ).toEqual([
      {
        points: 20,
        duration: 60,
        key: 'eth-transaction-broadcast-ip',
        keyBy: 'ip',
      },
      {
        points: 10,
        duration: 60,
        key: 'eth-transaction-broadcast-device',
        keyBy: 'device',
      },
      {
        points: 10,
        duration: 60,
        key: 'eth-transaction-broadcast-wallet',
        keyBy: 'wallet',
      },
    ]);
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, controller.swapExecute)).toEqual(
      [
        {
          points: 20,
          duration: 60,
          key: 'eth-swap-transaction-execute-ip',
          keyBy: 'ip',
        },
        {
          points: 10,
          duration: 60,
          key: 'eth-swap-transaction-execute-device',
          keyBy: 'device',
        },
        {
          points: 10,
          duration: 60,
          key: 'eth-swap-transaction-execute-wallet',
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
      key: 'eth-transaction-broadcast',
    });
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.swapExecute),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.signedTransactionBatch,
      key: 'eth-swap-transaction-execute',
    });
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.swapPrepare),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.standard,
      key: 'eth-swap-transaction-prepare',
    });
  });
});
