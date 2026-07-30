import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuoterController } from './quoter.controller';
import { QuoterService } from './quoter.service';
import { ProviderService } from '../../provider/provider.service';
import { InchService } from '../../swap/1inch/1inch.service';
import { RangoService } from '../../swap/rango/rango.service';
import { SwapProviderResolver } from './dto/swap-provider.resolver';
import { SwapOrdersModule } from '../../swapOrders/swapOrders.module';
import { RedisModule } from '../../redis/redis.module';
import { NotificationModule } from '../../notification/notification.module';
import { ExhaustedOrder, ExhaustedOrderSchema } from '../../swapOrders/schema/exhaustedOrder.schema';


@Module({
  imports: [
    SwapOrdersModule,
    RedisModule,
    NotificationModule,
    MongooseModule.forFeature([{ name: ExhaustedOrder.name, schema: ExhaustedOrderSchema }]),
  ],
  controllers: [QuoterController],
  providers: [QuoterService,ProviderService,InchService,RangoService,SwapProviderResolver],
  exports: [QuoterService],
})
export class QuoterModule { }