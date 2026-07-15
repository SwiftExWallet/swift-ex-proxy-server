import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { bigintJsonSerializerMiddleware } from './api/v1/common/middleware/bigintJsonSerializer.middleware';
import { json, urlencoded } from 'express';

const DEFAULT_API_BODY_LIMIT = '512kb';
const DEFAULT_WEBHOOK_BODY_LIMIT = '128kb';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const apiBodyLimit = process.env.API_BODY_LIMIT || DEFAULT_API_BODY_LIMIT;
  const webhookBodyLimit =
    process.env.WEBHOOK_BODY_LIMIT || DEFAULT_WEBHOOK_BODY_LIMIT;

  app.use(
    '/api/v1/webhook',
    json({ limit: webhookBodyLimit }),
    urlencoded({ extended: true, limit: webhookBodyLimit }),
  );
  app.use(
    json({ limit: apiBodyLimit }),
    urlencoded({ extended: true, limit: apiBodyLimit }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.use(bigintJsonSerializerMiddleware);
  app.enableCors({
    origin: '*',
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
