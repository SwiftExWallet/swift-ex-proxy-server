import { inchController } from './1inch.controller';
import { SwapNetwork } from '../../common/enums/chain.enum';
import { RATE_LIMIT_KEY } from '../../common/decorators/rate-limit.decorator';
import {
  BODY_SIZE_LIMIT_KEY,
  BODY_SIZE_LIMITS,
} from '../../common/decorators/body-size-limit.decorator';

describe('inchController', () => {
  const inchService = {
    getSwapQuote: jest.fn(),
    getFusionPlusSwapQuote: jest.fn(),
    buildFusionOrder: jest.fn(),
    buildFusionPlusOrder: jest.fn(),
    submitFusionOrder: jest.fn(),
    submitFusionPlusOrder: jest.fn(),
    orderStatus: jest.fn(),
    fireCustomNotification: jest.fn(),
  };
  const fustionNativeService = {
    createSwapOrder: jest.fn(),
    confirmSwapOrder: jest.fn(),
  };

  let controller: inchController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new inchController(
      inchService as any,
      fustionNativeService as any,
    );
  });

  const reqWithWallet = {
    device: { _id: 'device-id' },
    wallet: { address: '0x3333333333333333333333333333333333333333' },
  };

  it('passes the authenticated device when submitting a Fusion order', async () => {
    const req = {
      device: { _id: 'device-id' },
      wallet: { address: '0x3333333333333333333333333333333333333333' },
    };
    const dto = {
      order: { salt: '1' },
      signature: '0xsignature',
      extension: '0xextension',
      quoteId: 'quote-id',
      chain: SwapNetwork.ETH,
    };
    const result = { orderHash: '0xorderhash' };
    inchService.submitFusionOrder.mockResolvedValue(result);

    await expect(controller.submitOrder(req, dto as any)).resolves.toBe(result);

    expect(inchService.submitFusionOrder).toHaveBeenCalledWith(
      req.device,
      dto,
      req.wallet.address,
    );
  });

  it('passes the authenticated device when submitting a Fusion+ order', async () => {
    const req = {
      device: { _id: 'device-id' },
      wallet: { address: '0x3333333333333333333333333333333333333333' },
    };
    const dto = {
      order: { salt: '1' },
      signature: '0xsignature',
      extension: '0xextension',
      quoteId: 'quote-id',
      chain: SwapNetwork.ETH,
      orderHash: '0xorderhash',
    };
    const result = { accepted: true };
    inchService.submitFusionPlusOrder.mockResolvedValue(result);

    await expect(
      controller.submitFusionPlusOrder(req, dto as any),
    ).resolves.toBe(result);

    expect(inchService.submitFusionPlusOrder).toHaveBeenCalledWith(
      req.device,
      dto,
      req.wallet.address,
    );
  });

  it('delegates Fusion+ quote requests to the Inch service', async () => {
    const dto = {
      srcChain: SwapNetwork.ETH,
      dstChain: SwapNetwork.BSC,
      srcTokenAddress: '0x1111111111111111111111111111111111111111',
      dstTokenAddress: '0x2222222222222222222222222222222222222222',
      walletAddress: '0x3333333333333333333333333333333333333333',
      amount: '100',
    };
    const result = { quoteId: 'quote-id' };
    inchService.getFusionPlusSwapQuote.mockResolvedValue(result);

    await expect(
      controller.getFusionPlusQuote(reqWithWallet, dto),
    ).resolves.toBe(result);

    expect(inchService.getFusionPlusSwapQuote).toHaveBeenCalledWith(
      dto,
      reqWithWallet.wallet.address,
    );
  });

  it('passes device and wallet context when refreshing order status', async () => {
    const dto = {
      orderHash: '0xorderhash',
      chain: SwapNetwork.ETH,
      swapProvider: 'ONEINCH_FUSION',
    };
    const result = { status: 'pending' };
    inchService.orderStatus.mockResolvedValue(result);

    await expect(
      controller.orderStatus(reqWithWallet, dto as any),
    ).resolves.toBe(result);

    expect(inchService.orderStatus).toHaveBeenCalledWith(
      dto,
      reqWithWallet.device._id,
      reqWithWallet.wallet.address,
    );
  });

  it('delegates native Fusion+ order creation and confirmation', async () => {
    const createDto = {
      srcChain: SwapNetwork.ETH,
      dstChain: SwapNetwork.BSC,
      srcTokenAddress: '0x1111111111111111111111111111111111111111',
      dstTokenAddress: '0x2222222222222222222222222222222222222222',
      walletAddress: '0x3333333333333333333333333333333333333333',
      amount: '100',
    };
    const confirmDto = {
      orderHash: '0xorderhash',
      txHash: '0xtxhash',
      srcChain: SwapNetwork.ETH,
    };
    fustionNativeService.createSwapOrder.mockResolvedValue({
      order: 'native-order',
    });
    fustionNativeService.confirmSwapOrder.mockResolvedValue({
      confirmed: true,
    });

    await expect(
      controller.buildFusionPlusNativeOrder(reqWithWallet, createDto),
    ).resolves.toEqual({
      order: 'native-order',
    });
    await expect(
      controller.confirmOrder(reqWithWallet, confirmDto),
    ).resolves.toEqual({
      confirmed: true,
    });

    expect(fustionNativeService.createSwapOrder).toHaveBeenCalledWith(
      createDto,
      reqWithWallet.wallet.address,
    );
    expect(fustionNativeService.confirmSwapOrder).toHaveBeenCalledWith(
      confirmDto,
      reqWithWallet.device._id,
      reqWithWallet.wallet.address,
    );
  });

  it('passes the authenticated device when firing a custom notification', async () => {
    const req = { device: { _id: 'device-id' } };
    const notification = { title: 'Swap', body: 'Updated' };
    inchService.fireCustomNotification.mockResolvedValue({ sent: true });

    await expect(
      controller.customNotification(req, notification as any),
    ).resolves.toEqual({ sent: true });

    expect(inchService.fireCustomNotification).toHaveBeenCalledWith(
      req.device,
      notification,
    );
  });

  it('applies wallet-scoped limits to Fusion submit flows', () => {
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, controller.submitOrder)).toEqual(
      [
        { points: 20, duration: 60, key: 'inch-submit-order-ip', keyBy: 'ip' },
        {
          points: 10,
          duration: 60,
          key: 'inch-submit-order-device',
          keyBy: 'device',
        },
        {
          points: 10,
          duration: 60,
          key: 'inch-submit-order-wallet',
          keyBy: 'wallet',
        },
      ],
    );
    expect(
      Reflect.getMetadata(RATE_LIMIT_KEY, controller.submitFusionPlusOrder),
    ).toEqual([
      {
        points: 20,
        duration: 60,
        key: 'inch-submit-fusion-plus-order-ip',
        keyBy: 'ip',
        redisFailurePolicy: 'fail-closed',
      },
      {
        points: 10,
        duration: 60,
        key: 'inch-submit-fusion-plus-order-device',
        keyBy: 'device',
        redisFailurePolicy: 'fail-closed',
      },
      {
        points: 10,
        duration: 60,
        key: 'inch-submit-fusion-plus-order-wallet',
        keyBy: 'wallet',
        redisFailurePolicy: 'fail-closed',
      },
    ]);
  });

  it('fails closed for Redis-backed Fusion+ rate-limit metadata', () => {
    const redisBackedHandlers = [
      controller.createFusionPlusOrder,
      controller.submitFusionPlusOrder,
      controller.buildFusionPlusNativeOrder,
      controller.confirmOrder,
    ];

    for (const handler of redisBackedHandlers) {
      expect(Reflect.getMetadata(RATE_LIMIT_KEY, handler)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ redisFailurePolicy: 'fail-closed' }),
        ]),
      );
    }
  });

  it('applies device-scoped limits to custom notifications', () => {
    expect(
      Reflect.getMetadata(RATE_LIMIT_KEY, controller.customNotification),
    ).toEqual([
      {
        points: 10,
        duration: 60,
        key: 'custom-notification-minute-ip',
        keyBy: 'ip',
      },
      {
        points: 10,
        duration: 60,
        key: 'custom-notification-minute-device',
        keyBy: 'device',
      },
      {
        points: 50,
        duration: 3600,
        key: 'custom-notification-hour-ip',
        keyBy: 'ip',
      },
      {
        points: 50,
        duration: 3600,
        key: 'custom-notification-hour-device',
        keyBy: 'device',
      },
    ]);
  });

  it('applies route-specific body size limits to provider payload routes', () => {
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.submitOrder),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.providerOrderPayload,
      key: 'inch-submit-order',
    });
    expect(
      Reflect.getMetadata(
        BODY_SIZE_LIMIT_KEY,
        controller.submitFusionPlusOrder,
      ),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.providerOrderPayload,
      key: 'inch-submit-fusion-plus-order',
    });
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.customNotification),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.notification,
      key: 'custom-notification',
    });
  });
});
