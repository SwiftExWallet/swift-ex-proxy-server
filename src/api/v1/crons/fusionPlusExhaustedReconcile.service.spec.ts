import { Logger } from '@nestjs/common';
import { swapProvider } from '../common/enums/chain.enum';
import { FusionPlusExhaustedReconcilerService } from './fusionPlusExhaustedReconcile.service';

describe('FusionPlusExhaustedReconcilerService', () => {
  let service: FusionPlusExhaustedReconcilerService;
  let exhaustedOrderService: {
    findPendingSince: jest.Mock;
  };
  let inchService: {
    resumeSecretRevealPolling: jest.Mock;
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    exhaustedOrderService = {
      findPendingSince: jest.fn(),
    };
    inchService = {
      resumeSecretRevealPolling: jest.fn(),
    };

    service = new FusionPlusExhaustedReconcilerService(
      exhaustedOrderService as any,
      inchService as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads exhausted fusion+ orders from the service window', async () => {
    exhaustedOrderService.findPendingSince.mockResolvedValue([]);

    await service.poll();

    expect(exhaustedOrderService.findPendingSince).toHaveBeenCalledWith(
      swapProvider.ONEINCH_FUSION_PLUS,
      expect.any(Date),
    );
    expect(inchService.resumeSecretRevealPolling).not.toHaveBeenCalled();
  });

  it('resumes secret reveal polling for each exhausted fusion+ order', async () => {
    exhaustedOrderService.findPendingSince.mockResolvedValue([
      { txHash: '0xfirst' },
      { txHash: '0xsecond' },
    ]);
    inchService.resumeSecretRevealPolling.mockResolvedValue(true);

    await service.poll();

    expect(inchService.resumeSecretRevealPolling).toHaveBeenCalledTimes(2);
    expect(inchService.resumeSecretRevealPolling).toHaveBeenNthCalledWith(
      1,
      '0xfirst',
    );
    expect(inchService.resumeSecretRevealPolling).toHaveBeenNthCalledWith(
      2,
      '0xsecond',
    );
  });
});
