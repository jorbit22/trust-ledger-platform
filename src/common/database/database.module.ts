import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

// @Global makes PG_POOL available to every module in the app
// without needing to import DatabaseModule in each one
// This ensures the entire application shares one connection pool
@Global()
@Module({
  providers: [
    {
      provide: 'PG_POOL',
      useFactory: (config: ConfigService) => {
        const isProduction = config.get('NODE_ENV') === 'production';
        return new Pool({
          connectionString: config.get<string>('DATABASE_URL'),
          // SSL required in production (Aiven) but skipped locally
          // to avoid certificate errors during development
          ssl: isProduction ? { rejectUnauthorized: false } : false,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: ['PG_POOL'],
})
export class DatabaseModule {}
