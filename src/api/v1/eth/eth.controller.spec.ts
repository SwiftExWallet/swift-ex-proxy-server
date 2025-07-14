import { Test, TestingModule } from '@nestjs/testing';
import { EthController } from './eth.controller';

describe('EthController', () => {
  let controller: EthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EthController],
    }).compile();

    controller = module.get<EthController>(EthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
