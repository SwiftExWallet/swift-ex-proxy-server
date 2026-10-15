import { PortfolioController } from './portfolio.controller';

describe('PortfolioController', () => {
  const portfolioService = {
    getPortfolio: jest.fn(),
    getDevicePortfolioTotals: jest.fn(),
  };
  let controller: PortfolioController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PortfolioController(portfolioService as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates to the service with the requesting device id and hardRefresh flag', async () => {
    const req = { device: { _id: 'device-id' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const portfolio = { tokens: [] };
    portfolioService.getPortfolio.mockResolvedValue(portfolio);

    await controller.getPortfolio(
      req,
      res,
      { address: '0xwallet' } as any,
      { hardRefresh: 'true' } as any,
    );

    expect(portfolioService.getPortfolio).toHaveBeenCalledWith(
      'device-id',
      '0xwallet',
      true,
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(portfolio);
  });

  it('treats a missing hardRefresh query param as false', async () => {
    const req = { device: { _id: 'device-id' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    portfolioService.getPortfolio.mockResolvedValue({ tokens: [] });

    await controller.getPortfolio(
      req,
      res,
      { address: '0xwallet' } as any,
      {} as any,
    );

    expect(portfolioService.getPortfolio).toHaveBeenCalledWith(
      'device-id',
      '0xwallet',
      false,
    );
  });

  it('returns totals and individual portfolios for the requested device id', async () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const result = {
      totals: [
        {
          network: 'eth-mainnet',
          tokenAddress: null,
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          logo: null,
          balanceHex: '0x0',
          balance: '10',
          priceUsd: null,
          valueUsd: '25000',
        },
      ],
      portfolios: [
        {
          address: '0xwallet',
          tokens: [
            {
              network: 'eth-mainnet',
              tokenAddress: null,
              symbol: 'ETH',
              name: 'Ethereum',
              decimals: 18,
              logo: null,
              balanceHex: '0x1',
              balance: '10',
              priceUsd: '2500',
              valueUsd: '25000',
            },
          ],
        },
      ],
    };
    portfolioService.getDevicePortfolioTotals.mockResolvedValue(result);

    await controller.getDevicePortfolioTotals({ deviceId: 'device-id' }, res);

    expect(portfolioService.getDevicePortfolioTotals).toHaveBeenCalledWith(
      'device-id',
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
  });
});
