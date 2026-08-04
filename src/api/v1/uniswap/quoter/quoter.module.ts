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
import { PortfolioModule } from '../../portfolio/portfolio.module';


@Module({
  imports: [
    SwapOrdersModule,
    RedisModule,
    NotificationModule,
    PortfolioModule,
  ],
  controllers: [QuoterController],
  providers: [QuoterService,ProviderService,InchService,RangoService,SwapProviderResolver],
  exports: [QuoterService],
})
export class QuoterModule { }