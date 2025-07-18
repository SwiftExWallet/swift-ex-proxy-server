import { Module } from '@nestjs/common';
import { BscService } from './bsc.service';
import { BscController } from './bsc.controller';
import { ProviderModule } from '../provider/provider.module';

@Module({
  imports: [ProviderModule],
  providers: [BscService],
  controllers: [BscController],
})
export class BscModule {}
