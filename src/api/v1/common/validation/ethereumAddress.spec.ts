import { validate } from 'class-validator';
import { ValidateEthereumAddresses } from './ethereumAddress';

describe('ValidateEthereumAddresses', () => {
  class TestDto {
    @ValidateEthereumAddresses()
    addresses: unknown;
  }

  class TestDtoWithMessage {
    @ValidateEthereumAddresses({
      message: 'addresses must be valid Ethereum addresses',
    })
    addresses: unknown;
  }

  const validateAddresses = async (addresses: unknown) => {
    const dto = new TestDto();
    dto.addresses = addresses;

    return validate(dto);
  };

  it('allows a valid single Ethereum address', async () => {
    await expect(
      validateAddresses('0x1234567890123456789012345678901234567890'),
    ).resolves.toHaveLength(0);
  });

  it('rejects an invalid single string', async () => {
    const errors = await validateAddresses('not-an-address');

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('addresses');
  });

  it('allows an array of valid Ethereum addresses', async () => {
    await expect(
      validateAddresses([
        '0x1234567890123456789012345678901234567890',
        '0x0000000000000000000000000000000000000001',
      ]),
    ).resolves.toHaveLength(0);
  });

  it('rejects an array when any address is invalid', async () => {
    const errors = await validateAddresses([
      '0x1234567890123456789012345678901234567890',
      'invalid-address',
    ]);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('addresses');
  });

  it('rejects non-string and non-array values', async () => {
    await expect(validateAddresses(123)).resolves.toHaveLength(1);
    await expect(
      validateAddresses({ address: '0x1234' }),
    ).resolves.toHaveLength(1);
    await expect(validateAddresses(null)).resolves.toHaveLength(1);
  });

  it('allows an empty array with the current every() behavior', async () => {
    await expect(validateAddresses([])).resolves.toHaveLength(0);
  });

  it('uses a custom validation message when provided', async () => {
    const dto = new TestDtoWithMessage();
    dto.addresses = 'not-an-address';

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual({
      ValidateEthereumAddresses: 'addresses must be valid Ethereum addresses',
    });
  });
});
