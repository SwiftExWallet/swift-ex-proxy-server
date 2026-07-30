import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { inchController } from './1inch.controller';
import { InchService } from './1inch.service';
import { SwapOrdersModule } from '../../swapOrders/swapOrders.module';
import { RedisModule } from '../../redis/redis.module';
import { FustionNativeService } from './1inch.fusion.native.swap.service';
import { FirebaseNotificationService } from '../../notification/firebase/notification.service';
import { ExhaustedOrder, ExhaustedOrderSchema } from '../../swapOrders/schema/exhaustedOrder.schema';
import { FusionPlusExhaustedReconcilerService } from '../../crons/fusionPlusExhaustedReconciler.service';

@Module({
  imports: [
    SwapOrdersModule,
    RedisModule,
    MongooseModule.forFeature([{ name: ExhaustedOrder.name, schema: ExhaustedOrderSchema }]),
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
