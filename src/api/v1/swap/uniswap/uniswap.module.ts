import { Module } from '@nestjs/common';
import { ProviderModule } from '../../provider/provider.module';
import { UniswapService } from './uniswap.service';
import { UniswapController } from './uniswap.controller';
import { TokenMetadataService } from '../../common/services/tokenMetadata.service';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [ProviderModule, RedisModule],
  controllers: [UniswapController],
  providers: [UniswapService, TokenMetadataService],
  exports: [UniswapService],
})
export class UniswapModule {}
