import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { User } from './schema/user.schema';
import mongoose from 'mongoose';

@Injectable()
export class UsersService {
  constructor(private readonly userRepo: UserRepository) {}

  findOne(_id: mongoose.Schema.Types.ObjectId): Promise<User | null> {
    return this.userRepo.findOne({ _id });
  }
}
