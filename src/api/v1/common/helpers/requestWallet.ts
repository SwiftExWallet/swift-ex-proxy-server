import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

export interface VerifiedRequestWallet {
  address: string;
  walletId?: string;
  chain?: string;
}

export function getVerifiedWalletAddress(req: any): string {
  const walletAddress = req?.wallet?.address;

  return assertVerifiedWalletAddress(walletAddress);
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
  verifiedWalletAddress: string,
  fieldName = 'walletAddress',
): void {
  if (
    clientWalletAddress &&
    !walletAddressesEqual(clientWalletAddress, verifiedWalletAddress)
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
  const verifiedWalletAddress = getVerifiedWalletAddress(req);
  return withExplicitVerifiedWalletAddress(
    dto,
    verifiedWalletAddress,
    fieldName,
  );
}

export function withExplicitVerifiedWalletAddress<
  T extends Record<string, any>,
>(
  dto: T,
  verifiedWalletAddress: string | undefined | null,
  fieldName = 'walletAddress',
): T {
  const walletAddress = assertVerifiedWalletAddress(verifiedWalletAddress);
  assertWalletAddressMatches(dto?.[fieldName], walletAddress, fieldName);

  return {
    ...dto,
    [fieldName]: walletAddress,
  };
}
