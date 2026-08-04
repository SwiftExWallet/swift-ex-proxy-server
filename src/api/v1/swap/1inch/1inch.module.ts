import { Module } from '@nestjs/common';
import { inchController } from './1inch.controller';
import { InchService } from './1inch.service';
import { SwapOrdersModule } from '../../swapOrders/swapOrders.module';
import { RedisModule } from '../../redis/redis.module';
import { FustionNativeService } from './1inch.fusion.native.swap.service';
import { FirebaseNotificationService } from '../../notification/firebase/notification.service';
import { FusionPlusExhaustedReconcilerService } from '../../crons/fusionPlusExhaustedReconciler.service';
import { PortfolioModule } from '../../portfolio/portfolio.module';

@Module({
  imports: [
    SwapOrdersModule,
    RedisModule,
    PortfolioModule,
  ],
  providers: [
    InchService,
    FustionNativeService,
    FirebaseNotificationService,
    FusionPlusExhaustedReconcilerService,
  ],
  controllers: [inchController],
})
export class InchModule {}
