import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { Wallet } from './schema/wallet.schema';
import { CreateWalletDto } from './dto/create-wallet.dto';

@Injectable()
export class WalletRepository {
  private readonly logger = new Logger(WalletRepository.name);
  constructor(
    @InjectModel(Wallet.name)
    private walletModel: Model<Wallet>,
  ) {}

  async create(
    createWalletDto: CreateWalletDto,
    session?: mongoose.ClientSession,
  ): Promise<Wallet> {
    this.logger.log('createWalletDtoRepo', createWalletDto);

    const createdWallet = new this.walletModel(createWalletDto);
    if (session) {
      return createdWallet.save({ session });
    }
    return createdWallet.save();
  }

  async findOne(cond: Record<string, any>): Promise<Wallet | null> {
    return await this.walletModel.findOne(cond);
  }

  async find(cond: Record<string, any>): Promise<Wallet[] | null> {
    return await this.walletModel.find(cond);
  }

  assignUser(
    _id: mongoose.Schema.Types.ObjectId,
    userId: mongoose.Schema.Types.ObjectId,
    session?: mongoose.ClientSession,
  ): Promise<Wallet | null> {
    return this.walletModel.findByIdAndUpdate(
      { _id },
      { $set: { userId } },
      { session },
    );
  }

  delete(
    _id: mongoose.Schema.Types.ObjectId,
    session?: mongoose.ClientSession,
  ): Promise<Wallet | null> {
    return this.walletModel.findByIdAndDelete({ _id }, { session });
  }

  updateStreamId(
    _id: mongoose.Schema.Types.ObjectId,
    streamId: string,
  ): Promise<Wallet | null> {
    return this.walletModel.findByIdAndUpdate({ _id }, { $set: { streamId } });
  }
}
