import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;
  const repository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrdersService(repository as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('finds an order by id', async () => {
    const order = { _id: 'order-id' };
    repository.findOne.mockResolvedValue(order);

    await expect(service.findOne('order-id' as any)).resolves.toBe(order);
    expect(repository.findOne).toHaveBeenCalledWith({ _id: 'order-id' });
  });

  it('finds an order by order number', async () => {
    const order = { orderNo: 'order-no' };
    repository.findOne.mockResolvedValue(order);

    await expect(service.findOneByOrderNo('order-no')).resolves.toBe(order);
    expect(repository.findOne).toHaveBeenCalledWith({ orderNo: 'order-no' });
  });

  it('updates an order', async () => {
    const updateDto = { status: 'completed' };
    const result = { restored: 1 };
    repository.update.mockResolvedValue(result);

    await expect(
      service.update('order-id' as any, updateDto as any),
    ).resolves.toBe(result);
    expect(repository.update).toHaveBeenCalledWith('order-id', updateDto);
  });
});
