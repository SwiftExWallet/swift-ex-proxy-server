import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { ChainId } from '../enums/chain.enum';
import { SwapQuoteDto } from './swapQuote.dto';

describe('SwapQuoteDto', () => {
  it('rejects client supplied token metadata under the global whitelist policy', async () => {
    const dto = plainToInstance(SwapQuoteDto, {
      tokenIn: {
        address: '0x1111111111111111111111111111111111111111',
        chainId: ChainId.ETH,
        symbol: 'FAKE',
        decimals: '1',
      },
      tokenOut: {
        address: '0x2222222222222222222222222222222222222222',
        chainId: ChainId.ETH,
        symbol: 'ALSO_FAKE',
        decimals: '99',
      },
      amount: '1',
      recipient: '0x3333333333333333333333333333333333333333',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    const messages = collectValidationMessages(errors);

    expect(messages).toEqual(
      expect.arrayContaining([
        'property symbol should not exist',
        'property decimals should not exist',
      ]),
    );
  });
});

function collectValidationMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...collectValidationMessages(error.children ?? []),
  ]);
}
