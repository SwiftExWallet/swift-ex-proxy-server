import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Portfolio, PortfolioSchema } from './schema/portfolio.schema';
import { PortfolioService } from './portfolio.service';
import { PortfolioRepository } from './portfolio.repository';
import { PortfolioMapper } from './portfolio.mapper';
import { PortfolioController } from './portfolio.controller';
import { AlchemyModule } from '../on-off-ramp/alchemy/alchemy.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Portfolio.name, schema: PortfolioSchema },
    ]),
    AlchemyModule,
  ],
  controllers: [PortfolioController],
  providers: [PortfolioService, PortfolioRepository, PortfolioMapper],
  exports: [PortfolioService],
})
export class PortfolioModule {}
