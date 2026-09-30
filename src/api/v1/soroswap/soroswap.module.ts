import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { SoroswapController } from './soroswap.controller';
import { SoroswapService } from './soroswap.service';

@Module({
  imports: [RedisModule],
  controllers: [SoroswapController],
  providers: [
    SoroswapService,
  ],
})
export class SoroswapModule {}
