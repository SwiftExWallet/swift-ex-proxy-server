import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { BroadcastTransactionDto } from './api/v1/common/dto/broadcastTransaction.dto';
import { ExecuteSwapTransactionsDto } from './api/v1/eth/dto/executeSwapTransactions.dto';

class StrictValidationTestDto {
  @IsString()
  name: string;
}

describe('global validation settings', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: StrictValidationTestDto,
    data: '',
  };

  it('rejects properties that are not declared on the DTO', async () => {
    await expect(
      pipe.transform({ name: 'valid', role: 'admin' }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps valid DTO properties', async () => {
    await expect(pipe.transform({ name: 'valid' }, metadata)).resolves.toEqual({
      name: 'valid',
    });
  });

  it('rejects oversized signed transaction batches', async () => {
    await expect(
      pipe.transform(
        {
          signedTransactions: ['0x1', '0x2', '0x3', '0x4', '0x5', '0x6'],
          broadcastChain: 'ETH',
        },
        {
          type: 'body',
          metatype: BroadcastTransactionDto,
          data: '',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversized swap execution batches', async () => {
    await expect(
      pipe.transform(
        {
          txs: ['0x1', '0x2', '0x3', '0x4', '0x5', '0x6'],
          broadcastChain: 'ETH',
        },
        {
          type: 'body',
          metatype: ExecuteSwapTransactionsDto,
          data: '',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
