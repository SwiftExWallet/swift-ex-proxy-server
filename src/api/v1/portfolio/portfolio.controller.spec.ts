import { PortfolioController } from './portfolio.controller';

describe('PortfolioController', () => {
  const portfolioService = { getPortfolio: jest.fn() };
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
});
