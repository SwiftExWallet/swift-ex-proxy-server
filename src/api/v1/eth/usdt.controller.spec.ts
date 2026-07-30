import { UsdtController } from './usdt.controller';
import {
  BODY_SIZE_LIMIT_KEY,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';

describe('UsdtController', () => {
  const ethService = {
    prepareUsdtSwapTransaction: jest.fn(),
  };

  let controller: UsdtController;

  const createResponse = () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new UsdtController(ethService as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns prepared USDT swap transaction data with status 200', async () => {
    const req = {
      wallet: {
        addresses: {
          eth: '0x1234567890123456789012345678901234567890',
          multi: '0x1234567890123456789012345678901234567890',
        },
      },
    };
    const res = createResponse();
    const body = { amount: '100' } as any;
    const result = { tx: { to: '0xspender' } };
    ethService.prepareUsdtSwapTransaction.mockResolvedValue(result);

    await controller.swapPrepare(req, res, body);

    expect(ethService.prepareUsdtSwapTransaction).toHaveBeenCalledWith(
      body,
      req.wallet,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it('passes the verified wallet address when body does not include fromAddress', async () => {
    const req = {
      wallet: {
        addresses: {
          eth: '0x1234567890123456789012345678901234567890',
          multi: '0x1234567890123456789012345678901234567890',
        },
      },
    };
    const res = createResponse();
    const body = { amount: '100' } as any;
    ethService.prepareUsdtSwapTransaction.mockResolvedValue({ ok: true });

    await controller.swapPrepare(req, res, body);

    expect(ethService.prepareUsdtSwapTransaction).toHaveBeenCalledWith(
      body,
      req.wallet,
    );
  });

  it('allows a matching fromAddress from the request body', async () => {
    const req = {
      wallet: {
        addresses: {
          eth: '0x1234567890123456789012345678901234567890',
          multi: '0x1234567890123456789012345678901234567890',
        },
      },
    };
    const res = createResponse();
    const body = {
      amount: '100',
      fromAddress: '0x1234567890123456789012345678901234567890',
    };
    ethService.prepareUsdtSwapTransaction.mockResolvedValue({ ok: true });

    await controller.swapPrepare(req, res, body);

    expect(ethService.prepareUsdtSwapTransaction).toHaveBeenCalledWith(
      body,
      req.wallet,
    );
  });

  it('applies a route-specific body size limit to prepare', () => {
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.swapPrepare),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.standard,
      key: 'usdt-swap-transaction-prepare',
    });
  });
});
