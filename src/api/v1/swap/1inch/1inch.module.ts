import { Module } from '@nestjs/common';
import { inchController } from './1inch.controller';
import { InchService } from './1inch.service';
import { SwapOrdersModule } from '../../swapOrders/swapOrders.module';
import { RedisModule } from '../../redis/redis.module';
import { FusionNativeService } from './1inch.fusion.native.swap.service';
import { FirebaseNotificationService } from '../../notification/firebase/notification.service';
import { CustomNotificationOriginGuard } from '../../common/guard/custom-notification-origin.guard';
import { PortfolioModule } from '../../portfolio/portfolio.module';
import { FusionPlusExhaustedReconcilerService } from '../../crons/fusionPlusExhaustedReconcile.service';

@Module({
  imports: [SwapOrdersModule, RedisModule, PortfolioModule],
  providers: [
    InchService,
    FusionNativeService,
    FirebaseNotificationService,
    CustomNotificationOriginGuard,
    FusionPlusExhaustedReconcilerService,
  ],
  controllers: [inchController],
  exports: [InchService],
})
export class InchModule {}
