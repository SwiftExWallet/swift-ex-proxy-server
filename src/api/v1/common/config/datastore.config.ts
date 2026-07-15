import { MongooseModuleOptions } from '@nestjs/mongoose';
import Redis, { RedisOptions } from 'ioredis';

const PRODUCTION_ENVIRONMENTS = new Set([
  'prod',
  'production',
  'stage',
  'staging',
]);

type MongoConnectionConfig = {
  uri: string;
  options: MongooseModuleOptions;
};

function isProductionLike(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    PRODUCTION_ENVIRONMENTS.has(
      (process.env.ENVIRONMENT || '').trim().toLowerCase(),
    )
  );
}

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function isLocalHost(host: string): boolean {
  return ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(
    host.toLowerCase(),
  );
}

function containsLocalhost(value: string): boolean {
  return /localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/i.test(value);
}

function mongoUriUsesTls(uri: string): boolean {
  return (
    uri.toLowerCase().startsWith('mongodb+srv://') ||
    /[?&](tls|ssl)=true(?:&|$)/i.test(uri) ||
    isTrue(process.env.MONGO_TLS)
  );
}

function mongoUriHasCredentials(uri: string): boolean {
  const withoutProtocol = uri.replace(/^mongodb(\+srv)?:\/\//i, '');
  const authority = withoutProtocol.split('/')[0] || '';
  const authPart = authority.includes('@') ? authority.split('@')[0] : '';
  return authPart.length > 0 && authPart.split(':')[0].length > 0;
}

export function getMongoConnectionConfig(): MongoConnectionConfig {
  const uri = requireEnv('MONGODB_CONN_STRING');
  const dbName = requireEnv('DB_NAME');
  const productionLike = isProductionLike();

  if (productionLike) {
    if (!mongoUriUsesTls(uri)) {
      throw new Error(
        'MongoDB TLS is required in production. Use mongodb+srv://, tls=true, ssl=true, or MONGO_TLS=true.',
      );
    }

    if (containsLocalhost(uri)) {
      throw new Error(
        'MongoDB must not point at localhost in production-like environments.',
      );
    }

    if (!mongoUriHasCredentials(uri) && !isTrue(process.env.MONGO_ALLOW_NO_AUTH)) {
      throw new Error(
        'MongoDB credentials are required in production. Use a least-privilege application user.',
      );
    }
  }

  return {
    uri,
    options: {
      dbName,
      tls: mongoUriUsesTls(uri),
      serverSelectionTimeoutMS: Number(
        process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 5000,
      ),
    },
  };
}

function parseRedisUrl(redisUrl: string): RedisOptions {
  const parsed = new URL(redisUrl);

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: parsed.pathname && parsed.pathname !== '/'
      ? Number(parsed.pathname.slice(1))
      : undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}

export function getRedisOptions(
  overrides: RedisOptions = {},
): RedisOptions {
  const baseOptions = process.env.REDIS_URL
    ? parseRedisUrl(process.env.REDIS_URL)
    : {
        host: requireEnv('REDIS_HOST'),
        port: Number(process.env.REDIS_PORT || 6379),
        username: process.env.REDIS_USERNAME || undefined,
        password: process.env.REDIS_PWD,
        tls: isTrue(process.env.REDIS_TLS) ? {} : undefined,
      };

  const options: RedisOptions = {
    ...baseOptions,
    ...overrides,
  };

  validateRedisOptions(options);
  return options;
}

export function createRedisClient(overrides: RedisOptions = {}): Redis {
  return new Redis(getRedisOptions(overrides));
}

function validateRedisOptions(options: RedisOptions): void {
  if (!isProductionLike()) {
    return;
  }

  if (!options.tls) {
    throw new Error(
      'Redis TLS is required in production. Use REDIS_TLS=true or a rediss:// REDIS_URL.',
    );
  }

  if (!options.password) {
    throw new Error('Redis password is required in production.');
  }

  if (!options.username && !isTrue(process.env.REDIS_ALLOW_DEFAULT_USER)) {
    throw new Error(
      'Redis ACL username is required in production. Set REDIS_USERNAME or explicitly set REDIS_ALLOW_DEFAULT_USER=true.',
    );
  }

  if (options.host && isLocalHost(options.host)) {
    throw new Error(
      'Redis must not point at localhost in production-like environments.',
    );
  }
}
