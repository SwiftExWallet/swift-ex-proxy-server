import { validate } from 'class-validator';
import { ValidWalletType } from '../enums/wallet-type.enum';
import { IsTokenValid, validations_token } from './valid-token.decorator';

describe('valid-token decorator', () => {
  let validator: validations_token;

  const validationArgs = (
    sourceChain: string,
    property: 'sourceToken' | 'destinationToken',
    destinationChain = 'ETH',
  ) =>
    ({
      object: {
        sourceChain,
        destinationChain,
      },
      property,
    }) as any;

  beforeEach(() => {
    validator = new validations_token();
  });

  describe('validations_token.validate', () => {
    it('allows only USDC for Base source and destination tokens', () => {
      expect(
        validator.validate(
          'USDC',
          validationArgs(ValidWalletType.BAS, 'sourceToken'),
        ),
      ).toBe(true);
      expect(
        validator.validate(
          'USDT',
          validationArgs(ValidWalletType.BAS, 'sourceToken'),
        ),
      ).toBe(false);
      expect(
        validator.validate(
          'USDC',
          validationArgs(ValidWalletType.BAS, 'destinationToken'),
        ),
      ).toBe(true);
    });

    it('allows USDT, USDC, and USDe for ETH and ARB chains', () => {
      for (const chain of [ValidWalletType.ETH, ValidWalletType.ARB]) {
        for (const token of ['USDT', 'USDC', 'USDe']) {
          expect(
            validator.validate(token, validationArgs(chain, 'sourceToken')),
          ).toBe(true);
          expect(
            validator.validate(
              token,
              validationArgs(chain, 'destinationToken'),
            ),
          ).toBe(true);
        }

        expect(
          validator.validate('DAI', validationArgs(chain, 'sourceToken')),
        ).toBe(false);
      }
    });

    it('allows USDT and USDC for BNB and BSC chains', () => {
      for (const chain of [ValidWalletType.BNB, ValidWalletType.BSC]) {
        expect(
          validator.validate('USDT', validationArgs(chain, 'sourceToken')),
        ).toBe(true);
        expect(
          validator.validate('USDC', validationArgs(chain, 'sourceToken')),
        ).toBe(true);
        expect(
          validator.validate('USDe', validationArgs(chain, 'sourceToken')),
        ).toBe(false);
      }
    });

    it('allows USDT and USDC for POL, OPT, and AVA chains', () => {
      for (const chain of [
        ValidWalletType.POL,
        ValidWalletType.OPT,
        ValidWalletType.AVA,
      ]) {
        expect(
          validator.validate('USDT', validationArgs(chain, 'sourceToken')),
        ).toBe(true);
        expect(
          validator.validate('USDC', validationArgs(chain, 'destinationToken')),
        ).toBe(true);
        expect(
          validator.validate('USDe', validationArgs(chain, 'sourceToken')),
        ).toBe(false);
      }
    });

    it('rejects unsupported source chains', () => {
      expect(
        validator.validate(
          'USDC',
          validationArgs(ValidWalletType.SRB, 'sourceToken'),
        ),
      ).toBe(false);
      expect(
        validator.validate('USDC', validationArgs('UNKNOWN', 'sourceToken')),
      ).toBe(false);
    });
  });

  describe('validations_token.defaultMessage', () => {
    it('returns a source token message for invalid sourceToken', () => {
      expect(
        validator.defaultMessage(
          validationArgs(ValidWalletType.ETH, 'sourceToken'),
        ),
      ).toBe('Source Token not support for ETH.');
    });

    it('returns a destination token message for invalid destinationToken', () => {
      expect(
        validator.defaultMessage(
          validationArgs(ValidWalletType.ETH, 'destinationToken', 'BSC'),
        ),
      ).toBe('Destination Token not support for BSC.');
    });

    it('returns the fallback message for invalid chain values', () => {
      expect(
        validator.defaultMessage({
          object: { sourceChain: 'UNKNOWN', destinationChain: 'UNKNOWN' },
          property: 'token',
        } as any),
      ).toBe('Invalid token.');
    });
  });

  describe('IsTokenValid integration', () => {
    class TokenDto {
      sourceChain: string;
      destinationChain: string;

      @IsTokenValid()
      sourceToken: string;

      @IsTokenValid()
      destinationToken: string;
    }

    const createDto = (overrides: Partial<TokenDto> = {}) => {
      const dto = new TokenDto();
      dto.sourceChain = ValidWalletType.ETH;
      dto.destinationChain = ValidWalletType.BSC;
      dto.sourceToken = 'USDC';
      dto.destinationToken = 'USDT';

      return Object.assign(dto, overrides);
    };

    it('validates supported token combinations through class-validator', async () => {
      await expect(validate(createDto())).resolves.toHaveLength(0);
    });

    it('rejects unsupported source tokens through class-validator', async () => {
      const errors = await validate(
        createDto({
          sourceChain: ValidWalletType.BAS,
          sourceToken: 'USDT',
          destinationToken: 'USDC',
        }),
      );

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('sourceToken');
      expect(errors[0].constraints).toEqual({
        validations_token: 'Source Token not support for BAS.',
      });
    });

    it('uses custom validation options through class-validator', async () => {
      class CustomMessageDto {
        sourceChain = ValidWalletType.BAS;

        @IsTokenValid({ message: 'unsupported token for chain' })
        sourceToken = 'USDT';
      }

      const errors = await validate(new CustomMessageDto());

      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toEqual({
        validations_token: 'unsupported token for chain',
      });
    });
  });
});
