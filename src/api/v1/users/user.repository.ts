import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './schema/user.schema';

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
  ) {}

  async findOne(cond: Record<string, any>): Promise<User | null> {
    return await this.userModel.findOne(cond);
  }

  findOneWithPassword(cond: Record<string, any>): Promise<User | null> {
    return this.userModel.findOne(cond).select('+password');
  }
}
