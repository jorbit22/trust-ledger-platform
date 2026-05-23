import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { RequestContextStore } from '../../../common/context/request-context';
import { BaseRepository } from '../../../common/database/base.repository';
import { AppLogger } from '../../../common/logger/logger.service';
import {
  EntryDirection,
  JournalEntry,
  JournalEntryType,
  PostingInstruction,
  mapRowToJournalEntry,
} from './journal-entry.entity';

@Injectable()
export class JournalRepository extends BaseRepository {
  constructor(@Inject('PG_POOL') pool: Pool, logger: AppLogger) {
    super(pool, logger);
  }

  // Writes debit and credit legs atomically inside the caller's transaction
  // GL codes are required — an empty GL code corrupts financial reports silently
  async post(
    instruction: PostingInstruction,
    client: PoolClient,
  ): Promise<JournalEntry[]> {
    if (!instruction.debitGlCode || !instruction.creditGlCode) {
      throw new BadRequestException(
        `Posting rejected: GL codes must be defined for both legs of ${instruction.entryType}`,
      );
    }

    const traceId = RequestContextStore.getTraceId();

    const debitEntry = await this.insertEntry(client, {
      transactionId: instruction.transactionId,
      accountId: instruction.debitAccountId,
      amountKobo: instruction.amountKobo,
      direction: EntryDirection.DEBIT,
      entryType: instruction.entryType,
      traceId,
      idempotencyKey: instruction.idempotencyKey,
      glAccountCode: instruction.debitGlCode,
      metadata: instruction.metadata,
    });

    const creditEntry = await this.insertEntry(client, {
      transactionId: instruction.transactionId,
      accountId: instruction.creditAccountId,
      amountKobo: instruction.amountKobo,
      direction: EntryDirection.CREDIT,
      entryType: instruction.entryType,
      traceId,
      idempotencyKey: instruction.idempotencyKey,
      glAccountCode: instruction.creditGlCode,
      metadata: instruction.metadata,
    });

    return [debitEntry, creditEntry];
  }

  private async insertEntry(
    client: PoolClient,
    data: {
      transactionId: string;
      accountId: string;
      amountKobo: bigint;
      direction: EntryDirection;
      entryType: JournalEntryType;
      traceId: string;
      idempotencyKey?: string;
      glAccountCode: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<JournalEntry> {
    const result = await client.query(
      `INSERT INTO journal_entries
        (transaction_id, account_id, amount_kobo, direction,
         entry_type, trace_id, idempotency_key, gl_account_code, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.transactionId,
        data.accountId,
        data.amountKobo,
        data.direction,
        data.entryType,
        data.traceId,
        data.idempotencyKey ?? null,
        data.glAccountCode,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ],
    );

    return mapRowToJournalEntry(result.rows[0]);
  }

  async findByTransactionId(transactionId: string): Promise<JournalEntry[]> {
    const rows = await this.query<any>(
      `SELECT * FROM journal_entries
       WHERE transaction_id = $1
       ORDER BY created_at ASC`,
      [transactionId],
    );
    return rows.map(mapRowToJournalEntry);
  }

  async findByAccountId(
    accountId: string,
    limit = 50,
    offset = 0,
  ): Promise<JournalEntry[]> {
    const rows = await this.query<any>(
      `SELECT * FROM journal_entries
       WHERE account_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [accountId, limit, offset],
    );
    return rows.map(mapRowToJournalEntry);
  }

  // Calculates true balance directly from journal entries
  // Used for integrity checks against the cached balance on the accounts table
  // COALESCE ensures new accounts with zero entries return 0 not null
  async computeBalanceFromEntries(accountId: string): Promise<bigint> {
    const rows = await this.query<any>(
      `SELECT
         COALESCE(
           SUM(CASE WHEN direction = 'CREDIT' THEN amount_kobo
                    ELSE -amount_kobo END),
           0
         ) AS computed_balance
       FROM journal_entries
       WHERE account_id = $1`,
      [accountId],
    );

    return BigInt(rows[0]?.computed_balance);
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<JournalEntry[]> {
    const rows = await this.query<any>(
      `SELECT * FROM journal_entries
       WHERE idempotency_key = $1
       ORDER BY created_at ASC`,
      [idempotencyKey],
    );
    return rows.map(mapRowToJournalEntry);
  }

  async executeInTransaction<T>(
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.withTransaction(fn);
  }
}
