// Stellar StrKey account ID: 'G' + 55 base32-ish chars, optionally prefixed
// with a memo/federation tag ("MEMO-G..."). Mirrors the format already
// validated by MultiChainWalletAddressDto.
const STELLAR_ADDRESS_REGEX = /^G[A-Z0-9]{55}$/;
const STELLAR_FEDERATED_ADDRESS_REGEX = /^[A-Z0-9]{1,12}-G[A-Z0-9]{55}$/;

export function isStellarAddress(address: string): boolean {
  return STELLAR_ADDRESS_REGEX.test(address) || STELLAR_FEDERATED_ADDRESS_REGEX.test(address);
}

// EVM addresses are case-insensitive hex and safe to lowercase; Stellar
// addresses are case-sensitive, so lowercasing would turn them into a
// different, invalid address.
export function normalizeWalletAddress(address: string): string {
  if (!address) {
    return address;
  }
  if (isStellarAddress(address)) {
    return address;
  }
  return address.toLowerCase();
}
