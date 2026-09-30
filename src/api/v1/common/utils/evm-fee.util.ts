export function bumpEvmFee(
  fee: bigint | { toString(): string } | null | undefined,
): bigint | null {
  if (fee == null) return null;
  return (BigInt(fee.toString()) * 120n + 99n) / 100n;
}
