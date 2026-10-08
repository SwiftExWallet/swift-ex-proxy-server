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

  it('returns the wrapped portfolio summary for the authenticated device', async () => {
    const req = { device: { _id: 'device-id' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const result = {
      success: true,
      data: {
        device: {
          id: 'device-id',
          maskedId: '••••e-id',
          isSynced: true,
          lastUpdated: '2026-10-03T07:20:00.000Z',
        },
        summary: {
          totalValueUsd: 25000,
          portfolioCount: 1,
          assetCount: 1,
          networkCount: 1,
        },
        networks: [],
        assets: [],
        portfolios: [],
      },
    };
    portfolioService.getDevicePortfolioTotals.mockResolvedValue(result);

    await controller.getDevicePortfolioTotals(req, res);

    expect(portfolioService.getDevicePortfolioTotals).toHaveBeenCalledWith(
      'device-id',
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
  });
});
