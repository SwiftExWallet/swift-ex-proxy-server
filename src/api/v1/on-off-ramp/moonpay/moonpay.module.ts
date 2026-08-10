import { Module } from '@nestjs/common';
import { MoonPayController } from './moonpay.controller';
import { MoonPayService } from './moonpay.service';

@Module({
  controllers: [MoonPayController],
  providers: [MoonPayService],
  exports: [MoonPayService],
})
export class MoonPayModule {}
