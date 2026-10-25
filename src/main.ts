import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { bigintJsonSerializerMiddleware } from './api/v1/common/middleware/bigintJsonSerializer.middleware';
import helmet from 'helmet';
import { createCorsOptions } from './api/v1/common/config/cors.config';
import { setupSwagger } from './api/v1/common/config/swagger.config';
import { configureBodyParsers } from './body-parser.config';

const DEFAULT_API_BODY_LIMIT = '512kb';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const apiBodyLimit = process.env.API_BODY_LIMIT || DEFAULT_API_BODY_LIMIT;

  configureBodyParsers(app.getHttpAdapter().getInstance(), apiBodyLimit);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  setupSwagger(app);
  app.use(helmet());
  app.use(bigintJsonSerializerMiddleware);
  app.enableCors(createCorsOptions());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
