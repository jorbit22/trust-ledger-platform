import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AppLogger } from './common/logger/logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Disable NestJS default logger — our AppLogger takes over
    bufferLogs: true,
  });

  const logger = app.get(AppLogger);

  // Tell NestJS to use our structured JSON logger for all internal messages
  app.useLogger(logger);

  // Rejects any request payload that does not match our DTOs
  // Prevents malformed data from ever reaching business logic
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // All routes prefixed with /api
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log('application.started', { port });
}

bootstrap();
