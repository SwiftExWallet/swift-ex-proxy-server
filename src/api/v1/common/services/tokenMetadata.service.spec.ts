import { BadRequestException } from '@nestjs/common';
import { ZeroAddress } from 'ethers';
import { ChainId } from '../enums/chain.enum';
import { TokenMetadataService } from './tokenMetadata.service';

describe('TokenMetadataService', () => {
  let service: TokenMetadataService;

  beforeEach(() => {
    service = new TokenMetadataService({ getProvider: jest.fn() } as any);
  });

  it('adds native token metadata server-side', async () => {
    const normalized = await service.normalizeSwapQuote({
      tokenIn: {
        address: ZeroAddress,
        chainId: ChainId.ETH,
      },
      tokenOut: {
        address: ZeroAddress,
        chainId: ChainId.ETH,
      },
      amount: '1',
      recipient: '0x1234567890123456789012345678901234567890',
    });

    expect(normalized.tokenIn.symbol).toBe('ETH');
    expect(normalized.tokenIn.decimals).toBe('18');
    expect(normalized.tokenOut.symbol).toBe('ETH');
    expect(normalized.tokenOut.decimals).toBe('18');
  });

  it('adds ERC-20 metadata from server cache', async () => {
    const address = '0x1111111111111111111111111111111111111111';
    (service as any).cache.set(`${ChainId.ETH}:${address.toLowerCase()}`, {
      symbol: 'USDC',
      decimals: '6',
    });

    const token = await service.resolveToken({
      address,
      chainId: ChainId.ETH,
    });

    expect(token.symbol).toBe('USDC');
    expect(token.decimals).toBe('6');
  });

  it('ignores client supplied token metadata when resolving tokens', async () => {
    const address = '0x1111111111111111111111111111111111111111';
    (service as any).cache.set(`${ChainId.ETH}:${address.toLowerCase()}`, {
      symbol: 'USDC',
      decimals: '6',
    });

    const token = await service.resolveToken({
      address,
      chainId: ChainId.ETH,
      symbol: 'FAKE',
      decimals: '99',
    } as any);

    expect(token).toEqual({
      address,
      chainId: ChainId.ETH,
      symbol: 'USDC',
      decimals: '6',
    });
  });

  it('rejects unsupported token chains', async () => {
    await expect(
      service.resolveToken({
        address: ZeroAddress,
        chainId: 999999,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
