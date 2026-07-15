import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';
import { createRedisClient } from '../common/config/datastore.config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private client: Redis | null = null;

  async onModuleInit() {
    this.client = createRedisClient();
    await this.checkConnection();
  }

  onModuleDestroy() {
    this.client?.quit();
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
      console.log('Redis PING response:', pong); // should log "PONG"
      return pong;
    } catch (err) {
      console.error('Redis connection failed:', err);
      throw err;
    }
  }

  async setKey(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.getClient().set(key, value, 'EX', ttlSeconds);
      this.logger.log('=== redis key set with ttl ===');
    } else {
      await this.getClient().set(key, value);
      this.logger.log('=== redis key set without ttl ===');
    }
  }

  async getKey(key: string): Promise<string | null> {
    return await this.getClient().get(key);
  }

  async delKey(key: string): Promise<void> {
    await this.getClient().del(key);
  }
}
