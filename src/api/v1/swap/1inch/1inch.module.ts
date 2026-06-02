import { Module } from '@nestjs/common';
import { inchController } from './1inch.controller';
import { InchService } from './1inch.service';
import { SwapOrdersModule } from '../../swapOrders/swapOrders.module';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [SwapOrdersModule, RedisModule],
  providers: [InchService],
  controllers: [inchController],
})
export class InchModule {}
