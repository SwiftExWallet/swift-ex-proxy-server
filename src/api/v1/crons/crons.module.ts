import { Module } from '@nestjs/common';
import { RangoPollerService } from './rangoPoller.service';
import { AllbridgePollerService } from './allbridgePoller.service';
import { SwapOrdersModule } from '../swapOrders/swapOrders.module';
import { RangoModule } from '../swap/rango/rango.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    SwapOrdersModule,
    RangoModule,
    NotificationModule,
  ],
  providers: [
    RangoPollerService,
    AllbridgePollerService,
  ],
  exports: [
    RangoPollerService,
    AllbridgePollerService,
  ],
})
export class CronsModule {}
