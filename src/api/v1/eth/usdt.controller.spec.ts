import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UsdtController } from './usdt.controller';

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
      wallet: { address: '0x1234567890123456789012345678901234567890' },
    };
    const res = createResponse();
    const body = { amount: '100' } as any;
    const result = { tx: { to: '0xspender' } };
    ethService.prepareUsdtSwapTransaction.mockResolvedValue(result);

    await controller.swapPrepare(req, res, body);

    expect(ethService.prepareUsdtSwapTransaction).toHaveBeenCalledWith({
      ...body,
      fromAddress: req.wallet.address,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it('uses the verified wallet address when body does not include fromAddress', async () => {
    const req = {
      wallet: { address: '0x1234567890123456789012345678901234567890' },
    };
    const res = createResponse();
    const body = { amount: '100' } as any;
    ethService.prepareUsdtSwapTransaction.mockResolvedValue({ ok: true });

    await controller.swapPrepare(req, res, body);

    expect(ethService.prepareUsdtSwapTransaction).toHaveBeenCalledWith({
      amount: body.amount,
      fromAddress: req.wallet.address,
    });
  });

  it('allows a matching fromAddress from the request body', async () => {
    const req = {
      wallet: { address: '0x1234567890123456789012345678901234567890' },
    };
    const res = createResponse();
    const body = {
      amount: '100',
      fromAddress: '0x1234567890123456789012345678901234567890',
    };
    ethService.prepareUsdtSwapTransaction.mockResolvedValue({ ok: true });

    await controller.swapPrepare(req, res, body);

    expect(ethService.prepareUsdtSwapTransaction).toHaveBeenCalledWith(body);
  });

  it('rejects a body fromAddress that does not match the verified wallet', async () => {
    const req = {
      wallet: { address: '0x1234567890123456789012345678901234567890' },
    };
    const res = createResponse();
    const body = {
      amount: '100',
      fromAddress: '0x9999999999999999999999999999999999999999',
    };

    await expect(controller.swapPrepare(req, res, body)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(ethService.prepareUsdtSwapTransaction).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects requests without a verified wallet', async () => {
    const res = createResponse();

    await expect(
      controller.swapPrepare({}, res, { amount: '100' } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(ethService.prepareUsdtSwapTransaction).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
