import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Wallet as WalletDocument } from '../../wallet/schema/wallet.schema';
import { SupportedWalletChain } from '../enums/chain.enum';

export type WalletAddressEntries =
  | Map<string, string>
  | Record<string, string | undefined>
  | {
      get?: (key: string) => string | undefined;
      values?: () => IterableIterator<string>;
    };

export type RequestWallet = {
  [SupportedWalletChain.multi]?: string;
  [SupportedWalletChain.xlm]?: string;
};

type WalletWithAddressEntries = {
  addresses?: WalletAddressEntries;
  address?: string;
};

export type Wallet = WalletDocument | RequestWallet | WalletWithAddressEntries;
type RequestWithWallet = { wallet?: Wallet | null };

export function getVerifiedWalletAddress(
  req: RequestWithWallet | null | undefined,
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

  return getAddressForChain(
    getWalletAddressEntries(wallet),
    resolveWalletAddressChain(chain),
  );
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

  if (
    normalized === 'xlm' ||
    normalized === 'stellar' ||
    normalized === 'srb'
  ) {
    return SupportedWalletChain.xlm;
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
  const addresses = getWalletAddressEntries(wallet);
  const values: string[] = [];

  if (addresses) {
    if (addresses instanceof Map) {
      values.push(...filterWalletAddressValues(addresses.values()));
    } else if (typeof addresses.values === 'function') {
      values.push(...filterWalletAddressValues(addresses.values()));
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

function getWalletAddressEntries(
  wallet: Wallet,
): WalletAddressEntries | undefined {
  if (typeof wallet !== 'object' || wallet === null) {
    return undefined;
  }

  if ('addresses' in wallet) {
    return wallet.addresses as WalletAddressEntries | undefined;
  }

  const requestWallet = wallet as RequestWallet;

  return {
    [SupportedWalletChain.multi]: requestWallet[SupportedWalletChain.multi],
    [SupportedWalletChain.xlm]: requestWallet[SupportedWalletChain.xlm],
  };
}

function resolveWalletAddressChain(
  chain?: SupportedWalletChain,
): SupportedWalletChain {
  return chain === SupportedWalletChain.xlm
    ? SupportedWalletChain.xlm
    : SupportedWalletChain.multi;
}

function filterWalletAddressValues(
  values: Iterable<string | undefined>,
): string[] {
  return Array.from(values).filter(
    (address): address is string => typeof address === 'string',
  );
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

  return (addresses as Record<string, string | undefined>)[chain];
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
  req: RequestWithWallet | null | undefined,
  fieldName = 'walletAddress',
): T {
  const verifiedWallet = req?.wallet;

  if (!verifiedWallet) {
    throw new UnauthorizedException('Verified wallet address not found.');
  }

  return withExplicitVerifiedWalletAddress(dto, verifiedWallet, fieldName);
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
  if (fieldName !== 'walletAddress') {
    assertWalletAddressMatches(dto?.[fieldName], walletAddress, fieldName);
  }

  return {
    ...dto,
    [fieldName]: walletAddress,
  };
}
