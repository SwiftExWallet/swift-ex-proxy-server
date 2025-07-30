import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { Order } from './schema/order.schema';
import { UpdateOrderDto } from './dto/updateOrder.dto';

@Injectable()
export class OrderRepository {
  constructor(
    @InjectModel(Order.name)
    private orderModel: Model<Order>,
  ) {}

  async findOne(cond: Record<string, any>): Promise<Order | null> {
    return await this.orderModel.findOne(cond);
  }

  update(
    _id: mongoose.Schema.Types.ObjectId,
    object: UpdateOrderDto,
  ): Promise<{ restored: number } | null> {
    return this.orderModel.findByIdAndUpdate({ _id }, object);
  }
}
