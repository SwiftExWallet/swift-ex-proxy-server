import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { SwapOrderStatus, OrderType } from '../common/enums/order.enum';
import { OrderRepository } from './order.repository';
import { UpdateOrderDto } from './dto/updateOrder.dto';
import { Order } from './schema/order.schema';

describe('OrderRepository', () => {
  let repository: OrderRepository;
  let orderModel: {
    findOne: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };

  const updateDto = () =>
    ({
      _id: 'order-id',
      userId: 'user-id',
      orderNo: 'order-no',
      fiatCurrency: 'USD',
      orderType: OrderType.BUY,
      status: SwapOrderStatus.COMPLETED,
    }) as unknown as UpdateOrderDto;

  beforeEach(async () => {
    orderModel = {
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderRepository,
        {
          provide: getModelToken(Order.name),
          useValue: orderModel,
        },
      ],
    }).compile();

    repository = module.get<OrderRepository>(OrderRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('finds one order by condition', async () => {
    const cond = { orderNo: 'order-no' };
    const order = { _id: 'order-id', orderNo: cond.orderNo };
    orderModel.findOne.mockResolvedValue(order);

    await expect(repository.findOne(cond)).resolves.toBe(order);
    expect(orderModel.findOne).toHaveBeenCalledWith(cond);
  });

  it('returns null when order is not found', async () => {
    const cond = { orderNo: 'missing-order' };
    orderModel.findOne.mockResolvedValue(null);

    await expect(repository.findOne(cond)).resolves.toBeNull();
    expect(orderModel.findOne).toHaveBeenCalledWith(cond);
  });

  it('updates an order by id', async () => {
    const dto = updateDto();
    const result = { restored: 1 };
    orderModel.findByIdAndUpdate.mockResolvedValue(result);

    await expect(repository.update(dto._id, dto)).resolves.toBe(result);
    expect(orderModel.findByIdAndUpdate).toHaveBeenCalledWith(
      { _id: dto._id },
      dto,
    );
  });

  it('returns null when no order is updated', async () => {
    const dto = updateDto();
    orderModel.findByIdAndUpdate.mockResolvedValue(null);

    await expect(repository.update(dto._id, dto)).resolves.toBeNull();
    expect(orderModel.findByIdAndUpdate).toHaveBeenCalledWith(
      { _id: dto._id },
      dto,
    );
  });
});
