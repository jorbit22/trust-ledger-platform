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
          max: 20,
          // How long a client can sit idle before being closed
          // Aiven free tier drops connections — we close them first
          idleTimeoutMillis: 60000,
          connectionTimeoutMillis: 10000,
          // Automatically reconnect if connection is lost
          allowExitOnIdle: false,
        });

        // Log pool errors so we know when connections drop
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
