import {
  BODY_SIZE_LIMIT_KEY,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';
import { RATE_LIMIT_KEY } from '../common/decorators/rate-limit.decorator';
import { EvmController } from './evm.controller';

describe('EvmController', () => {
  let controller: EvmController;
  const evmService = {
    getSwapQuote: jest.fn(),
    prepareSwapTransaction: jest.fn(),
    broadcastTransaction: jest.fn(),
    getTokenInfo: jest.fn(),
    getBalance: jest.fn(),
    getWalletAddressInfo: jest.fn(),
    getTokenBalance: jest.fn(),
    prepareTransaction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new EvmController(evmService as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates native balance requests with chain and verified wallet', async () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const req = { wallet: { addresses: new Map() } };
    evmService.getBalance.mockResolvedValue(123n);

    await controller.getBalance(req, res, 'base', {
      walletAddress: '0x1111111111111111111111111111111111111111',
    });

    expect(evmService.getBalance).toHaveBeenCalledWith(
      'base',
      { walletAddress: '0x1111111111111111111111111111111111111111' },
      req.wallet,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(123n);
  });

  it.each([
    [
      'wallet info',
      'getAddressInfo',
      'getWalletAddressInfo',
      'base',
      { walletAddress: '0x1111111111111111111111111111111111111111' },
    ],
    [
      'token balance',
      'getTokenBalance',
      'getTokenBalance',
      'arb',
      {
        walletAddress: '0x1111111111111111111111111111111111111111',
        tokenAddress: '0x2222222222222222222222222222222222222222',
      },
    ],
    [
      'token info',
      'fetchTokenInfo',
      'getTokenInfo',
      'pol',
      {
        addresses: ['0x2222222222222222222222222222222222222222'],
        walletAddress: '0x1111111111111111111111111111111111111111',
      },
    ],
    [
      'transaction prepare',
      'prepareTransaction',
      'prepareTransaction',
      'base',
      {
        unsignedTx: { to: '0x2222222222222222222222222222222222222222' },
        walletAddress: '0x1111111111111111111111111111111111111111',
      },
    ],
  ])(
    'delegates %s requests with chain and verified wallet',
    async (_name, controllerMethod, serviceMethod, chain, dto) => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const req = { wallet: { addresses: new Map() } };
      const result = { success: true };
      evmService[serviceMethod].mockResolvedValue(result);

      await controller[controllerMethod](req, res, chain, dto);

      expect(evmService[serviceMethod]).toHaveBeenCalledWith(
        chain,
        dto,
        req.wallet,
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
    },
  );

  it('delegates transaction broadcast with chain', async () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const body = { signedTx: '0xsigned' };
    const result = { txHash: '0xhash', receipt: null };
    evmService.broadcastTransaction.mockResolvedValue(result);

    await controller.broadcastTransaction(res, 'arb', body as any);

    expect(evmService.broadcastTransaction).toHaveBeenCalledWith('arb', body);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it('delegates swap quotes without a route chain', async () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const req = { wallet: { addresses: new Map() } };
    const dto = { amount: '1' };
    const result = { success: true };
    evmService.getSwapQuote.mockResolvedValue(result);

    await controller.getSwapQuote(req, res, dto as any);

    expect(evmService.getSwapQuote).toHaveBeenCalledWith(dto, req.wallet);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it('delegates swap preparation with the verified wallet', async () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const req = { wallet: { addresses: new Map() } };
    const dto = { amount: '1' };
    const result = { success: true };
    evmService.prepareSwapTransaction.mockResolvedValue(result);

    await controller.prepareSwap(req, res, dto as any);

    expect(evmService.prepareSwapTransaction).toHaveBeenCalledWith(
      dto,
      req.wallet,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it('applies route-specific body size limits to expensive write routes', () => {
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.broadcastTransaction),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.signedTransactionBatch,
      key: 'evm-transaction-broadcast',
    });
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.prepareTransaction),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.standard,
      key: 'evm-transaction-prepare',
    });
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.prepareSwap),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.standard,
      key: 'evm-swap-transaction-prepare',
    });
  });

  it('applies wallet-scoped rate limits to broadcast and swap prepare routes', () => {
    expect(
      Reflect.getMetadata(RATE_LIMIT_KEY, controller.broadcastTransaction),
    ).toEqual([
      {
        points: 20,
        duration: 60,
        key: 'evm-transaction-broadcast-ip',
        keyBy: 'ip',
      },
      {
        points: 10,
        duration: 60,
        key: 'evm-transaction-broadcast-device',
        keyBy: 'device',
      },
      {
        points: 10,
        duration: 60,
        key: 'evm-transaction-broadcast-wallet',
        keyBy: 'wallet',
      },
    ]);
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, controller.prepareSwap)).toEqual(
      [
        {
          points: 30,
          duration: 60,
          key: 'evm-swap-transaction-prepare-ip',
          keyBy: 'ip',
        },
        {
          points: 15,
          duration: 60,
          key: 'evm-swap-transaction-prepare-device',
          keyBy: 'device',
        },
        {
          points: 15,
          duration: 60,
          key: 'evm-swap-transaction-prepare-wallet',
          keyBy: 'wallet',
        },
      ],
    );
  });
});
