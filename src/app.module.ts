import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TraceInterceptor } from './common/interceptors/trace.interceptor';
import { AppLogger } from './common/logger/logger.service';

// The root module — every request flows through the TraceInterceptor
// before reaching any business logic anywhere in the system
@Module({
  imports: [
    // Makes .env variables available everywhere via process.env
    ConfigModule.forRoot({ isGlobal: true }),
  ],
  providers: [
    // Registers TraceInterceptor globally — no need to add it to each module
    {
      provide: APP_INTERCEPTOR,
      useClass: TraceInterceptor,
    },
    AppLogger,
  ],
  exports: [AppLogger],
})
export class AppModule {}
