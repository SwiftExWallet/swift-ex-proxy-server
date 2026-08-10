import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { OrderRepository } from './order.repository';
import mongoose from 'mongoose';

const mockOrderRepo = {
  findOne: jest.fn(),
  update: jest.fn(),
};

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: OrderRepository, useValue: mockOrderRepo },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('delegates to repo with _id condition', async () => {
      const id = new mongoose.Types.ObjectId() as any;
      const order = { _id: id, orderNo: 'ORD-001' };
      mockOrderRepo.findOne.mockResolvedValue(order);

      const result = await service.findOne(id);
      expect(mockOrderRepo.findOne).toHaveBeenCalledWith({ _id: id });
      expect(result).toEqual(order);
    });

    it('returns null when order not found', async () => {
      mockOrderRepo.findOne.mockResolvedValue(null);
      expect(
        await service.findOne(new mongoose.Types.ObjectId() as any),
      ).toBeNull();
    });
  });

  describe('findOneByOrderNo', () => {
    it('delegates to repo with orderNo condition', async () => {
      const order = { orderNo: 'ORD-001' };
      mockOrderRepo.findOne.mockResolvedValue(order);

      const result = await service.findOneByOrderNo('ORD-001');
      expect(mockOrderRepo.findOne).toHaveBeenCalledWith({
        orderNo: 'ORD-001',
      });
      expect(result).toEqual(order);
    });

    it('returns null when order not found by orderNo', async () => {
      mockOrderRepo.findOne.mockResolvedValue(null);
      expect(await service.findOneByOrderNo('NOT-EXIST')).toBeNull();
    });
  });

  describe('update', () => {
    it('delegates to repo with id and dto', async () => {
      const id = new mongoose.Types.ObjectId() as any;
      const dto = { status: 'COMPLETED' } as any;
      mockOrderRepo.update.mockResolvedValue({ restored: 1 });

      const result = await service.update(id, dto);
      expect(mockOrderRepo.update).toHaveBeenCalledWith(id, dto);
      expect(result).toEqual({ restored: 1 });
    });
  });
});
