-- ============================================================
-- TRUST ACCOUNTING PLATFORM — FORTRESS SCHEMA v1.0
-- Hardened against 80 identified failure modes
-- All amounts in KOBO (smallest NGN unit)
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE account_category AS ENUM (
  'CUSTOMER',
  'INTERNAL_FLOAT',
  'SUSPENSE',
  'REVENUE',
  'PROVIDER'
);

CREATE TYPE account_status AS ENUM (
  'ACTIVE',
  'DORMANT',
  'FROZEN',
  'CLOSED'
);

CREATE TYPE outbox_status AS ENUM (
  'PENDING',
  'PROCESSING',
  'PROCESSED',
  'DEAD'
);

CREATE TYPE recon_status AS ENUM (
  'MATCHED',
  'UNMATCHED_INTERNAL',
  'UNMATCHED_EXTERNAL',
  'DISPUTED',
  'RESOLVED'
);

-- ============================================================
-- 1. ACCOUNTS
-- ============================================================

CREATE TABLE accounts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL,
  category          account_category NOT NULL,
  status            account_status NOT NULL DEFAULT 'ACTIVE',
  currency          CHAR(3) NOT NULL DEFAULT 'NGN',
  balance_kobo      BIGINT NOT NULL DEFAULT 0,
  hold_balance_kobo BIGINT NOT NULL DEFAULT 0,
  gl_account_code   VARCHAR(20) NOT NULL,
  version           BIGINT NOT NULL DEFAULT 0,
  kyc_tier          SMALLINT NOT NULL DEFAULT 1,
  daily_limit_kobo  BIGINT NOT NULL DEFAULT 10000000,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT customer_balance_non_negative
    CHECK (category != 'CUSTOMER' OR (balance_kobo - hold_balance_kobo) >= 0),
  CONSTRAINT balance_floor
    CHECK (balance_kobo >= -100000000000),
  CONSTRAINT valid_currency
    CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX idx_accounts_user_id  ON accounts(user_id);
CREATE INDEX idx_accounts_category ON accounts(category);
CREATE INDEX idx_accounts_gl_code  ON accounts(gl_account_code);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 2. JOURNAL ENTRIES (Partitioned)
-- ============================================================

CREATE TABLE journal_entries (
  id              UUID NOT NULL DEFAULT uuid_generate_v4(),
  transaction_id  UUID NOT NULL,
  account_id      UUID NOT NULL,
  amount_kobo     BIGINT NOT NULL,
  entry_type      VARCHAR(50) NOT NULL,
  trace_id        UUID NOT NULL,
  idempotency_key TEXT,
  gl_account_code VARCHAR(20) NOT NULL,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (transaction_id, id, created_at),
  CONSTRAINT amount_non_zero CHECK (amount_kobo != 0)

) PARTITION BY RANGE (created_at);

CREATE TABLE journal_entries_y2026_m05
  PARTITION OF journal_entries
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE journal_entries_y2026_m06
  PARTITION OF journal_entries
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE journal_entries_y2026_m07
  PARTITION OF journal_entries
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE journal_entries_default
  PARTITION OF journal_entries DEFAULT;

CREATE INDEX idx_je_transaction_id ON journal_entries(transaction_id);
CREATE INDEX idx_je_account_id     ON journal_entries(account_id);
CREATE INDEX idx_je_trace_id       ON journal_entries(trace_id);
CREATE INDEX idx_je_created_at     ON journal_entries(created_at);
CREATE INDEX idx_je_idempotency    ON journal_entries(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ============================================================
-- 3. DOUBLE ENTRY ENFORCEMENT
-- ============================================================

CREATE OR REPLACE FUNCTION fn_enforce_double_entry()
RETURNS TRIGGER AS $$
DECLARE
  net_val BIGINT;
BEGIN
  SELECT SUM(amount_kobo) INTO net_val
  FROM journal_entries
  WHERE transaction_id = NEW.transaction_id;

  IF net_val != 0 THEN
    RAISE EXCEPTION
      'Double-entry violation for tx %: net % kobo',
      NEW.transaction_id, net_val;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_enforce_double_entry
  AFTER INSERT ON journal_entries_y2026_m05
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION fn_enforce_double_entry();

CREATE CONSTRAINT TRIGGER trg_enforce_double_entry
  AFTER INSERT ON journal_entries_y2026_m06
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION fn_enforce_double_entry();

CREATE CONSTRAINT TRIGGER trg_enforce_double_entry
  AFTER INSERT ON journal_entries_y2026_m07
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION fn_enforce_double_entry();

CREATE CONSTRAINT TRIGGER trg_enforce_double_entry
  AFTER INSERT ON journal_entries_default
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION fn_enforce_double_entry();

-- ============================================================
-- 4. IDEMPOTENCY KEYS
-- ============================================================

CREATE TABLE idempotency_keys (
  user_id          UUID NOT NULL,
  endpoint         TEXT NOT NULL,
  idempotency_key  TEXT NOT NULL,
  response_status  INTEGER NOT NULL,
  response_body    JSONB NOT NULL,
  trace_id         UUID NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL
    DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, endpoint, idempotency_key)
);

CREATE INDEX idx_idem_expires ON idempotency_keys(expires_at);

-- ============================================================
-- 5. TRANSACTION OUTBOX
-- ============================================================

CREATE TABLE transaction_outbox (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aggregate_id   UUID NOT NULL,
  aggregate_type TEXT NOT NULL,
  event_type     TEXT NOT NULL,
  payload        JSONB NOT NULL,
  trace_id       UUID NOT NULL,
  status         outbox_status NOT NULL DEFAULT 'PENDING',
  retry_count    SMALLINT NOT NULL DEFAULT 0,
  max_retries    SMALLINT NOT NULL DEFAULT 5,
  last_attempted TIMESTAMPTZ,
  processed_at   TIMESTAMPTZ,
  error_detail   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outbox_status
  ON transaction_outbox(status)
  WHERE status IN ('PENDING', 'PROCESSING');
CREATE INDEX idx_outbox_created   ON transaction_outbox(created_at);
CREATE INDEX idx_outbox_aggregate ON transaction_outbox(aggregate_id);

-- ============================================================
-- 6. AUDIT LOG
-- ============================================================

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    UUID,
  actor_type  TEXT NOT NULL,
  action      TEXT NOT NULL,
  resource    TEXT NOT NULL,
  resource_id UUID NOT NULL,
  old_state   JSONB,
  new_state   JSONB,
  trace_id    UUID NOT NULL,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE RULE audit_log_no_update
  AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete
  AS ON DELETE TO audit_log DO INSTEAD NOTHING;

CREATE INDEX idx_audit_resource ON audit_log(resource_id);
CREATE INDEX idx_audit_actor    ON audit_log(actor_id);
CREATE INDEX idx_audit_trace    ON audit_log(trace_id);
CREATE INDEX idx_audit_created  ON audit_log(created_at);

-- ============================================================
-- 7. RECONCILIATION STAGING
-- ============================================================

CREATE TABLE recon_staging (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider             TEXT NOT NULL,
  provider_reference   TEXT NOT NULL,
  internal_reference   TEXT,
  provider_amount_kobo BIGINT NOT NULL,
  internal_amount_kobo BIGINT,
  provider_status      TEXT NOT NULL,
  internal_status      TEXT,
  provider_timestamp   TIMESTAMPTZ NOT NULL,
  recon_status         recon_status NOT NULL
    DEFAULT 'UNMATCHED_EXTERNAL',
  discrepancy_kobo     BIGINT GENERATED ALWAYS AS (
    COALESCE(provider_amount_kobo, 0) -
    COALESCE(internal_amount_kobo, 0)
  ) STORED,
  resolved_at          TIMESTAMPTZ,
  resolved_by          UUID,
  notes                TEXT,
  batch_id             UUID NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recon_provider_ref ON recon_staging(provider_reference);
CREATE INDEX idx_recon_internal_ref ON recon_staging(internal_reference);
CREATE INDEX idx_recon_status ON recon_staging(recon_status)
  WHERE recon_status != 'MATCHED';
CREATE INDEX idx_recon_batch ON recon_staging(batch_id);

-- ============================================================
-- 8. PROVIDER FLOAT
-- ============================================================

CREATE TABLE provider_float (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider           TEXT NOT NULL UNIQUE,
  balance_kobo       BIGINT NOT NULL DEFAULT 0,
  low_balance_alert  BIGINT NOT NULL DEFAULT 500000000,
  version            BIGINT NOT NULL DEFAULT 0,
  last_reconciled_at TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT float_non_negative CHECK (balance_kobo >= 0)
);

CREATE TABLE float_movements (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider      TEXT NOT NULL,
  amount_kobo   BIGINT NOT NULL,
  movement_type TEXT NOT NULL,
  reference     TEXT,
  trace_id      UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. DB ROLES
-- ============================================================

CREATE ROLE wallet_service_role     NOLOGIN;
CREATE ROLE settlement_service_role NOLOGIN;
CREATE ROLE recon_service_role      NOLOGIN;
CREATE ROLE compliance_role         NOLOGIN;
CREATE ROLE admin_role              NOLOGIN;

-- ============================================================
-- 10. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_float  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log       ENABLE ROW LEVEL SECURITY;

CREATE POLICY wallet_svc_accounts ON accounts
  FOR ALL TO wallet_service_role
  USING (category = 'CUSTOMER' AND status != 'CLOSED');

CREATE POLICY settlement_svc_accounts ON accounts
  FOR ALL TO settlement_service_role
  USING (category IN ('INTERNAL_FLOAT', 'SUSPENSE', 'PROVIDER'));

CREATE POLICY wallet_svc_journal ON journal_entries
  FOR ALL TO wallet_service_role
  USING (entry_type IN ('FUNDING', 'PAYOUT', 'FEE', 'REVERSAL'));

CREATE POLICY float_settlement_only ON provider_float
  FOR ALL TO settlement_service_role
  USING (true);

CREATE POLICY audit_read_compliance ON audit_log
  FOR SELECT TO compliance_role
  USING (true);

-- ============================================================
-- 11. GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON accounts           TO wallet_service_role;
GRANT SELECT, INSERT         ON journal_entries     TO wallet_service_role;
GRANT SELECT, INSERT         ON audit_log           TO wallet_service_role;
GRANT SELECT, INSERT         ON transaction_outbox  TO wallet_service_role;

GRANT SELECT, INSERT, UPDATE ON accounts        TO settlement_service_role;
GRANT SELECT, INSERT         ON journal_entries TO settlement_service_role;
GRANT SELECT, INSERT, UPDATE ON provider_float  TO settlement_service_role;
GRANT SELECT, INSERT         ON float_movements TO settlement_service_role;

GRANT SELECT, INSERT, UPDATE ON recon_staging TO recon_service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO compliance_role;