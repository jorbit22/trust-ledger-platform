# Trust Ledger Platform

A production-grade Trust Accounting and Payment Processing Platform built to Payment Service Bank (PSB) standards.

---

## Overview

This platform implements the core financial infrastructure of a modern Payment Service Bank — double-entry ledger, real-time transaction processing, settlement, reconciliation, and liquidity management.

Built for correctness under failure, not just the happy path.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              API Gateway  (Correlation ID injection)         │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────────┐
        │                  │                       │
┌───────▼──────┐  ┌────────▼───────┐  ┌──────────▼────────┐
│ Wallet Engine│  │ Payment Engine │  │ Notification Svc  │
│ Ledger Core  │  │ Tx Processing  │  │ SMS / Webhook     │
└───────┬──────┘  └────────┬───────┘  └──────────┬────────┘
        │                  │                       │
        └──────────────────▼───────────────────────┘
                  ┌─────────────────┐
                  │   Kafka Bus     │
                  └────────┬────────┘
          ┌────────────────┼──────────────────┐
          │                │                  │
┌─────────▼──────┐ ┌───────▼──────┐ ┌────────▼──────────┐
│ Settlement Svc │ │ Recon Engine │ │ Liquidity Manager │
└────────────────┘ └──────────────┘ └───────────────────┘
          │                │                  │
          └────────────────▼──────────────────┘
                  ┌─────────────────┐
                  │  Observability  │
                  │  Structured Log │
                  │  Trace Context  │
                  └─────────────────┘
```

---

## Tech Stack

| Layer            | Technology                       |
| ---------------- | -------------------------------- |
| Runtime          | Node.js 20 + TypeScript (strict) |
| Framework        | NestJS 11                        |
| Migrations       | Prisma 6 (raw SQL)               |
| Primary Database | PostgreSQL 16 (Aiven)            |
| Cache / Locks    | Redis 7 (Aiven)                  |
| Message Bus      | Apache Kafka (Aiven)             |
| Testing          | Jest + Supertest                 |
| CI/CD            | GitHub Actions                   |

---

## What Is Built

### Phase 0 — Observability Foundation

Every request, log line, database query, and Kafka message carries a `traceId` automatically.

- Request trace context using AsyncLocalStorage — frozen on entry, shared across entire async chain
- Trace interceptor — captures or generates `X-Trace-ID`, validates format, extracts real client IP behind proxies
- Structured JSON logger — NDPR-compliant field redaction, Error stack preserved, circular reference safe
- Base repository — PostgreSQL session stamped with trace ID on every query
- Global exception filter — every error logged with full request context and database error details
- Global shared connection pool — single pool across all modules

### Phase 1 — Database Schema

- `accounts` — wallet registry with row-level security, KYC tiers, optimistic locking, hold balance
- `journal_entries` — monthly partitioned double-entry ledger with deferred balance enforcement at commit time
- `transaction_outbox` — guaranteed event delivery written atomically with business data
- `idempotency_keys` — endpoint-scoped request deduplication with expiry
- `audit_log` — append-only compliance trail, no UPDATE or DELETE permitted
- `recon_staging` — external settlement reconciliation with computed discrepancy
- `provider_float` — liquidity management with low balance alerting
- `float_movements` — float audit trail

### Phase 1 — Account Domain

- Wallet creation with CBN KYC tier limit enforcement
- Duplicate prevention at application and database constraint level
- Freeze, unfreeze, dormant status transitions with optimistic locking
- All monetary values stored and returned in Kobo as strings

---

## Live Endpoints

```
POST   /api/accounts                Create a wallet account
GET    /api/accounts/:id            Get account by ID
GET    /api/accounts/user/:userId   Get all accounts for a user
PATCH  /api/accounts/:id/freeze     Freeze an account
PATCH  /api/accounts/:id/unfreeze   Unfreeze an account
PATCH  /api/accounts/:id/dormant    Mark account dormant
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- Aiven account with PostgreSQL, Redis, and Kafka services
- Aiven CA certificate saved to `certs/ca.pem`

### Installation

```bash
git clone https://github.com/jorbit22/trust-ledger-platform.git
cd trust-ledger-platform
npm install
cp .env.example .env
# Fill in your Aiven connection strings
```

### Run Migrations

```bash
npm run migrate:deploy
```

### Start Development Server

```bash
npm run start:dev
```

### Run Tests

```bash
npm run test
npm run test:e2e
```

---

## Project Structure

```
src/
├── common/
│   ├── context/           # Request trace context
│   ├── database/          # Global pool, base repository
│   ├── filters/           # Global exception filter
│   ├── interceptors/      # Trace ID interceptor
│   └── logger/            # Structured JSON logger
├── modules/
│   └── ledger/
│       └── account/       # Account entity, repository, service, controller
│           └── dto/       # Request and response DTOs
prisma/
└── migrations/            # Versioned schema migrations
certs/                     # Aiven CA certificate (gitignored)
```

---

## Engineering Properties

- Double-entry enforced at database level — books must balance at commit time
- All amounts in Kobo — integer arithmetic, zero floating point
- Row-level security — service roles isolated at database layer
- Optimistic locking — concurrent balance updates without deadlocks
- Hold balance — funds earmarked before settlement completes
- Outbox pattern — events committed atomically with business data
- Correlation ID — single trace across all services and log lines
- Append-only audit log — tamper-evident at database rule level
- NDPR compliant logging — sensitive fields never appear in logs

---

## Compliance

- NDPR — sensitive fields redacted from all log output
- PCI-DSS patterns — encryption at rest via Aiven managed services
- CBN PSB regulations — KYC tier limit enforcement
- Audit trail — append-only, tamper-evident

---

## Roadmap

- [x] Phase 0 — Observability foundation
- [x] Phase 1 — Database schema
- [x] Phase 1 — Account domain
- [ ] Phase 2 — Journal posting engine
- [ ] Phase 3 — Payment processing and provider integration
- [ ] Phase 4 — Reconciliation engine
- [ ] Phase 5 — Liquidity manager
- [ ] Phase 6 — KYC/AML engine
- [ ] Phase 7 — React dashboard
- [ ] Phase 8 — Chaos testing suite
- [ ] Phase 9 — CI/CD and production hardening

---

## License

MIT
