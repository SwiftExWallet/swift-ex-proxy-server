import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import mongoose from 'mongoose';
import { SupportedWalletChain } from '../enums/chain.enum';
import { Wallet } from '../../wallet/schema/wallet.schema';
import {
  assertVerifiedWalletAddress,
  assertWalletAddressMatches,
  getVerifiedWalletAddressFromWallet,
  getVerifiedWalletAddress,
  resolveVerifiedWalletAddress,
  resolveWalletChain,
  walletContainsAddress,
  walletAddressesEqual,
  withExplicitVerifiedWalletAddress,
  withVerifiedWalletAddress,
} from './requestWallet';

describe('requestWallet helpers', () => {
  const walletAddress = '0x1234567890123456789012345678901234567890';
  const walletWithAddresses = (
    addresses: Map<SupportedWalletChain, string>,
  ): Wallet => ({
    _id: new mongoose.Types.ObjectId() as any,
    userId: new mongoose.Types.ObjectId() as any,
    deviceId: new mongoose.Types.ObjectId() as any,
    addresses,
    isPrimary: true,
  });

  describe('getVerifiedWalletAddress', () => {
    it('returns the verified wallet address from the request', () => {
      expect(
        getVerifiedWalletAddress({
          wallet: { addresses: { multi: walletAddress } },
        }),
      ).toBe(walletAddress);
    });

    it('returns the chain-specific wallet address from the request wallet addresses object', () => {
      expect(
        getVerifiedWalletAddress(
          {
            wallet: {
              addresses: {
                eth: '0x1111111111111111111111111111111111111111',
                bnb: '0x2222222222222222222222222222222222222222',
                multi: '0x3333333333333333333333333333333333333333',
              },
            },
          },
          SupportedWalletChain.eth,
        ),
      ).toBe('0x1111111111111111111111111111111111111111');
    });

    it('falls back to the multi wallet address when the chain-specific address is missing', () => {
      expect(
        getVerifiedWalletAddress(
          {
            wallet: {
              addresses: {
                multi: '0x3333333333333333333333333333333333333333',
              },
            },
          },
          SupportedWalletChain.bnb,
        ),
      ).toBe('0x3333333333333333333333333333333333333333');
    });

    it('reads chain-specific wallet addresses from mongoose map-style addresses', () => {
      expect(
        getVerifiedWalletAddress(
          {
            wallet: {
              addresses: new Map([
                [
                  SupportedWalletChain.eth,
                  '0x1111111111111111111111111111111111111111',
                ],
                [
                  SupportedWalletChain.bnb,
                  '0x2222222222222222222222222222222222222222',
                ],
              ]),
            },
          },
          SupportedWalletChain.bnb,
        ),
      ).toBe('0x2222222222222222222222222222222222222222');
    });

    it('reads chain-specific wallet addresses from map-like addresses', () => {
      expect(
        getVerifiedWalletAddressFromWallet(
          {
            addresses: {
              get: (chain: SupportedWalletChain) =>
                chain === SupportedWalletChain.bnb
                  ? '0x2222222222222222222222222222222222222222'
                  : undefined,
            },
          } as any,
          SupportedWalletChain.bnb,
        ),
      ).toBe('0x2222222222222222222222222222222222222222');
    });

    it('rejects a missing wallet address', () => {
      expect(() => getVerifiedWalletAddress({})).toThrow(UnauthorizedException);
    });

    it('rejects a blank wallet address', () => {
      expect(() =>
        getVerifiedWalletAddress({ wallet: { address: '   ' } }),
      ).toThrow(UnauthorizedException);
    });

    it('rejects a raw address string as verified wallet context', () => {
      expect(() =>
        getVerifiedWalletAddressFromWallet(walletAddress as any),
      ).toThrow(UnauthorizedException);
    });
  });

  describe('resolveVerifiedWalletAddress', () => {
    it('returns undefined for missing wallet context', () => {
      expect(resolveVerifiedWalletAddress(undefined)).toBeUndefined();
      expect(resolveVerifiedWalletAddress(null)).toBeUndefined();
    });
  });

  describe('resolveWalletChain', () => {
    it('returns undefined for missing or unsupported chains', () => {
      expect(resolveWalletChain(undefined)).toBeUndefined();
      expect(resolveWalletChain(null)).toBeUndefined();
      expect(resolveWalletChain('137')).toBeUndefined();
    });

    it('resolves ETH and BNB aliases', () => {
      expect(resolveWalletChain('1')).toBe(SupportedWalletChain.eth);
      expect(resolveWalletChain(' ETH ')).toBe(SupportedWalletChain.eth);
      expect(resolveWalletChain(56)).toBe(SupportedWalletChain.bnb);
      expect(resolveWalletChain('bnb')).toBe(SupportedWalletChain.bnb);
      expect(resolveWalletChain('bsc')).toBe(SupportedWalletChain.bnb);
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

  describe('walletContainsAddress', () => {
    it('returns false for missing wallet address input', () => {
      expect(
        walletContainsAddress(
          { addresses: { multi: walletAddress } } as any,
          undefined,
        ),
      ).toBe(false);
    });

    it('checks map-like wallet address values', () => {
      expect(
        walletContainsAddress(
          {
            addresses: {
              values: () =>
                ['0x9999999999999999999999999999999999999999', walletAddress][
                  Symbol.iterator
                ](),
            },
          } as any,
          walletAddress.toUpperCase(),
        ),
      ).toBe(true);
    });

    it('checks plain wallet address objects and ignores non-string values', () => {
      expect(
        walletContainsAddress(
          {
            addresses: {
              eth: undefined,
              multi: walletAddress,
              extra: 123,
            },
          } as any,
          walletAddress,
        ),
      ).toBe(true);
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
          wallet: { addresses: { multi: walletAddress } },
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
          { wallet: { addresses: { multi: walletAddress } } },
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
          { wallet: { addresses: { multi: walletAddress } } },
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
          walletWithAddresses(
            new Map([[SupportedWalletChain.multi, walletAddress]]),
          ),
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
          walletWithAddresses(
            new Map([[SupportedWalletChain.multi, walletAddress]]),
          ),
          'recipient',
        ),
      ).toThrow(ForbiddenException);
    });
  });
});
