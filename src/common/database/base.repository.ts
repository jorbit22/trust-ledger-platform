import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { AppLogger } from '../logger/logger.service';
import { RequestContextStore } from '../context/request-context';

export abstract class BaseRepository {
  constructor(
    protected readonly pool: Pool,
    protected readonly logger: AppLogger,
  ) {}

  // Simple queries do not stamp the session — that would double every round trip
  // Session stamping only happens inside transactions where it matters for auditing
  protected async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const start = Date.now();
    const client = await this.pool.connect();

    try {
      const result = await client.query(sql, params);
      this.logger.logQuery(sql, Date.now() - start);
      return result.rows as T[];
    } catch (error: any) {
      this.logger.error('db.query.failed', {
        error_message: error.message,
        sql: sql.substring(0, 150),
      });
      throw error;
    } finally {
      client.release();
    }
  }

  protected async withTransaction<T>(
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Stamp session inside transaction only — this is where DB-level
      // audit trails matter, not on simple reads
      await client.query('SELECT set_config($1, $2, true)', [
        'app.trace_id',
        RequestContextStore.getTraceId(),
      ]);

      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error: any) {
      await client.query('ROLLBACK');
      this.logger.error('db.transaction.failed', {
        error_message: error.message,
        stack: error.stack,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // Writes business data and outbox event atomically in one transaction
  // If Kafka is down the event is safely stored and sent later
  protected async withOutbox<T>(
    fn: (client: PoolClient) => Promise<T>,
    event: {
      aggregateId: string;
      aggregateType: string;
      eventType: string;
      payload: Record<string, unknown>;
    },
  ): Promise<T> {
    return this.withTransaction(async (client) => {
      const result = await fn(client);

      await client.query(
        `INSERT INTO transaction_outbox
          (aggregate_id, aggregate_type, event_type, payload,
           trace_id, user_id, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          event.aggregateId,
          event.aggregateType,
          event.eventType,
          JSON.stringify(event.payload),
          RequestContextStore.getTraceId(),
          RequestContextStore.getUserId() ?? null,
          RequestContextStore.getIpAddress() ?? null,
        ],
      );

      return result;
    });
  }
}
