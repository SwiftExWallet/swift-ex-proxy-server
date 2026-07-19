import { BscController } from './bsc.controller';

describe('BscController', () => {
  let controller: BscController;
  const bscService = {
    getSwapQuote: jest.fn(),
  };
  const tokenMetadataService = {
    normalizeSwapQuote: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BscController(
      bscService as any,
      tokenMetadataService as any,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
