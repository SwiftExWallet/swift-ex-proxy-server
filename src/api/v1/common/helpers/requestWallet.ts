import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Wallet as WalletDocument } from '../../wallet/schema/wallet.schema';
import { SupportedWalletChain } from '../enums/chain.enum';

type WalletAddressEntries =
  | Map<string, string>
  | Record<string, string | undefined>
  | {
      get?: (key: string) => string | undefined;
      values?: () => IterableIterator<string>;
    };

export type Wallet = WalletDocument;

export function getVerifiedWalletAddress(
  req: any,
  chain?: SupportedWalletChain,
): string {
  const walletAddress = resolveVerifiedWalletAddress(req?.wallet, chain);

  return assertVerifiedWalletAddress(walletAddress);
}

export function getVerifiedWalletAddressFromWallet(
  wallet: Wallet,
  chain?: SupportedWalletChain,
): string {
  return assertVerifiedWalletAddress(
    resolveVerifiedWalletAddress(wallet, chain),
  );
}

export function resolveVerifiedWalletAddress(
  wallet: Wallet | undefined | null,
  chain?: SupportedWalletChain,
): string | undefined {
  if (!wallet) {
    return undefined;
  }

  if (chain) {
    const chainAddress = getAddressForChain(wallet.addresses, chain);
    if (chainAddress) {
      return chainAddress;
    }
  }
  return getAddressForChain(wallet.addresses, SupportedWalletChain.multi);
}

export function resolveWalletChain(
  chain?: string | number | null,
): SupportedWalletChain | undefined {
  if (chain === undefined || chain === null) {
    return undefined;
  }

  const normalized = String(chain).trim().toLowerCase();

  if (normalized === '1' || normalized === 'eth') {
    return SupportedWalletChain.eth;
  }

  if (normalized === '56' || normalized === 'bnb' || normalized === 'bsc') {
    return SupportedWalletChain.bnb;
  }

  return undefined;
}

export function walletContainsAddress(
  wallet: Wallet,
  walletAddress: string | undefined | null,
): boolean {
  if (!walletAddress) {
    return false;
  }

  return getWalletAddressValues(wallet).some((address) =>
    walletAddressesEqual(address, walletAddress),
  );
}

function getWalletAddressValues(wallet: Wallet): string[] {
  const addresses = wallet.addresses as WalletAddressEntries | undefined;
  const values: string[] = [];

  if (addresses) {
    if (addresses instanceof Map) {
      values.push(...Array.from(addresses.values()));
    } else if (typeof addresses.values === 'function') {
      values.push(...Array.from(addresses.values()));
    } else {
      values.push(
        ...Object.values(addresses).filter(
          (address): address is string => typeof address === 'string',
        ),
      );
    }
  }

  return values;
}

function getAddressForChain(
  addresses: WalletAddressEntries | undefined,
  chain: SupportedWalletChain,
): string | undefined {
  if (!addresses) {
    return undefined;
  }

  if (addresses instanceof Map) {
    return addresses.get(chain);
  }

  if (typeof addresses.get === 'function') {
    return addresses.get(chain);
  }

  return addresses[chain];
}

export function assertVerifiedWalletAddress(
  walletAddress: string | undefined | null,
): string {
  if (typeof walletAddress !== 'string' || !walletAddress.trim()) {
    throw new UnauthorizedException('Verified wallet address not found.');
  }

  return walletAddress;
}

export function walletAddressesEqual(
  first?: string | null,
  second?: string | null,
): boolean {
  if (!first || !second) {
    return false;
  }

  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

export function assertWalletAddressMatches(
  clientWalletAddress: string | undefined | null,
  verifiedAddress: string,
  fieldName = 'walletAddress',
): void {
  if (
    clientWalletAddress &&
    !walletAddressesEqual(clientWalletAddress, verifiedAddress)
  ) {
    throw new ForbiddenException(
      `${fieldName} does not match the verified wallet address.`,
    );
  }
}

export function withVerifiedWalletAddress<T extends Record<string, any>>(
  dto: T,
  req: any,
  fieldName = 'walletAddress',
): T {
  return withExplicitVerifiedWalletAddress(dto, req?.wallet, fieldName);
}

export function withExplicitVerifiedWalletAddress<
  T extends Record<string, any>,
>(
  dto: T,
  verifiedWallet: Wallet,
  fieldName = 'walletAddress',
  chain?: SupportedWalletChain,
): T {
  const walletAddress = getVerifiedWalletAddressFromWallet(
    verifiedWallet,
    chain,
  );
  assertWalletAddressMatches(dto?.[fieldName], walletAddress, fieldName);

  return {
    ...dto,
    [fieldName]: walletAddress,
  };
}
