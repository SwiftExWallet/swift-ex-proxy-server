import { BadRequestException } from '@nestjs/common';
import { parseUnits } from 'ethers';

export function calculateCircleMaxFee(
  amount: bigint,
  minimumFee: string,
  fast: boolean,
): bigint {
  const scaledRate = parseUnits(minimumFee, 6);
  const denominator = 10_000n * 1_000_000n * 100n;
  let maxFee = (amount * scaledRate * 120n + denominator - 1n) / denominator;
  // The deployed EVM bridge routers require a non-zero maxFee even for
  // standard (finality 2000) transfers where Circle reports zero fee.
  if (maxFee < 1n) maxFee = 1n;
  if (fast && maxFee < 1000n) maxFee = 1000n;
  return maxFee;
}

export function calculateBridgeQuote(
  amount: bigint,
  feeBps: bigint,
  circleMinimumFee: string,
  fast: boolean,
) {
  const protocolFee = (amount * feeBps) / 10_000n;
  const maxFee = calculateCircleMaxFee(amount, circleMinimumFee, fast);
  const minimumReceived = amount - protocolFee - maxFee;
  if (minimumReceived <= 0n) {
    throw new BadRequestException('Amount is too small to cover bridge fees.');
  }
  return { protocolFee, maxFee, minimumReceived };
}

export function calculateReverseBridgeQuote(
  amount: bigint,
  feeBps: bigint,
  circleMinimumFee: string,
) {
  const protocolFee = (amount * feeBps) / 10_000n;
  const netAmount = amount - protocolFee;
  const maxFee = calculateCircleMaxFee(netAmount, circleMinimumFee, false);
  const minimumReceived = netAmount - maxFee;
  if (netAmount <= 0n || minimumReceived <= 0n) {
    throw new BadRequestException('Amount is too small to cover bridge fees.');
  }
  return { protocolFee, netAmount, maxFee, minimumReceived };
}
