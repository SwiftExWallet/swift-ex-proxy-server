import { validateSync } from 'class-validator';
import { KeysFromEnum } from './keyFromEnum';

enum TestChain {
  eth = 'eth',
  bnb = 'bnb',
}

class WalletAddressesDto {
  @KeysFromEnum(TestChain)
  addresses: unknown;
}

describe('KeysFromEnum', () => {
  const validateAddresses = (addresses: unknown) => {
    const dto = new WalletAddressesDto();
    dto.addresses = addresses;
    return validateSync(dto);
  };

  it('accepts objects keyed by enum values', () => {
    expect(
      validateAddresses({
        eth: '0x1111111111111111111111111111111111111111',
        bnb: '0x2222222222222222222222222222222222222222',
      }),
    ).toHaveLength(0);
  });

  it('rejects non-object values and arrays', () => {
    expect(validateAddresses(undefined)).toHaveLength(1);
    expect(validateAddresses(null)).toHaveLength(1);
    expect(validateAddresses(['eth'])).toHaveLength(1);
  });

  it('rejects object keys outside the enum values', () => {
    expect(validateAddresses({ polygon: '0x' })).toHaveLength(1);
  });
});
