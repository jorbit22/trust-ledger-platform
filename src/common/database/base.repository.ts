import { Pool, PoolClient } from 'pg';
import { AppLogger } from '../logger/logger.service';
import { RequestContextStore } from '../context/request-context';

// Every repository in the system extends this class
// It guarantees traceability, safe session stamping, and atomic
// event writing are handled consistently across all database operations
export abstract class BaseRepository {
  constructor(
    protected readonly pool: Pool,
    protected readonly logger: AppLogger,
  ) {}

  // Stamps the PostgreSQL session with the current trace ID
  // Using set_config with parameters prevents any possibility of SQL injection
  // even though trace IDs are already validated as UUIDs at the gateway
  private async stampSession(client: PoolClient): Promise<void> {
    await client.query('SELECT set_config($1, $2, true)', [
      'app.trace_id',
      RequestContextStore.getTraceId(),
    ]);
  }

  protected async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const start = Date.now();

    try {
      return await this.executeQuery<T>(sql, params);
    } catch (error: any) {
      // Aiven free tier drops idle connections
      // Retry once on connection timeout before giving up
      if (
        error.message?.includes('Connection terminated') ||
        error.message?.includes('connection timeout')
      ) {
        this.logger.warn('db.query.retry', { sql: sql.substring(0, 100) });
        return await this.executeQuery<T>(sql, params);
      }
      throw error;
    } finally {
      this.logger.logQuery(sql, Date.now() - start);
    }
  }

  private async executeQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT set_config($1, $2, true)', [
        'app.trace_id',
        RequestContextStore.getTraceId(),
      ]);
      const result = await client.query(sql, params);
      return result.rows as T[];
    } catch (error) {
      this.logger.error('db.query.failed', { error: error as Error, sql });
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
      await this.stampSession(client);

      const result = await fn(client);

      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('db.transaction.failed', error as Error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Writes a business operation and its outbox event atomically
  // If Kafka is down, the event is safely stored and sent later —
  // the customer's money never disappears silently (F-004)
  // Full context (trace + user + ip) is captured so the event stream
  // tells the complete story without joining other tables
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
