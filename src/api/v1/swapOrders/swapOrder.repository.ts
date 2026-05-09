import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { SwapOrders } from './schema/swapOrder.schema';
import { UpdateSwapOrderStatusDto } from './dto/updateOrder.dto';


@Injectable()
export class SwapOrderRepository {
  constructor(
    @InjectModel(SwapOrders.name)
    private orderModel: Model<SwapOrders>,
  ) { }

  async findOne(cond: Record<string, any>): Promise<SwapOrders | null> {
    return await this.orderModel.findOne(cond);
  }

  update(
    _id: mongoose.Schema.Types.ObjectId,
    object: UpdateSwapOrderStatusDto,
  ): Promise<{ restored: number } | null> {
    return this.orderModel.findByIdAndUpdate({ _id }, object);
  }
}
