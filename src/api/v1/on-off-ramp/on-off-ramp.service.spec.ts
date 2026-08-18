import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AlchemyService } from './alchemy/alchemy.service';
import { BanxaService } from './banxa/banxa.service';
import { MoonPayService } from './moonpay/moonpay.service';
import { OnOffRampProvider } from './on-off-ramp-provider.enum';
import { OnOffRampService } from './on-off-ramp.service';
import { UserQueueService } from '../common/user-queue/user-queue.service';

describe('OnOffRampService', () => {
  let service: OnOffRampService;
  let alchemyService: {
    fetchQuotes: jest.Mock;
    orderCreate: jest.Mock;
    sellOrderCreate: jest.Mock;
  };
  let banxaService: {
    fetchAssets: jest.Mock;
    fetchQuotes: jest.Mock;
    buyOrderCreate: jest.Mock;
    sellOrderCreate: jest.Mock;
  };
  let moonPayService: {
    getCurrencies: jest.Mock;
    getQuote: jest.Mock;
    buildLink: jest.Mock;
  };

  beforeEach(async () => {
    alchemyService = {
      fetchQuotes: jest.fn(),
      orderCreate: jest.fn(),
      sellOrderCreate: jest.fn(),
    };
    banxaService = {
      fetchAssets: jest.fn(),
      fetchQuotes: jest.fn(),
      buyOrderCreate: jest.fn(),
      sellOrderCreate: jest.fn(),
    };
    moonPayService = {
      getCurrencies: jest.fn(),
      getQuote: jest.fn(),
      buildLink: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnOffRampService,
        { provide: AlchemyService, useValue: alchemyService },
        { provide: BanxaService, useValue: banxaService },
        { provide: MoonPayService, useValue: moonPayService },
        {
          provide: UserQueueService,
          useValue: {
            processUserRequest: jest
              .fn()
              .mockImplementation((fn: () => unknown) => fn()),
          },
        },
      ],
    }).compile();

    service = module.get(OnOffRampService);
  });

  it('routes quote requests to Alchemy with normalized side', async () => {
    alchemyService.fetchQuotes.mockResolvedValue({
      status: true,
      data: { quoteId: 'alchemy-quote' },
    });

    await expect(
      service.getQuote({
        provider: OnOffRampProvider.ALCHEMY,
        crypto: 'USDC',
        network: 'ETH',
        fiat: 'USD',
        amount: '100',
        side: 'buy',
      }),
    ).resolves.toEqual({
      success: true,
      data: { quoteId: 'alchemy-quote' },
    });
    expect(alchemyService.fetchQuotes).toHaveBeenCalledWith({
      crypto: 'USDC',
      network: 'ETH',
      fiat: 'USD',
      amount: '100',
      side: 'BUY',
    });
  });

  it('routes quote requests to Banxa with blockchain fallback from network', async () => {
    banxaService.fetchQuotes.mockResolvedValue({
      status: true,
      data: { quoteId: 'banxa-quote' },
    });

    await expect(
      service.getQuote({
        provider: OnOffRampProvider.BANXA,
        paymentMethodId: 'card',
        crypto: 'USDC',
        network: 'ETH',
        fiat: 'USD',
        fiatAmount: '100',
        side: 'sell',
      }),
    ).resolves.toEqual({
      success: true,
      data: { quoteId: 'banxa-quote' },
    });
    expect(banxaService.fetchQuotes).toHaveBeenCalledWith({
      paymentMethodId: 'card',
      crypto: 'USDC',
      blockchain: 'ETH',
      fiat: 'USD',
      cryptoAmount: undefined,
      fiatAmount: '100',
      orderType: 'sell',
    });
  });

  it('routes quote requests to MoonPay', async () => {
    moonPayService.getQuote.mockResolvedValue({ totalAmount: 100 });

    await expect(
      service.getQuote({
        provider: OnOffRampProvider.MOONPAY,
        side: 'buy',
        crypto: 'usdc',
        amount: 100,
        fiat: 'usd',
      }),
    ).resolves.toEqual({ totalAmount: 100 });
    expect(moonPayService.getQuote).toHaveBeenCalledWith(
      'buy',
      'usdc',
      100,
      'usd',
    );
  });

  it('routes buy and sell order requests to provider methods', async () => {
    alchemyService.orderCreate.mockReturnValue('alchemy-buy-url');
    banxaService.sellOrderCreate.mockResolvedValue({
      status: true,
      data: { id: 'banxa-sell' },
    });

    expect(
      await service.createOrder(
        {
          provider: OnOffRampProvider.ALCHEMY,
          side: 'buy',
          amount: '10',
          fiatCurrency: 'USD',
          cryptoCurrency: 'USDC',
          address: '0xabc',
          network: 'ETH',
          payWayCode: 'CARD',
        },
        {},
      ),
    ).toEqual({ success: 'alchemy-buy-url' });
    expect(
      await service.createOrder(
        {
          provider: OnOffRampProvider.BANXA,
          side: 'sell',
          paymentMethodId: 'bank',
          crypto: 'USDC',
          blockchain: 'ETH',
          fiat: 'USD',
          cryptoAmount: '10',
          walletAddress: '0xabc',
        },
        { _id: 'device-id' },
      ),
    ).toEqual({ success: { status: true, data: { id: 'banxa-sell' } } });
    expect(alchemyService.orderCreate).toHaveBeenCalledWith({
      amount: '10',
      fiatCurrency: 'USD',
      cryptoCurrency: 'USDC',
      address: '0xabc',
      network: 'ETH',
      payWayCode: 'CARD',
    });
    expect(banxaService.sellOrderCreate).toHaveBeenCalledWith(
      {
        paymentMethodId: 'bank',
        crypto: 'USDC',
        blockchain: 'ETH',
        fiat: 'USD',
        cryptoAmount: '10',
        walletAddress: '0xabc',
      },
      { _id: 'device-id' },
    );
  });

  it('routes assets and link requests to supported providers only', async () => {
    banxaService.fetchAssets.mockResolvedValue({ data: [] });
    moonPayService.getCurrencies.mockResolvedValue({ count: 1 });
    moonPayService.buildLink.mockResolvedValue({ url: 'moonpay-url' });

    await expect(
      service.getAssets({ provider: OnOffRampProvider.BANXA, side: 'buy' }),
    ).resolves.toEqual({
      data: [],
    });
    await expect(
      service.getAssets({ provider: OnOffRampProvider.MOONPAY, side: 'sell' }),
    ).resolves.toEqual({ count: 1 });
    await expect(
      service.buildLink(
        {
          provider: OnOffRampProvider.MOONPAY,
          side: 'buy',
          code: 'usdc',
          amount: 10,
        },
        { _id: 'device-id' },
      ),
    ).resolves.toEqual({ url: 'moonpay-url' });
    expect(banxaService.fetchAssets).toHaveBeenCalledWith({
      orderType: 'buy',
    });
    expect(moonPayService.getCurrencies).toHaveBeenCalledWith('sell');
    expect(moonPayService.buildLink).toHaveBeenCalledWith(
      { side: 'buy', code: 'usdc', amount: 10, fiat: 'usd' },
      { _id: 'device-id' },
    );
  });

  it('rejects unsupported providers and provider actions', async () => {
    await expect(
      service.getQuote({
        provider: 'stripe' as unknown as OnOffRampProvider,
        side: 'buy',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getAssets({ provider: OnOffRampProvider.ALCHEMY }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.buildLink({ provider: OnOffRampProvider.BANXA }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates provider-specific payloads before dispatching', async () => {
    await expect(
      service.getQuote({
        provider: OnOffRampProvider.ALCHEMY,
        crypto: 'USDC',
        network: 'ETH',
        fiat: 'USD',
        side: 'buy',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(alchemyService.fetchQuotes).not.toHaveBeenCalled();
  });

  it('types provider as an enum field on the payload', () => {
    const payload: Parameters<OnOffRampService['getQuote']>[0] = {
      // @ts-expect-error service provider must use the provider enum
      provider: 'banxa',
    };

    expect(payload.provider).toBe('banxa');
  });
});
