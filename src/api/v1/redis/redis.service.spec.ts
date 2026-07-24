import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';

const mockRedisClient = {
  ping: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  quit: jest.fn(),
  on: jest.fn(),
  config: jest.fn(),
};

jest.mock('../common/config/datastore.config', () => ({
  createRedisClient: jest.fn(() => mockRedisClient),
}));

describe('RedisService', () => {
  const originalEnv = process.env;
  let service: RedisService;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.REDIS_PERSISTENCE_REQUIRED;
    delete process.env.REDIS_PERSISTENCE_MODE;
    jest.clearAllMocks();
    mockRedisClient.ping.mockResolvedValue('PONG');
    mockRedisClient.quit.mockResolvedValue('OK');
    mockRedisClient.on.mockReturnValue(mockRedisClient);
    mockRedisClient.config.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisService],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('registers Redis health events and marks the client healthy after ping', async () => {
    await service.onModuleInit();

    expect(mockRedisClient.on).toHaveBeenCalledWith(
      'ready',
      expect.any(Function),
    );
    expect(mockRedisClient.on).toHaveBeenCalledWith(
      'error',
      expect.any(Function),
    );
    expect(mockRedisClient.ping).toHaveBeenCalled();
    expect(service.isHealthy()).toBe(true);
    expect(service.getHealthSnapshot()).toMatchObject({
      healthy: true,
      state: 'ready',
    });
  });

  it('returns false from pingHealth and records unhealthy state when Redis ping fails', async () => {
    await service.onModuleInit();
    mockRedisClient.ping.mockRejectedValueOnce({ code: 'ECONNRESET' });

    await expect(service.pingHealth()).resolves.toBe(false);
    expect(service.getHealthSnapshot()).toMatchObject({
      healthy: false,
      state: 'error',
      lastErrorCode: 'ECONNRESET',
    });
  });

  it('validates snapshot persistence when required', async () => {
    process.env.REDIS_PERSISTENCE_REQUIRED = 'true';
    process.env.REDIS_PERSISTENCE_MODE = 'snapshot';
    mockRedisClient.config.mockImplementation((command, key) => {
      if (command === 'GET' && key === 'save') {
        return Promise.resolve(['save', '900 1']);
      }
      if (command === 'GET' && key === 'appendonly') {
        return Promise.resolve(['appendonly', 'no']);
      }
      return Promise.resolve([]);
    });

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(mockRedisClient.config).toHaveBeenCalledWith('GET', 'save');
    expect(mockRedisClient.config).toHaveBeenCalledWith('GET', 'appendonly');
  });

  it('rejects startup when snapshot persistence is required but disabled', async () => {
    process.env.REDIS_PERSISTENCE_REQUIRED = 'true';
    process.env.REDIS_PERSISTENCE_MODE = 'snapshot';
    mockRedisClient.config.mockImplementation((command, key) => {
      if (command === 'GET' && key === 'save') {
        return Promise.resolve(['save', '']);
      }
      if (command === 'GET' && key === 'appendonly') {
        return Promise.resolve(['appendonly', 'no']);
      }
      return Promise.resolve([]);
    });

    await expect(service.onModuleInit()).rejects.toThrow(
      'Redis snapshot persistence is required but disabled.',
    );
  });

  it('validates AOF persistence when required', async () => {
    process.env.REDIS_PERSISTENCE_REQUIRED = 'true';
    process.env.REDIS_PERSISTENCE_MODE = 'aof';
    mockRedisClient.config.mockImplementation((command, key) => {
      if (command === 'GET' && key === 'save') {
        return Promise.resolve(['save', '']);
      }
      if (command === 'GET' && key === 'appendonly') {
        return Promise.resolve(['appendonly', 'yes']);
      }
      return Promise.resolve([]);
    });

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('does not call CONFIG when persistence is externally managed', async () => {
    process.env.REDIS_PERSISTENCE_REQUIRED = 'true';
    process.env.REDIS_PERSISTENCE_MODE = 'managed';

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(mockRedisClient.config).not.toHaveBeenCalled();
  });

  it('rejects non-managed persistence checks when Redis CONFIG is unavailable', async () => {
    process.env.REDIS_PERSISTENCE_REQUIRED = 'true';
    process.env.REDIS_PERSISTENCE_MODE = 'aof';
    mockRedisClient.config.mockRejectedValue(new Error('NOPERM'));

    await expect(service.onModuleInit()).rejects.toThrow(
      'Redis persistence validation failed.',
    );
  });

  it('stores, reads, deletes, and quits through the Redis client', async () => {
    await service.onModuleInit();
    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.get.mockResolvedValue('stored-value');
    mockRedisClient.del.mockResolvedValue(1);

    await service.setKey('key-without-ttl', 'value');
    await service.setKey('key-with-ttl', 'value', 300);
    await expect(service.getKey('key-with-ttl')).resolves.toBe('stored-value');
    await service.delKey('key-with-ttl');
    await service.onModuleDestroy();

    expect(mockRedisClient.set).toHaveBeenCalledWith(
      'key-without-ttl',
      'value',
    );
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      'key-with-ttl',
      'value',
      'EX',
      300,
    );
    expect(mockRedisClient.get).toHaveBeenCalledWith('key-with-ttl');
    expect(mockRedisClient.del).toHaveBeenCalledWith('key-with-ttl');
    expect(mockRedisClient.quit).toHaveBeenCalled();
  });
});
