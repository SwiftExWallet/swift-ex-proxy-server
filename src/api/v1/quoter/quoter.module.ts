import { Module } from '@nestjs/common';
import { QuoterController } from './quoter.controller';
import { QuoterService } from './quoter.service';
import { SwapProviderResolver } from './dto/swap-provider.resolver';
import { RedisModule } from '../redis/redis.module';
import { TokenMetadataService } from '../common/services/tokenMetadata.service';
import { SwapModule } from '../swap/swap.module';
import { ProviderModule } from '../provider/provider.module';

@Module({
  imports: [SwapModule, ProviderModule, RedisModule],
  controllers: [QuoterController],
  providers: [QuoterService, SwapProviderResolver, TokenMetadataService],
  exports: [QuoterService],
})
export class QuoterModule {}
