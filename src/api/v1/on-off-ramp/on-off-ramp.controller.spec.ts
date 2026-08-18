import { Test, TestingModule } from '@nestjs/testing';
import { PATH_METADATA } from '@nestjs/common/constants';
import { RATE_LIMIT_KEY } from '../common/decorators/rate-limit.decorator';
import { OnOffRampController } from './on-off-ramp.controller';
import { OnOffRampProvider } from './on-off-ramp-provider.enum';
import { OnOffRampService } from './on-off-ramp.service';

describe('OnOffRampController', () => {
  let controller: OnOffRampController;
  let service: {
    getQuote: jest.Mock;
    createOrder: jest.Mock;
    getAssets: jest.Mock;
    buildLink: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getQuote: jest.fn(),
      createOrder: jest.fn(),
      getAssets: jest.fn(),
      buildLink: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnOffRampController],
      providers: [{ provide: OnOffRampService, useValue: service }],
    }).compile();

    controller = module.get(OnOffRampController);
  });

  it('passes quote requests to the on/off-ramp service', async () => {
    service.getQuote.mockResolvedValue({ data: 'quote' });
    const payload = {
      provider: OnOffRampProvider.BANXA,
      crypto: 'USDC',
      side: 'buy' as const,
    };

    await expect(controller.getQuote(payload)).resolves.toEqual({
      data: 'quote',
    });
    expect(service.getQuote).toHaveBeenCalledWith(payload);
  });

  it('passes order requests to the on/off-ramp service', async () => {
    const req = { device: { _id: 'device-id' } };
    service.createOrder.mockResolvedValue({ success: 'order' });
    const payload = {
      provider: OnOffRampProvider.ALCHEMY,
      side: 'buy' as const,
    };

    await expect(controller.createOrder(payload, req)).resolves.toEqual({
      success: 'order',
    });
    expect(service.createOrder).toHaveBeenCalledWith(payload, req.device);
  });

  it('passes asset requests to the on/off-ramp service', async () => {
    service.getAssets.mockResolvedValue({ count: 1 });
    const query = {
      provider: OnOffRampProvider.MOONPAY,
      side: 'sell' as const,
    };

    await expect(controller.getAssets(query)).resolves.toEqual({ count: 1 });
    expect(service.getAssets).toHaveBeenCalledWith(query);
  });

  it('passes link requests to the on/off-ramp service', async () => {
    const req = { device: { _id: 'device-id' } };
    service.buildLink.mockResolvedValue({ url: 'moonpay-url' });
    const payload = {
      provider: OnOffRampProvider.MOONPAY,
      side: 'buy' as const,
    };

    await expect(controller.buildLink(payload, req)).resolves.toEqual({
      url: 'moonpay-url',
    });
    expect(service.buildLink).toHaveBeenCalledWith(payload, req.device);
  });

  it('uses provider-free unified routes', () => {
    expect(Reflect.getMetadata(PATH_METADATA, controller.getQuote)).toBe(
      'quote',
    );
    expect(Reflect.getMetadata(PATH_METADATA, controller.createOrder)).toBe(
      'order',
    );
    expect(Reflect.getMetadata(PATH_METADATA, controller.getAssets)).toBe(
      'assets',
    );
    expect(Reflect.getMetadata(PATH_METADATA, controller.buildLink)).toBe(
      'link',
    );
  });

  it('applies IP and device rate limits to all routes', () => {
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, controller.getQuote)).toEqual([
      {
        points: 60,
        duration: 60,
        key: 'on-off-ramp-quote-ip',
        keyBy: 'ip',
      },
      {
        points: 30,
        duration: 60,
        key: 'on-off-ramp-quote-device',
        keyBy: 'device',
      },
    ]);
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, controller.createOrder)).toEqual(
      [
        {
          points: 30,
          duration: 60,
          key: 'on-off-ramp-order-ip',
          keyBy: 'ip',
        },
        {
          points: 15,
          duration: 60,
          key: 'on-off-ramp-order-device',
          keyBy: 'device',
        },
      ],
    );
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, controller.getAssets)).toEqual([
      {
        points: 60,
        duration: 60,
        key: 'on-off-ramp-assets-ip',
        keyBy: 'ip',
      },
      {
        points: 30,
        duration: 60,
        key: 'on-off-ramp-assets-device',
        keyBy: 'device',
      },
    ]);
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, controller.buildLink)).toEqual([
      {
        points: 30,
        duration: 60,
        key: 'on-off-ramp-link-ip',
        keyBy: 'ip',
      },
      {
        points: 15,
        duration: 60,
        key: 'on-off-ramp-link-device',
        keyBy: 'device',
      },
    ]);
  });

  it('types provider as an enum field on the body', () => {
    const payload: Parameters<OnOffRampController['getQuote']>[0] = {
      // @ts-expect-error provider must use the provider enum
      provider: 'banxa',
    };

    expect(payload.provider).toBe('banxa');
  });
});
