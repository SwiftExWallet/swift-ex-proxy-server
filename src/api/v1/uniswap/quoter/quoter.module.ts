import { Module } from '@nestjs/common';
import { QuoterController } from './quoter.controller';
import { QuoterService } from './quoter.service';
import { ProviderService } from '../../provider/provider.service';
import { SwapService } from './swaping/swap.service';


@Module({
  controllers: [QuoterController],
  providers: [QuoterService,ProviderService,SwapService],
  exports: [QuoterService],
})
export class QuoterModule { }