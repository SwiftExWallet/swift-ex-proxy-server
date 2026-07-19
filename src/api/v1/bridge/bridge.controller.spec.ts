import { BridgeController } from './bridge.controller';
import { RATE_LIMIT_KEY } from '../common/decorators/rate-limit.decorator';
import {
  BODY_SIZE_LIMIT_KEY,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';

describe('BridgeController', () => {
  let controller: BridgeController;
  const allBridgeService = {
    prepareTransaction: jest.fn(),
    getSwapDetails: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BridgeController(allBridgeService as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('applies wallet limits to prepare and device limits to quotes', () => {
    expect(
      Reflect.getMetadata(RATE_LIMIT_KEY, controller.getSwapQuote),
    ).toEqual([
      {
        points: 30,
        duration: 60,
        key: 'bridge-swap-transaction-prepare-ip',
        keyBy: 'ip',
      },
      {
        points: 15,
        duration: 60,
        key: 'bridge-swap-transaction-prepare-device',
        keyBy: 'device',
      },
      {
        points: 15,
        duration: 60,
        key: 'bridge-swap-transaction-prepare-wallet',
        keyBy: 'wallet',
      },
    ]);
    expect(
      Reflect.getMetadata(RATE_LIMIT_KEY, controller.getSwapDetails),
    ).toEqual([
      { points: 60, duration: 60, key: 'bridge-swap-quotes-ip', keyBy: 'ip' },
      {
        points: 30,
        duration: 60,
        key: 'bridge-swap-quotes-device',
        keyBy: 'device',
      },
    ]);
  });

  it('applies route-specific body size limits', () => {
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.getSwapQuote),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.standard,
      key: 'bridge-swap-transaction-prepare',
    });
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.getSwapDetails),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.simple,
      key: 'bridge-swap-quotes',
    });
  });
});
