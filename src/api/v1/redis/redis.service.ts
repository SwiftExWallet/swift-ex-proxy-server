import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private client: Redis;

  onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST,
      port: 6379, // default Redis port
      password: process.env.REDIS_PWD,
    });
    this.checkConnection();
  }

  onModuleDestroy() {
    this.client.quit();
  }

  async checkConnection() {
    try {
      const pong = await this.client.ping();
      console.log('Redis PING response:', pong); // should log "PONG"
      return pong;
    } catch (err) {
      console.error('Redis connection failed:', err);
      throw err;
    }
  }

  async setKey(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', process.env.REDIS_TTL || 1800);
      this.logger.log('=== redis key set with ttl ===');
    } else {
      await this.client.set(key, value);
      this.logger.log('=== redis key set without ttl ===');
    }
  }

  async getKey(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async delKey(key: string): Promise<void> {
    await this.client.del(key);
  }
}
