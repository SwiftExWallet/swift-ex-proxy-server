import { EthController } from './eth.controller';

describe('EthController', () => {
  let controller: EthController;
  const ethService = {
    getSwapQuote: jest.fn(),
  };
  const tokenMetadataService = {
    normalizeSwapQuote: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new EthController(
      ethService as any,
      tokenMetadataService as any,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
