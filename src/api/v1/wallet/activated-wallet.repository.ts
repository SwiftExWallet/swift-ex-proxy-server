import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { ActivatedWallet } from './schema/activated-wallet.schema';
import { CreateActivatedWalletDto } from './dto/crete-activated-wallet.dto';

@Injectable()
export class ActivatedWalletRepository {
  constructor(
    @InjectModel(ActivatedWallet.name)
    private activatedWalletModel: Model<ActivatedWallet>,
  ) {}

  async create(
    createActivatedWalletDto: CreateActivatedWalletDto,
    session?: mongoose.ClientSession,
  ): Promise<ActivatedWallet> {
    const createdActivatedWallet = new this.activatedWalletModel(
      createActivatedWalletDto,
    );
    if (session) {
      return createdActivatedWallet.save({ session });
    }
    return createdActivatedWallet.save();
  }

  async findOne(cond: Record<string, any>): Promise<ActivatedWallet | null> {
    return await this.activatedWalletModel.findOne(cond);
  }
}
