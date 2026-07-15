import { Module } from '@nestjs/common';
import { EthService } from './eth.service';
import { EthController } from './eth.controller';
import { UsdtController } from './usdt.controller';
import { ProviderModule } from '../provider/provider.module';
import { UniSwapService } from './uniSwap/eth.uniswap.service';
import { EthTestnetSwapService } from './eth.testnet.service';
import { TokenMetadataService } from '../common/services/tokenMetadata.service';

@Module({
  imports: [ProviderModule],
  providers: [EthService,UniSwapService,EthTestnetSwapService,TokenMetadataService],
  controllers: [EthController, UsdtController],
})
export class EthModule {}
