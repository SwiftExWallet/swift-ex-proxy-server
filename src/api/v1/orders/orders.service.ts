import { Injectable } from '@nestjs/common';
import { Order } from './schema/order.schema';
import { OrderRepository } from './order.repository';
import mongoose from 'mongoose';
import { UpdateOrderDto } from './dto/updateOrder.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly orderRepo: OrderRepository) {}

  findOne(_id: mongoose.Schema.Types.ObjectId): Promise<Order | null> {
    return this.orderRepo.findOne({ _id });
  }

  findOneByOrderNo(orderNo: string): Promise<Order | null> {
    return this.orderRepo.findOne({ orderNo });
  }

  update(
    _id: mongoose.Schema.Types.ObjectId,
    updateOrderDto: UpdateOrderDto,
  ): Promise<{ restored: number } | null> {
    return this.orderRepo.update(_id, updateOrderDto);
  }
}
