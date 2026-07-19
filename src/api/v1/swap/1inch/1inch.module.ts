import { Module } from '@nestjs/common';
import { inchController } from './1inch.controller';
import { InchService } from './1inch.service';
import { SwapOrdersModule } from '../../swapOrders/swapOrders.module';
import { RedisModule } from '../../redis/redis.module';
import { FustionNativeService } from './1inch.fusion.native.swap.service';
import { FirebaseNotificationService } from '../../notification/firebase/notification.service';
import { CustomNotificationOriginGuard } from '../../common/guard/custom-notification-origin.guard';

@Module({
  imports: [SwapOrdersModule, RedisModule],
  providers: [
    InchService,
    FustionNativeService,
    FirebaseNotificationService,
    CustomNotificationOriginGuard,
  ],
  controllers: [inchController],
})
export class InchModule {}
