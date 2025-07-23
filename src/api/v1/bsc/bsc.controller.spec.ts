import { Test, TestingModule } from '@nestjs/testing';
import { BscController } from './bsc.controller';

describe('BscController', () => {
  let controller: BscController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BscController],
    }).compile();

    controller = module.get<BscController>(BscController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
