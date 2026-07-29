import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SwapOrders, SwapOrderSchema } from './schema/swapOrder.schema';
import { ExhaustedOrder, ExhaustedOrderSchema } from './schema/exhaustedOrder.schema';
import { SwapOrderService } from './swapOrders.service';
import { SwapOrderRepository } from './swapOrder.repository';
import { SwapOrdersController } from './swapOrders.controller';
import { RangoPollerService } from '../crons/rangoPoller.service';
import { AllbridgePollerService } from '../crons/allbridgePoller.service';
import { InchWsPollerService } from '../swap/1inch/inchWsPoller.service';
import { RangoService } from '../swap/rango/rango.service';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { EvmTxPollerService } from '../crons/evmTxPoller.service';
import { RedisService } from '../redis/redis.service';
import { InchFusionPlusWsPollerService } from '../swap/1inch/inchFusionPlusWsPoller.service';
import { UniswapTxPollerService } from '../crons/uniswapTxPoller.service';
import { NearIntentPollerService } from '../swap/nearIntent/nearIntentPoller.service';
import { NearIntentExhaustedReconcilerService } from '../crons/nearIntentExhaustedReconciler.service';
import { PortfolioModule } from '../portfolio/portfolio.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SwapOrders.name, schema: SwapOrderSchema },
      { name: ExhaustedOrder.name, schema: ExhaustedOrderSchema },
    ]),
    PortfolioModule,
  ],
  providers: [
    SwapOrderService,
    SwapOrderRepository,
    RangoPollerService,
    AllbridgePollerService,
    InchWsPollerService,
    RangoService,
    FirebaseNotificationService,
    EvmTxPollerService,
    InchFusionPlusWsPollerService,
    RedisService,
    UniswapTxPollerService,
    NearIntentPollerService,
    NearIntentExhaustedReconcilerService,
  ],
  controllers: [SwapOrdersController],
  exports: [SwapOrderService, InchWsPollerService,InchFusionPlusWsPollerService, NearIntentPollerService],
})
export class SwapOrdersModule {}
