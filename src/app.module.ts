import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseModule } from './common/database/database.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TraceInterceptor } from './common/interceptors/trace.interceptor';
import { AppLogger } from './common/logger/logger.service';
import { LedgerModule } from './modules/ledger/ledger.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    LedgerModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TraceInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    AppLogger,
  ],
  exports: [AppLogger],
})
export class AppModule {}
