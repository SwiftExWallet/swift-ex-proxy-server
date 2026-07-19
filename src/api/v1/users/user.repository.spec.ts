import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRepository } from './user.repository';
import { User } from './schema/user.schema';

describe('UserRepository', () => {
  let repository: UserRepository;
  let userModel: {
    findOne: jest.Mock;
  };

  beforeEach(async () => {
    userModel = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRepository,
        {
          provide: getModelToken(User.name),
          useValue: userModel,
        },
      ],
    }).compile();

    repository = module.get<UserRepository>(UserRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('finds one user by condition', async () => {
    const cond = { email: 'user@example.com' };
    const user = { _id: 'user-id', email: cond.email };
    userModel.findOne.mockResolvedValue(user);

    await expect(repository.findOne(cond)).resolves.toBe(user);
    expect(userModel.findOne).toHaveBeenCalledWith(cond);
  });

  it('returns null when user is not found', async () => {
    const cond = { email: 'missing@example.com' };
    userModel.findOne.mockResolvedValue(null);

    await expect(repository.findOne(cond)).resolves.toBeNull();
    expect(userModel.findOne).toHaveBeenCalledWith(cond);
  });

  it('finds one user with password selected', async () => {
    const cond = { email: 'user@example.com' };
    const user = { _id: 'user-id', email: cond.email, password: 'hash' };
    const select = jest.fn().mockResolvedValue(user);
    userModel.findOne.mockReturnValue({ select });

    await expect(repository.findOneWithPassword(cond)).resolves.toBe(user);
    expect(userModel.findOne).toHaveBeenCalledWith(cond);
    expect(select).toHaveBeenCalledWith('+password');
  });

  it('returns null when selecting password for a missing user', async () => {
    const cond = { email: 'missing@example.com' };
    const select = jest.fn().mockResolvedValue(null);
    userModel.findOne.mockReturnValue({ select });

    await expect(repository.findOneWithPassword(cond)).resolves.toBeNull();
    expect(userModel.findOne).toHaveBeenCalledWith(cond);
    expect(select).toHaveBeenCalledWith('+password');
  });
});
