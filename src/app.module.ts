import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EthModule } from './api/v1/eth/eth.module';

@Module({
  imports: [EthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
