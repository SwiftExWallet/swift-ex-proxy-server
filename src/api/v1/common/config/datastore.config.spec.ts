import { getMongoConnectionConfig, getRedisOptions } from './datastore.config';

describe('datastore config validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'production';
    process.env.ENVIRONMENT = 'production';
    delete process.env.REDIS_URL;
    delete process.env.REDIS_ALLOW_LOCALHOST;
    delete process.env.REDIS_ALLOW_DEFAULT_USER;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('local Redis opt-in', () => {
    beforeEach(() => {
      process.env.ENVIRONMENT = 'prod';
      process.env.REDIS_HOST = '127.0.0.1';
      process.env.REDIS_TLS = 'false';
      process.env.REDIS_USERNAME = 'app';
      process.env.REDIS_PWD = 'test-password';
      process.env.REDIS_ALLOW_LOCALHOST = 'true';
    });

    it('allows local Redis without TLS when explicitly enabled', () => {
      expect(getRedisOptions()).toMatchObject({
        host: '127.0.0.1',
        tls: undefined,
      });
    });

    it('still requires TLS for remote Redis with the opt-in enabled', () => {
      process.env.REDIS_HOST = 'redis.example.com';
      expect(() => getRedisOptions()).toThrow(/Redis TLS is required/);
    });

    it('rejects localhost without the opt-in even with TLS', () => {
      delete process.env.REDIS_ALLOW_LOCALHOST;
      process.env.REDIS_TLS = 'true';
      expect(() => getRedisOptions()).toThrow(/Redis must not point at localhost/);
    });

    it('still requires a password for local Redis', () => {
      delete process.env.REDIS_PWD;
      expect(() => getRedisOptions()).toThrow(/Redis password is required/);
    });

    it('still requires an ACL username for local Redis', () => {
      delete process.env.REDIS_USERNAME;
      expect(() => getRedisOptions()).toThrow(/Redis ACL username is required/);
    });
  });

  it('rejects production MongoDB config without TLS', () => {
    process.env.MONGODB_CONN_STRING = 'mongodb://app:secret@mongo.example.com';
    process.env.DB_NAME = 'swiftx';
    delete process.env.MONGO_TLS;

    expect(() => getMongoConnectionConfig()).toThrow(/MongoDB TLS is required/);
  });

  it('accepts production MongoDB config with TLS and credentials', () => {
    process.env.MONGODB_CONN_STRING =
      'mongodb+srv://app:secret@mongo.example.com';
    process.env.DB_NAME = 'swiftx';

    const config = getMongoConnectionConfig();

    expect(config.uri).toBe(process.env.MONGODB_CONN_STRING);
    expect(config.options).toMatchObject({
      dbName: 'swiftx',
      tls: true,
      serverSelectionTimeoutMS: 5000,
    });
  });

  it('rejects production Redis config without TLS', () => {
    process.env.REDIS_HOST = 'redis.example.com';
    process.env.REDIS_PORT = '6379';
    process.env.REDIS_USERNAME = 'swiftx-api';
    process.env.REDIS_PWD = 'secret';
    delete process.env.REDIS_TLS;

    expect(() => getRedisOptions()).toThrow(/Redis TLS is required/);
  });

  it('rejects production Redis config without ACL username', () => {
    process.env.REDIS_HOST = 'redis.example.com';
    process.env.REDIS_PORT = '6379';
    process.env.REDIS_PWD = 'secret';
    process.env.REDIS_TLS = 'true';
    delete process.env.REDIS_USERNAME;

    expect(() => getRedisOptions()).toThrow(/Redis ACL username is required/);
  });

  it('accepts production Redis config with TLS and ACL username', () => {
    process.env.REDIS_HOST = 'redis.example.com';
    process.env.REDIS_PORT = '6380';
    process.env.REDIS_USERNAME = 'swiftx-api';
    process.env.REDIS_PWD = 'secret';
    process.env.REDIS_TLS = 'true';

    expect(getRedisOptions()).toMatchObject({
      host: 'redis.example.com',
      port: 6380,
      username: 'swiftx-api',
      password: 'secret',
      tls: {},
    });
  });
});
