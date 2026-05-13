# Trust Ledger Platform

A production-grade Trust Accounting and Payment Processing Platform
built to Payment Service Bank (PSB) standards.

---

## Overview

This platform implements the core financial infrastructure of a modern
Payment Service Bank — double-entry ledger, real-time transaction
processing, settlement, reconciliation, and liquidity management.

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
                  │  OpenTelemetry  │
                  │  Grafana        │
                  └─────────────────┘
```

---

## Tech Stack

| Layer            | Technology                       |
| ---------------- | -------------------------------- |
| Runtime          | Node.js 20 + TypeScript (strict) |
| Framework        | NestJS                           |
| ORM / Migrations | Prisma 6                         |
| Primary Database | PostgreSQL 16 (Aiven)            |
| Cache / Locks    | Redis 7 (Aiven)                  |
| Message Bus      | Apache Kafka (Aiven)             |
| Observability    | OpenTelemetry + Grafana          |
| Testing          | Jest + Supertest                 |
| CI/CD            | GitHub Actions                   |

---

## Database Schema

| Table                | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `accounts`           | Wallet registry — customer, float, suspense, revenue accounts |
| `journal_entries`    | Partitioned double-entry ledger                               |
| `transaction_outbox` | Guaranteed event delivery                                     |
| `idempotency_keys`   | Request deduplication                                         |
| `audit_log`          | Append-only compliance trail                                  |
| `recon_staging`      | External settlement reconciliation                            |
| `provider_float`     | Liquidity and hot wallet management                           |
| `float_movements`    | Float audit trail                                             |

---

## Key Engineering Properties

- **Double-entry enforced at DB level** — every transaction must balance at commit time
- **All amounts in Kobo** — integer arithmetic, zero floating point
- **Row-level security** — service roles physically isolated at database layer
- **Optimistic locking** — concurrent balance updates handled without deadlocks
- **Hold balance** — funds earmarked before settlement, preventing double-spend
- **Outbox pattern** — events written in same transaction as business data
- **Correlation ID** — every request traced across all services end to end
- **Append-only audit log** — no UPDATE or DELETE permitted on audit records

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- Aiven account with PostgreSQL, Redis, and Kafka services

### Installation

```bash
git clone https://github.com/jorbit22/trust-ledger-platform.git
cd trust-ledger-platform
npm install
cp .env.example .env
# Fill in your Aiven connection strings and CA certificate path
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
│   ├── context/         # Request trace context
│   ├── interceptors/    # Correlation ID propagation
│   ├── logger/          # Structured JSON logger
│   ├── decorators/      # @Transactional, @Idempotent
│   └── database/        # Base repository
├── modules/
│   ├── wallet/          # Wallet management
│   ├── ledger/          # Double-entry posting engine
│   ├── payment/         # Transaction processing
│   ├── settlement/      # Settlement and NIBSS integration
│   ├── reconciliation/  # Recon engine
│   └── liquidity/       # Float management
prisma/
└── migrations/          # Versioned schema migrations
```

---

## Compliance

- NDPR — PII redacted from all log output
- PCI-DSS patterns — encryption at rest via Aiven managed services
- CBN PSB regulations — KYC tier enforcement at database level
- Audit trail — append-only, tamper-evident

---

## Roadmap

- [x] Phase 0 — Infrastructure and Observability foundation
- [x] Phase 1 — Fortress Database Schema
- [ ] Phase 2 — Wallet and Ledger Posting Engine
- [ ] Phase 3 — Payment Processing and Provider Integration
- [ ] Phase 4 — Reconciliation Engine
- [ ] Phase 5 — Liquidity Manager
- [ ] Phase 6 — KYC/AML Engine
- [ ] Phase 7 — React Dashboard
- [ ] Phase 8 — Chaos Testing Suite
- [ ] Phase 9 — CI/CD and Production Hardening

---

## License

MIT
