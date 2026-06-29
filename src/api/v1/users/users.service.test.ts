import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { UserRepository } from './user.repository';
import mongoose from 'mongoose';

const mockUserRepo = { findOne: jest.fn() };

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UserRepository, useValue: mockUserRepo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('delegates to repo with _id condition', async () => {
      const id = new mongoose.Types.ObjectId() as any;
      const user = { _id: id, email: 'test@example.com' };
      mockUserRepo.findOne.mockResolvedValue(user);

      const result = await service.findOne(id);
      expect(mockUserRepo.findOne).toHaveBeenCalledWith({ _id: id });
      expect(result).toEqual(user);
    });

    it('returns null when user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      expect(await service.findOne(new mongoose.Types.ObjectId() as any)).toBeNull();
    });
  });
});
