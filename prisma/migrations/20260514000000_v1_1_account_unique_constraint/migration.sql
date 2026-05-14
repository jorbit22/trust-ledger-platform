-- Prevents two active accounts of the same category and currency per user
-- This is the DB-level backstop for the race condition where two simultaneous
-- create requests both pass the application-level duplicate check
CREATE UNIQUE INDEX idx_accounts_unique_active
  ON accounts (user_id, category, currency)
  WHERE status != 'CLOSED';