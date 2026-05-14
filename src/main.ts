import './common/bigint-patch';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AppLogger } from './common/logger/logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(AppLogger);
  app.useLogger(logger);

  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  const server = app.getHttpAdapter().getInstance();
  if (typeof server.disable === 'function') {
    server.disable('x-powered-by');
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log('application.started', {
    port,
    env: process.env.NODE_ENV ?? 'development',
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('CRITICAL: Unhandled Rejection', reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message, err.stack);
  process.exit(1);
});

bootstrap();
