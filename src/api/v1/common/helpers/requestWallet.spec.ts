import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  assertVerifiedWalletAddress,
  assertWalletAddressMatches,
  getVerifiedWalletAddress,
  walletAddressesEqual,
  withExplicitVerifiedWalletAddress,
  withVerifiedWalletAddress,
} from './requestWallet';

describe('requestWallet helpers', () => {
  const walletAddress = '0x1234567890123456789012345678901234567890';

  describe('getVerifiedWalletAddress', () => {
    it('returns the verified wallet address from the request', () => {
      expect(
        getVerifiedWalletAddress({
          wallet: { address: walletAddress },
        }),
      ).toBe(walletAddress);
    });

    it('rejects a missing wallet address', () => {
      expect(() => getVerifiedWalletAddress({})).toThrow(UnauthorizedException);
    });

    it('rejects a blank wallet address', () => {
      expect(() =>
        getVerifiedWalletAddress({ wallet: { address: '   ' } }),
      ).toThrow(UnauthorizedException);
    });
  });

  describe('assertVerifiedWalletAddress', () => {
    it('returns a present verified wallet address', () => {
      expect(assertVerifiedWalletAddress(walletAddress)).toBe(walletAddress);
    });

    it('rejects a missing verified wallet address', () => {
      expect(() => assertVerifiedWalletAddress(undefined)).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('walletAddressesEqual', () => {
    it('compares wallet addresses case-insensitively and trims whitespace', () => {
      expect(
        walletAddressesEqual(
          '  0x1234567890123456789012345678901234567890 ',
          '0X1234567890123456789012345678901234567890',
        ),
      ).toBe(true);
    });

    it('returns false when either wallet address is missing', () => {
      expect(walletAddressesEqual(undefined, walletAddress)).toBe(false);
      expect(walletAddressesEqual(walletAddress, null)).toBe(false);
    });

    it('returns false for different wallet addresses', () => {
      expect(
        walletAddressesEqual(
          walletAddress,
          '0x9999999999999999999999999999999999999999',
        ),
      ).toBe(false);
    });
  });

  describe('assertWalletAddressMatches', () => {
    it('allows an absent client wallet address', () => {
      expect(() =>
        assertWalletAddressMatches(undefined, walletAddress),
      ).not.toThrow();
    });

    it('allows a matching client wallet address', () => {
      expect(() =>
        assertWalletAddressMatches(
          '0X1234567890123456789012345678901234567890',
          walletAddress,
        ),
      ).not.toThrow();
    });

    it('rejects a mismatched client wallet address', () => {
      expect(() =>
        assertWalletAddressMatches(
          '0x9999999999999999999999999999999999999999',
          walletAddress,
          'recipient',
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('withVerifiedWalletAddress', () => {
    it('injects the verified wallet into the default walletAddress field', () => {
      const dto = { amount: '1' };

      expect(
        withVerifiedWalletAddress(dto, {
          wallet: { address: walletAddress },
        }),
      ).toEqual({
        amount: '1',
        walletAddress,
      });
    });

    it('injects the verified wallet into a custom field', () => {
      const dto = { amount: '1' };

      expect(
        withVerifiedWalletAddress(
          dto,
          { wallet: { address: walletAddress } },
          'recipient',
        ),
      ).toEqual({
        amount: '1',
        recipient: walletAddress,
      });
    });

    it('rejects when the DTO custom field does not match the verified wallet', () => {
      expect(() =>
        withVerifiedWalletAddress(
          {
            recipient: '0x9999999999999999999999999999999999999999',
          },
          { wallet: { address: walletAddress } },
          'recipient',
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('withExplicitVerifiedWalletAddress', () => {
    it('injects an explicit verified wallet into the requested field', () => {
      expect(
        withExplicitVerifiedWalletAddress(
          { amount: '1' },
          walletAddress,
          'recipient',
        ),
      ).toEqual({
        amount: '1',
        recipient: walletAddress,
      });
    });

    it('rejects when the DTO field does not match the explicit verified wallet', () => {
      expect(() =>
        withExplicitVerifiedWalletAddress(
          {
            recipient: '0x9999999999999999999999999999999999999999',
          },
          walletAddress,
          'recipient',
        ),
      ).toThrow(ForbiddenException);
    });
  });
});
