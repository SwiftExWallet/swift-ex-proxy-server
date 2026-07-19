import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SwapOrders, SwapOrderSchema } from './schema/swapOrder.schema';
import { SwapOrderService } from './swapOrders.service';
import { SwapOrderRepository } from './swapOrder.repository';
import { SwapOrdersController } from './swapOrders.controller';
import { AllbridgePollerService } from '../crons/allbridgePoller.service';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { EvmTxPollerService } from '../crons/evmTxPoller.service';
import { RedisService } from '../redis/redis.service';
import { UniswapTxPollerService } from '../crons/uniswapTxPoller.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SwapOrders.name, schema: SwapOrderSchema }]),
    WalletModule,
  ],
  providers: [
    SwapOrderService,
    SwapOrderRepository,
    AllbridgePollerService,
    FirebaseNotificationService,
    EvmTxPollerService,
    RedisService,
    UniswapTxPollerService
  ],
  controllers: [SwapOrdersController],
  exports: [SwapOrderService],
})
export class SwapOrdersModule {}
