import { SwaggerModule } from '@nestjs/swagger';
import {
  createSwaggerConfig,
  setupSwagger,
  SWAGGER_JSON_PATH,
  SWAGGER_PATH,
} from './swagger.config';

describe('swagger config', () => {
  it('documents the API with device and wallet header auth', () => {
    const config = createSwaggerConfig();

    expect(config.info).toMatchObject({
      title: 'SwiftEx Proxy API',
      version: '1.0',
    });
    expect(config.components?.securitySchemes).toMatchObject({
      deviceToken: {
        type: 'apiKey',
        in: 'header',
        name: 'x-auth-device-token',
      },
      walletAddress: {
        type: 'apiKey',
        in: 'header',
        name: 'x-wallet-address',
      },
      walletToken: {
        type: 'apiKey',
        in: 'header',
        name: 'x-auth-wallet-token',
      },
    });
  });

  it('mounts swagger ui and json on stable paths', () => {
    const app = {} as any;
    const document = {
      openapi: '3.0.0',
      info: { title: 'test', version: '1.0' },
      paths: {},
    };
    const createDocument = jest
      .spyOn(SwaggerModule, 'createDocument')
      .mockReturnValue(document as any);
    const setup = jest.spyOn(SwaggerModule, 'setup').mockImplementation();

    setupSwagger(app);

    expect(createDocument).toHaveBeenCalledWith(app, createSwaggerConfig());
    expect(setup).toHaveBeenCalledWith(
      SWAGGER_PATH,
      app,
      document,
      expect.objectContaining({
        jsonDocumentUrl: SWAGGER_JSON_PATH,
        swaggerOptions: expect.objectContaining({
          persistAuthorization: true,
        }),
      }),
    );
  });
});
