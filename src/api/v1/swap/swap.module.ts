import { Module } from '@nestjs/common';
import { InchModule } from './1inch/1inch.module';
import { UniswapModule } from './uniswap/uniswap.module';

@Module({
  imports: [InchModule, UniswapModule],
  exports: [InchModule, UniswapModule],
})
export class SwapModule {}
