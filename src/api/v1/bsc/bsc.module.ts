import { Module } from '@nestjs/common';
import { BscService } from './bsc.service';
import { BscController } from './bsc.controller';
import { ProviderModule } from '../provider/provider.module';
import { PancakeSwapService } from './pancake/bsc.pancake.service';

@Module({
  imports: [ProviderModule],
  providers: [BscService,PancakeSwapService],
  controllers: [BscController],
})
export class BscModule {}
