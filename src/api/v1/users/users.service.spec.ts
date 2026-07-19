import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const repository = {
    findOne: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(repository as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('finds a user by id', async () => {
    const user = { _id: 'user-id' };
    repository.findOne.mockResolvedValue(user);

    await expect(service.findOne('user-id' as any)).resolves.toBe(user);
    expect(repository.findOne).toHaveBeenCalledWith({ _id: 'user-id' });
  });
});
