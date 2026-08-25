import { Module } from '@nestjs/common';
import { ProviderModule } from '../provider/provider.module';
import { QuoterModule } from '../quoter/quoter.module';
import { UniswapModule } from '../swap/uniswap/uniswap.module';
import { EvmController } from './evm.controller';
import { EvmService } from './evm.service';

@Module({
  imports: [ProviderModule, QuoterModule, UniswapModule],
  providers: [EvmService],
  controllers: [EvmController],
})
export class EvmModule {}
