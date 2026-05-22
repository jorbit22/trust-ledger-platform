import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Global()
@Module({
  providers: [
    {
      provide: 'PG_POOL',
      useFactory: (config: ConfigService) => {
        const isProduction = config.get('NODE_ENV') === 'production';

        const pool = new Pool({
          connectionString: config.get<string>('DATABASE_URL'),
          ssl: isProduction ? { rejectUnauthorized: false } : false,
          // 5 is enough for development — Aiven free tier has 25 total
          // High max causes connection exhaustion when pool fills up
          max: 5,
          idleTimeoutMillis: 60000,
          // Fail fast — do not wait 10s for a connection that is not coming
          connectionTimeoutMillis: 5000,
          allowExitOnIdle: false,
        });

        pool.on('error', (err) => {
          console.error('PG Pool error:', err.message);
        });

        return pool;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['PG_POOL'],
})
export class DatabaseModule {}
