import { Module } from '@nestjs/common';
import { EthService } from './eth.service';
import { EthController } from './eth.controller';
import { UsdtController } from './usdt.controller';
import { ProviderModule } from '../provider/provider.module';

@Module({
  imports: [ProviderModule],
  providers: [EthService],
  controllers: [EthController, UsdtController],
})
export class EthModule {}
