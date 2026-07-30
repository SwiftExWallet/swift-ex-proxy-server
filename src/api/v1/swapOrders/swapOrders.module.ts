import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SwapOrders, SwapOrderSchema } from './schema/swapOrder.schema';
import { ExhaustedOrder, ExhaustedOrderSchema } from './schema/exhaustedOrder.schema';
import { SwapOrderService } from './swapOrders.service';
import { SwapOrderRepository } from './swapOrder.repository';
import { SwapOrdersController } from './swapOrders.controller';
import { AllbridgePollerService } from '../crons/allbridgePoller.service';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { EvmTxPollerService } from '../crons/evmTxPoller.service';
import { RedisService } from '../redis/redis.service';
import { UniswapTxPollerService } from '../crons/uniswapTxPoller.service';
import { WalletModule } from '../wallet/wallet.module';
import { NearIntentPollerService } from '../swap/nearIntent/nearIntentPoller.service';
import { NearIntentExhaustedReconcilerService } from '../crons/nearIntentExhaustedReconciler.service';
import { PortfolioModule } from '../portfolio/portfolio.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SwapOrders.name, schema: SwapOrderSchema },
      { name: ExhaustedOrder.name, schema: ExhaustedOrderSchema },
    ]),
    WalletModule,
    PortfolioModule,
  ],
  providers: [
    SwapOrderService,
    SwapOrderRepository,
    AllbridgePollerService,
    FirebaseNotificationService,
    EvmTxPollerService,
    RedisService,
    UniswapTxPollerService,
    NearIntentPollerService,
    NearIntentExhaustedReconcilerService,
  ],
  controllers: [SwapOrdersController],
  exports: [SwapOrderService, NearIntentPollerService],
})
export class SwapOrdersModule {}
