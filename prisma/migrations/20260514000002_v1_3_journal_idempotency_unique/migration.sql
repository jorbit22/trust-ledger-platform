-- Add direction enum if it does not exist
DO $$ BEGIN
  CREATE TYPE entry_direction AS ENUM ('DEBIT', 'CREDIT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add direction column to journal_entries
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS direction entry_direction NOT NULL DEFAULT 'CREDIT';

-- Unique index on partitioned table MUST include the partition key (created_at)
-- This prevents duplicate postings with the same idempotency key and direction
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_idempotency_direction
  ON journal_entries (idempotency_key, direction, created_at)
  WHERE idempotency_key IS NOT NULL;