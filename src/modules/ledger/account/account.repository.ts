import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { BaseRepository } from '../../../common/database/base.repository';
import { AppLogger } from '../../../common/logger/logger.service';
import { Account, AccountCategory, AccountStatus } from './account.entity';

function mapRowToAccount(row: any): Account {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category,
    status: row.status,
    currency: row.currency,
    balanceKobo: BigInt(row.balance_kobo),
    holdBalanceKobo: BigInt(row.hold_balance_kobo),
    glAccountCode: row.gl_account_code,
    version: parseInt(row.version),
    kycTier: parseInt(row.kyc_tier),
    dailyLimitKobo: BigInt(row.daily_limit_kobo),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

@Injectable()
export class AccountRepository extends BaseRepository {
  constructor(@Inject('PG_POOL') pool: Pool, logger: AppLogger) {
    super(pool, logger);
  }

  async findById(id: string): Promise<Account | null> {
    const rows = await this.query<any>(`SELECT * FROM accounts WHERE id = $1`, [
      id,
    ]);
    return rows[0] ? mapRowToAccount(rows[0]) : null;
  }

  async findByUserId(userId: string): Promise<Account[]> {
    const rows = await this.query<any>(
      `SELECT * FROM accounts WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId],
    );
    return rows.map(mapRowToAccount);
  }

  async findManyForUpdate(
    ids: string[],
    client: PoolClient,
  ): Promise<Account[]> {
    const sortedIds = [...ids].sort();
    const result = await client.query(
      `SELECT * FROM accounts WHERE id = ANY($1) FOR UPDATE`,
      [sortedIds],
    );
    return result.rows.map(mapRowToAccount);
  }

  async create(
    data: {
      userId: string;
      category: AccountCategory;
      currency: string;
      glAccountCode: string;
      kycTier: number;
      dailyLimitKobo: bigint;
    },
    client?: PoolClient,
  ): Promise<Account> {
    const sql = `
      INSERT INTO accounts
        (user_id, category, currency, gl_account_code, kyc_tier, daily_limit_kobo)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const params = [
      data.userId,
      data.category,
      data.currency,
      data.glAccountCode,
      data.kycTier,
      data.dailyLimitKobo,
    ];

    const rows = client
      ? (await client.query(sql, params)).rows
      : await this.query<any>(sql, params);

    return mapRowToAccount(rows[0]);
  }

  async updateBalances(
    id: string,
    updates: { balanceKobo?: bigint; holdBalanceKobo?: bigint },
    currentVersion: number,
    client: PoolClient,
  ): Promise<boolean> {
    const setClauses: string[] = [
      'version = version + 1',
      'updated_at = NOW()',
    ];
    const params: any[] = [id, currentVersion];

    if (updates.balanceKobo !== undefined) {
      params.push(updates.balanceKobo);
      setClauses.push(`balance_kobo = $${params.length}`);
    }

    if (updates.holdBalanceKobo !== undefined) {
      params.push(updates.holdBalanceKobo);
      setClauses.push(`hold_balance_kobo = $${params.length}`);
    }

    const result = await client.query(
      `UPDATE accounts
       SET ${setClauses.join(', ')}
       WHERE id = $1 AND version = $2`,
      params,
    );

    return result.rowCount === 1;
  }

  async updateStatus(
    id: string,
    status: AccountStatus,
    currentVersion: number,
    client: PoolClient,
  ): Promise<Account | null> {
    const result = await client.query(
      `UPDATE accounts
       SET status = $1,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $2 AND version = $3
       RETURNING *`,
      [status, id, currentVersion],
    );
    return result.rows[0] ? mapRowToAccount(result.rows[0]) : null;
  }

  async updateStatusTransactional(
    id: string,
    status: AccountStatus,
    currentVersion: number,
  ): Promise<Account | null> {
    return this.withTransaction(async (client) => {
      return this.updateStatus(id, status, currentVersion, client);
    });
  }
}
