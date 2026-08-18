import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from './app.module';
import * as packageJson from '../package.json';

describe('AppModule bridge removal', () => {
  it('does not register bridge modules', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AppModule,
    ) as unknown[];
    const moduleNames = imports.map((moduleRef) => {
      if (typeof moduleRef === 'function') {
        return moduleRef.name;
      }
      return undefined;
    });

    expect(moduleNames).not.toEqual(
      expect.arrayContaining(['AllBridgeModule', 'BridgeModule']),
    );
  });

  it('does not declare the AllBridge SDK dependency', () => {
    expect(packageJson.dependencies).not.toHaveProperty(
      '@allbridge/bridge-core-sdk',
    );
  });
});
