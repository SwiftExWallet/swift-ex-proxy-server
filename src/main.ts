import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { bigintJsonSerializerMiddleware } from './api/v1/common/middleware/bigintJsonSerializer.middleware';

async function bootstrap() {
  console.log('==== env bootstrap ===', process.env.ENVIRONMENT);

  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.use(bigintJsonSerializerMiddleware);
  app.enableCors({
    origin: '*',
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
