import { BadRequestException } from '@nestjs/common';
import { ZeroAddress } from 'ethers';
import { ChainId } from '../enums/chain.enum';
import { TokenMetadataService } from './tokenMetadata.service';

describe('TokenMetadataService', () => {
  let service: TokenMetadataService;

  beforeEach(() => {
    service = new TokenMetadataService({ getProvider: jest.fn() } as any);
  });

  it('overwrites client supplied native token metadata', async () => {
    const normalized = await service.normalizeSwapQuote({
      tokenIn: {
        address: ZeroAddress,
        symbol: 'FAKE',
        decimals: '6',
        chainId: ChainId.ETH,
      },
      tokenOut: {
        address: ZeroAddress,
        symbol: 'ALSO_FAKE',
        decimals: '0',
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

  it('overwrites client supplied ERC-20 metadata from server cache', async () => {
    const address = '0x1111111111111111111111111111111111111111';
    (service as any).cache.set(`${ChainId.ETH}:${address.toLowerCase()}`, {
      symbol: 'USDC',
      decimals: '6',
    });

    const token = await service.resolveToken({
      address,
      symbol: 'ETH',
      decimals: '18',
      chainId: ChainId.ETH,
    });

    expect(token.symbol).toBe('USDC');
    expect(token.decimals).toBe('6');
  });

  it('rejects unsupported token chains', async () => {
    await expect(
      service.resolveToken({
        address: ZeroAddress,
        symbol: 'SOL',
        decimals: '9',
        chainId: 999999,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
