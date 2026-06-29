import { Module } from '@nestjs/common';
import { inchController } from './1inch.controller';
import { InchService } from './1inch.service';
import { SwapOrdersModule } from '../../swapOrders/swapOrders.module';
import { RedisModule } from '../../redis/redis.module';
import { FustionNativeService } from './1inch.fusion.native.swap.service';
import { FirebaseNotificationService } from '../../notification/firebase/notification.service';

@Module({
  imports: [SwapOrdersModule, RedisModule],
  providers: [InchService,FustionNativeService,FirebaseNotificationService],
  controllers: [inchController],
})
export class InchModule {}
