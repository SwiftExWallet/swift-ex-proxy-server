import { Test, TestingModule } from '@nestjs/testing';
import { RangoController } from '../rango/rango.controller';

describe('RangoController', () => {
  let controller: RangoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RangoController],
    }).compile();

    controller = module.get<RangoController>(RangoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
