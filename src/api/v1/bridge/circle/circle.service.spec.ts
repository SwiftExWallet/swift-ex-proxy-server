import { ConfigService } from '@nestjs/config';
import { CircleService } from './circle.service';

describe('Circle bridge API', () => {
  const service = new CircleService(
    new ConfigService({
      blockchain: {
        circle: {
          irisUrl: 'https://circle.invalid',
          sourceDomain: 0,
          destinationDomain: 27,
        },
      },
    }),
  );
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });
  it('queries Stellar domain 27 with an unprefixed transaction hash', async () => {
    global.fetch = jest.fn().mockResolvedValue(Response.json({ messages: [] }));
    await service.getStellarAttestation('0X' + 'AB'.repeat(32));
    expect(global.fetch).toHaveBeenCalledWith(
      'https://circle.invalid/v2/messages/27?transactionHash=' +
        'ab'.repeat(32),
      expect.anything(),
    );
  });
  it.each([404, 429, 500, 503])(
    'keeps Stellar polling resumable on HTTP %i',
    async (status) => {
      global.fetch = jest.fn().mockResolvedValue(new Response('', { status }));
      await expect(
        service.getStellarAttestation('ab'.repeat(32)),
      ).resolves.toBeNull();
    },
  );
  it('rejects a different Stellar source hash', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        Response.json({ sourceTxHash: 'cd'.repeat(32), messages: [] }),
      );
    await expect(
      service.getStellarAttestation('ab'.repeat(32)),
    ).rejects.toThrow();
  });
  it('returns null while the burn is not indexed', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('', { status: 404 }));
    await expect(
      service.getAttestation('0x' + 'ab'.repeat(32)),
    ).resolves.toBeNull();
  });
  it('returns null for a pending attestation', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      Response.json({
        messages: [{ status: 'pending_confirmations', attestation: 'PENDING' }],
      }),
    );
    await expect(
      service.getAttestation('0x' + 'ab'.repeat(32)),
    ).resolves.toBeNull();
  });
  it('returns only complete valid hex messages', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      Response.json({
        messages: [
          { status: 'complete', message: '0xabcd', attestation: '0x1234' },
        ],
      }),
    );
    await expect(
      service.getAttestation('0x' + 'ab'.repeat(32)),
    ).resolves.toEqual({ message: '0xabcd', attestation: '0x1234' });
  });
  it('does not confuse a provider error with a pending transfer', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('', { status: 503 }));
    await expect(
      service.getAttestation('0x' + 'ab'.repeat(32)),
    ).rejects.toThrow();
  });
  it('uses configured domains and preserves fractional fee basis points', async () => {
    global.fetch = jest.fn((url: string | URL | Request) => {
      expect(url).toBe('https://circle.invalid/v2/burn/USDC/fees/0/27');
      return Promise.resolve(
        Response.json([{ finalityThreshold: 1000, minimumFee: 1.3 }]),
      );
    }) as typeof fetch;
    await expect((service as any).getFee(true)).resolves.toBe('1.3');
  });

  it.each([
    [0, 'Ethereum Sepolia'],
    [1, 'Avalanche Fuji'],
    [2, 'Optimism Sepolia'],
    [3, 'Arbitrum Sepolia'],
    [6, 'Base Sepolia'],
  ])('requests forward fees from source domain %i for %s', async (domain) => {
    global.fetch = jest.fn((url: string | URL | Request) => {
      expect(url).toBe(`https://circle.invalid/v2/burn/USDC/fees/${domain}/27`);
      return Promise.resolve(
        Response.json([
          {
            finalityThreshold: 2000,
            minimumFee: '1',
            forwardFee: { med: 2500 },
          },
        ]),
      );
    }) as typeof fetch;
    await expect(service.getBurnFee(2000, domain)).resolves.toEqual({
      finalityThreshold: 2000,
      minimumFee: '1',
      forwardFee: '2500',
    });
  });

  it('polls attestation from the selected forward source domain', async () => {
    global.fetch = jest.fn((url: string | URL | Request) => {
      expect(url).toBe(
        'https://circle.invalid/v2/messages/6?transactionHash=0xsource',
      );
      return Promise.resolve(new Response('', { status: 404 }));
    }) as typeof fetch;
    await expect(service.getAttestation('0xsource', 6)).resolves.toBeNull();
  });
});
