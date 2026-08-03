import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'docs';
export const SWAGGER_JSON_PATH = 'docs-json';

export function createSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('SwiftEx Proxy API')
    .setDescription('OpenAPI documentation for the SwiftEx proxy server.')
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-auth-device-token',
        description: 'Device JWT token required by protected API routes.',
      },
      'deviceToken',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-wallet-address',
        description: 'Wallet address required by wallet-scoped API routes.',
      },
      'walletAddress',
    )
    .build();
}

export function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(app, createSwaggerConfig());

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: SWAGGER_JSON_PATH,
    swaggerOptions: {
      persistAuthorization: true,
    },
    customSiteTitle: 'SwiftEx Proxy API Docs',
  });
}
