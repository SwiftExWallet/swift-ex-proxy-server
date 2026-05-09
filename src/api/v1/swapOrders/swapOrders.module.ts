import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SwapOrders, SwapOrderSchema } from './schema/swapOrder.schema';
import { SwapOrderService } from './swapOrders.service';
import { SwapOrderRepository } from './swapOrder.repository';
import { SwapOrdersController } from './swapOrders.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SwapOrders.name, schema: SwapOrderSchema }]),
  ],
  providers: [SwapOrderService,SwapOrderRepository],
  controllers: [SwapOrdersController],
})
export class SwapOrdersModule {}
