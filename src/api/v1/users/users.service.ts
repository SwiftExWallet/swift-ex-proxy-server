import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { User } from './schema/user.schema';

@Injectable()
export class UsersService {
  constructor(private readonly userRepo: UserRepository) {}

  findOne(cond: any): Promise<User | null> {
    return this.userRepo.findOne(cond);
  }
}
