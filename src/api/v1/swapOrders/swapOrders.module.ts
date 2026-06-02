import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SwapOrders, SwapOrderSchema } from './schema/swapOrder.schema';
import { SwapOrderService } from './swapOrders.service';
import { SwapOrderRepository } from './swapOrder.repository';
import { SwapOrdersController } from './swapOrders.controller';
import { RangoPollerService } from '../crons/rangoPoller.service';
import { AllbridgePollerService } from '../crons/allbridgePoller.service';
import { InchWsPollerService } from '../crons/inchWsPoller.service';
import { RangoService } from '../swap/rango/rango.service';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { EvmTxPollerService } from '../crons/evmTxPoller.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SwapOrders.name, schema: SwapOrderSchema }]),
  ],
  providers: [
    SwapOrderService,
    SwapOrderRepository,
    RangoPollerService,
    AllbridgePollerService,
    InchWsPollerService,
    RangoService,
    FirebaseNotificationService,
    EvmTxPollerService
  ],
  controllers: [SwapOrdersController],
  exports: [SwapOrderService, InchWsPollerService],
})
export class SwapOrdersModule {}
