import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';
import { createRedisClient } from '../common/config/datastore.config';

type RedisConnectionState =
  | 'not_initialized'
  | 'connecting'
  | 'ready'
  | 'error'
  | 'closed'
  | 'ended'
  | 'reconnecting';

type RedisPersistenceMode = 'snapshot' | 'aof' | 'managed';

interface RedisHealthSnapshot {
  healthy: boolean;
  state: RedisConnectionState;
  lastReadyAt?: Date;
  lastErrorAt?: Date;
  lastErrorCode?: string;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private client: Redis | null = null;
  private connectionState: RedisConnectionState = 'not_initialized';
  private lastReadyAt?: Date;
  private lastErrorAt?: Date;
  private lastErrorCode?: string;

  async onModuleInit() {
    this.client = createRedisClient();
    this.connectionState = 'connecting';
    this.bindClientEvents(this.client);
    await this.checkConnection();
    await this.validatePersistenceIfRequired();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
  }

  private getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client is not initialized');
    }

    return this.client;
  }

  async checkConnection() {
    try {
      const pong = await this.getClient().ping();
      this.markReady();
      this.logger.log('Redis connection check succeeded.');
      return pong;
    } catch (err) {
      this.markUnavailable('error', err);
      this.logger.error(
        `Redis connection check failed. code=${this.getErrorCode(err)}`,
      );
      throw err;
    }
  }

  isHealthy(): boolean {
    return this.connectionState === 'ready';
  }

  getHealthSnapshot(): RedisHealthSnapshot {
    return {
      healthy: this.isHealthy(),
      state: this.connectionState,
      lastReadyAt: this.lastReadyAt,
      lastErrorAt: this.lastErrorAt,
      lastErrorCode: this.lastErrorCode,
    };
  }

  async pingHealth(): Promise<boolean> {
    try {
      await this.checkConnection();
      return true;
    } catch {
      return false;
    }
  }

  async setKey(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.getClient().set(key, value, 'EX', ttlSeconds);
      this.logger.debug('Redis key set with TTL.');
    } else {
      await this.getClient().set(key, value);
      this.logger.debug('Redis key set without TTL.');
    }
  }

  async getKey(key: string): Promise<string | null> {
    return await this.getClient().get(key);
  }

  async delKey(key: string): Promise<void> {
    await this.getClient().del(key);
  }

  private bindClientEvents(client: Redis): void {
    client.on('ready', () => this.markReady());
    client.on('error', (err) => {
      this.markUnavailable('error', err);
      this.logger.error(`Redis client error. code=${this.getErrorCode(err)}`);
    });
    client.on('close', () => this.markUnavailable('closed'));
    client.on('end', () => this.markUnavailable('ended'));
    client.on('reconnecting', () => this.markUnavailable('reconnecting'));
  }

  private markReady(): void {
    this.connectionState = 'ready';
    this.lastReadyAt = new Date();
  }

  private markUnavailable(state: RedisConnectionState, err?: unknown): void {
    this.connectionState = state;
    this.lastErrorAt = new Date();
    this.lastErrorCode = this.getErrorCode(err);
  }

  private getErrorCode(err: unknown): string {
    if (typeof err === 'object' && err !== null) {
      const candidate = err as { code?: unknown; name?: unknown };
      if (typeof candidate.code === 'string' && candidate.code.length > 0) {
        return candidate.code;
      }
      if (typeof candidate.name === 'string' && candidate.name.length > 0) {
        return candidate.name;
      }
    }

    return 'unknown';
  }

  private async validatePersistenceIfRequired(): Promise<void> {
    if (process.env.REDIS_PERSISTENCE_REQUIRED !== 'true') {
      return;
    }

    const mode = this.getPersistenceMode();
    if (mode === 'managed') {
      this.logger.log('Redis persistence is marked as externally managed.');
      return;
    }

    let saveConfig: unknown;
    let appendOnlyConfig: unknown;
    try {
      [saveConfig, appendOnlyConfig] = await Promise.all([
        this.getClient().config('GET', 'save'),
        this.getClient().config('GET', 'appendonly'),
      ]);
    } catch {
      throw new Error(
        'Redis persistence validation failed. Set REDIS_PERSISTENCE_MODE=managed when Redis persistence is enforced outside Redis CONFIG.',
      );
    }

    const snapshotSchedule = this.getRedisConfigValue(saveConfig, 'save');
    const appendOnly = this.getRedisConfigValue(appendOnlyConfig, 'appendonly');

    if (mode === 'snapshot' && !snapshotSchedule?.trim()) {
      throw new Error('Redis snapshot persistence is required but disabled.');
    }

    if (mode === 'aof' && appendOnly?.toLowerCase() !== 'yes') {
      throw new Error('Redis AOF persistence is required but disabled.');
    }

    this.logger.log(`Redis ${mode} persistence validation succeeded.`);
  }

  private getPersistenceMode(): RedisPersistenceMode {
    const mode = process.env.REDIS_PERSISTENCE_MODE;
    if (mode === 'snapshot' || mode === 'aof' || mode === 'managed') {
      return mode;
    }

    return 'managed';
  }

  private getRedisConfigValue(
    response: unknown,
    key: string,
  ): string | undefined {
    if (!Array.isArray(response)) {
      return undefined;
    }

    for (let index = 0; index < response.length; index += 2) {
      if (response[index] === key) {
        const value = response[index + 1];
        return typeof value === 'string' ? value : undefined;
      }
    }

    return undefined;
  }
}
