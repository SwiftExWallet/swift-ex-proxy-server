import { BridgeController } from './bridge.controller';

describe('BridgeController', () => {
  let controller: BridgeController;
  const allBridgeService = {
    prepareTransaction: jest.fn(),
    getSwapDetails: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BridgeController(allBridgeService as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
