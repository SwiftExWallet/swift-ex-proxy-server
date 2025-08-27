import { Test, TestingModule } from '@nestjs/testing';
import { BridgeController } from './bridge.controller';

describe('BridgeController', () => {
  let controller: BridgeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BridgeController],
    }).compile();

    controller = module.get<BridgeController>(BridgeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
