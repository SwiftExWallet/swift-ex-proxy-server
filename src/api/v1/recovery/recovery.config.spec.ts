import { resolve } from 'node:path';
import { RecoveryConfigService } from './recovery.config';

describe('RecoveryConfigService', () => {
  const previousTempDir = process.env.SWIFTEX_RECOVERY_TEMP;

  afterEach(() => {
    if (previousTempDir === undefined) delete process.env.SWIFTEX_RECOVERY_TEMP;
    else process.env.SWIFTEX_RECOVERY_TEMP = previousTempDir;
  });

  it('resolves a relative recovery temp directory before proof jobs use it', () => {
    process.env.SWIFTEX_RECOVERY_TEMP = 'circuits/recovery-tmp';

    const config = new RecoveryConfigService();

    expect(config.recovery.tempDir).toBe(
      resolve(process.cwd(), 'circuits/recovery-tmp'),
    );
  });
});
