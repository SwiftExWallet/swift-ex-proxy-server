import { DeviceService } from './device.service';

describe('DeviceService', () => {
  let service: DeviceService;
  const repository = {
    findOne: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DeviceService(repository as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('finds a device by id', async () => {
    const device = { _id: 'device-id' };
    repository.findOne.mockResolvedValue(device);

    await expect(service.findOne('device-id' as any)).resolves.toBe(device);
    expect(repository.findOne).toHaveBeenCalledWith({ _id: 'device-id' });
  });
});
