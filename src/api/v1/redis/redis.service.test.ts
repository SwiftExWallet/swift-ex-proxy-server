import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';

const mockRedisClient = {
  ping: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  quit: jest.fn(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockRedisClient),
}));

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PWD = 'secret';
    process.env.REDIS_TTL = '3600';
    jest.clearAllMocks();
    mockRedisClient.ping.mockResolvedValue('PONG');

    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisService],
    }).compile();

    service = module.get<RedisService>(RedisService);
    await service.onModuleInit();
  });

  afterEach(() => {
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PWD;
    delete process.env.REDIS_TTL;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkConnection', () => {
    it('sends PING and returns PONG', async () => {
      const result = await service.checkConnection();
      expect(mockRedisClient.ping).toHaveBeenCalled();
      expect(result).toBe('PONG');
    });

    it('throws when redis is unreachable', async () => {
      mockRedisClient.ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(service.checkConnection()).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('setKey', () => {
    it('calls set without TTL when not provided', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      await service.setKey('myKey', 'myValue');
      expect(mockRedisClient.set).toHaveBeenCalledWith('myKey', 'myValue');
    });

    it('calls set with EX when ttlSeconds provided', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      await service.setKey('myKey', 'myValue', 300);
      expect(mockRedisClient.set).toHaveBeenCalledWith('myKey', 'myValue', 'EX', expect.anything());
    });
  });

  describe('getKey', () => {
    it('returns stored value', async () => {
      mockRedisClient.get.mockResolvedValue('storedValue');
      const result = await service.getKey('myKey');
      expect(result).toBe('storedValue');
      expect(mockRedisClient.get).toHaveBeenCalledWith('myKey');
    });

    it('returns null when key does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      expect(await service.getKey('missing')).toBeNull();
    });
  });

  describe('delKey', () => {
    it('calls del with the key', async () => {
      mockRedisClient.del.mockResolvedValue(1);
      await service.delKey('myKey');
      expect(mockRedisClient.del).toHaveBeenCalledWith('myKey');
    });
  });

  describe('onModuleDestroy', () => {
    it('calls quit on the redis client', () => {
      mockRedisClient.quit.mockResolvedValue('OK');
      service.onModuleDestroy();
      expect(mockRedisClient.quit).toHaveBeenCalled();
    });
  });
});
