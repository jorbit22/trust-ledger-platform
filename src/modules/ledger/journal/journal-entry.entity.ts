import { BadRequestException } from '@nestjs/common';

export enum EntryDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export interface JournalEntry {
  id: string;
  transactionId: string;
  accountId: string;
  amountKobo: bigint;
  // Explicit direction removes any ambiguity about whether an entry
  // increases or decreases a balance — readable by engineers and auditors alike
  direction: EntryDirection;
  entryType: JournalEntryType;
  traceId: string;
  idempotencyKey?: string;
  glAccountCode: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export enum JournalEntryType {
  FUNDING = 'FUNDING',
  PAYOUT = 'PAYOUT',
  FEE = 'FEE',
  REVERSAL = 'REVERSAL',
  TRANSFER = 'TRANSFER',
  SETTLEMENT = 'SETTLEMENT',
  COMMISSION = 'COMMISSION',
}

// One posting always produces exactly two journal entries — one debit, one credit
// The engine validates they balance before committing
export interface PostingInstruction {
  transactionId: string;
  idempotencyKey: string;
  debitAccountId: string;
  creditAccountId: string;
  amountKobo: bigint;
  entryType: JournalEntryType;
  metadata?: Record<string, unknown>;
  // Optional GL overrides — when a payout needs a specific settlement GL
  // rather than the default GL code on the account
  debitGlCode?: string;
  creditGlCode?: string;
}

export function validatePostingInstruction(
  instruction: PostingInstruction,
): void {
  if (instruction.amountKobo <= 0n) {
    throw new BadRequestException(
      'Posting amount must be strictly greater than zero kobo',
    );
  }

  if (instruction.debitAccountId === instruction.creditAccountId) {
    throw new BadRequestException(
      'Self-posting rejected: debit and credit accounts must be distinct',
    );
  }
}

export function mapRowToJournalEntry(row: any): JournalEntry {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    accountId: row.account_id,
    amountKobo: BigInt(row.amount_kobo),
    direction: row.direction,
    entryType: row.entry_type,
    traceId: row.trace_id,
    idempotencyKey: row.idempotency_key,
    glAccountCode: row.gl_account_code,
    metadata: row.metadata,
    createdAt: new Date(row.created_at),
  };
}
