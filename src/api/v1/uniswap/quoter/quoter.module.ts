import { Module } from '@nestjs/common';
import { QuoterController } from './quoter.controller';
import { QuoterService } from './quoter.service';
import { ProviderService } from '../../provider/provider.service';
import { InchService } from '../../swap/1inch/1inch.service';
import { RangoService } from '../../swap/rango/rango.service';
import { SwapProviderResolver } from './dto/swap-provider.resolver';


@Module({
  controllers: [QuoterController],
  providers: [QuoterService,ProviderService,InchService,RangoService,SwapProviderResolver],
  exports: [QuoterService],
})
export class QuoterModule { }