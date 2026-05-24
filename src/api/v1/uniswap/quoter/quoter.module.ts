import { Module } from '@nestjs/common';
import { QuoterController } from './quoter.controller';
import { QuoterService } from './quoter.service';
import { ProviderService } from '../../provider/provider.service'; import { SwapProviderResolver } from './swaping/swap-provider.resolver';
import { SwapOrdersModule } from '../../swapOrders/swapOrders.module';
import { RedisModule } from '../../redis/redis.module';
import { InchModule } from '../../swap/1inch/1inch.module';
import { RangoModule } from '../../swap/rango/rango.module';


@Module({
  imports: [SwapOrdersModule, RedisModule, InchModule, RangoModule],
  controllers: [QuoterController],
  providers: [QuoterService, ProviderService, SwapProviderResolver],
  exports: [QuoterService],
})
export class QuoterModule { }