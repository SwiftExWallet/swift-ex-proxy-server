import { Module } from '@nestjs/common';
import { inchController } from './1inch.controller';
import { InchService } from './1inch.service';
import { SwapOrdersModule } from '../../swapOrders/swapOrders.module';
import { RedisModule } from '../../redis/redis.module';
import { InchWsPollerService } from './inchWsPoller.service';
import { InchFusionPlusWsPollerService } from './inchFusionPlusWsPoller.service';

@Module({
  imports: [
    SwapOrdersModule,
    RedisModule,
  ],
  providers: [
    InchService,
    InchWsPollerService,
    InchFusionPlusWsPollerService,
  ],
  controllers: [inchController],
  exports: [
    InchService,
    InchWsPollerService,
    InchFusionPlusWsPollerService,
  ],
})
export class InchModule { }
