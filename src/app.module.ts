import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseModule } from './common/database/database.module';
import { TraceInterceptor } from './common/interceptors/trace.interceptor';
import { AppLogger } from './common/logger/logger.service';
import { LedgerModule } from './modules/ledger/ledger.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // DatabaseModule must come before any module that uses PG_POOL
    DatabaseModule,
    LedgerModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TraceInterceptor,
    },
    AppLogger,
  ],
  exports: [AppLogger],
})
export class AppModule {}
