import { Module } from '@nestjs/common';
import { QuoterController } from './quoter.controller';
import { QuoterService } from './quoter.service';
import { ProviderService } from '../../provider/provider.service';
import { InchService } from '../../swap/1inch/1inch.service';
import { RangoService } from '../../swap/rango/rango.service';
import { SwapProviderResolver } from './dto/swap-provider.resolver';
import { SwapOrdersModule } from '../../swapOrders/swapOrders.module';
import { RedisModule } from '../../redis/redis.module';
import { NotificationModule } from '../../notification/notification.module';
import { TokenMetadataService } from '../../common/services/tokenMetadata.service';


@Module({
  imports: [SwapOrdersModule,RedisModule,NotificationModule],
  controllers: [QuoterController],
  providers: [QuoterService,ProviderService,InchService,RangoService,SwapProviderResolver,TokenMetadataService],
  exports: [QuoterService],
})
export class QuoterModule { }
