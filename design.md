# Financial Tracker — Architecture & Design

## Tech Stack

| Layer                | Choice                                        | Rationale                                                                                  |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Frontend**         | React 19 + TypeScript, Vite 8, React Router 7 | Fast dev server, file-based or config-based routing, modern React features.                |
| **Charts**           | Recharts                                      | Composable, declarative charting built on React + D3.                                      |
| **Backend**          | Hono + TypeScript                             | Lightweight, fast, runs on Node.js. Built-in middleware ecosystem.                         |
| **Validation**       | Zod + `@hono/zod-validator`                   | Shared schema definitions for request/response validation and OpenAPI generation.          |
| **Database**         | PostgreSQL 16                                 | Relational integrity, indexed date/account queries, range filters, aggregate functions.    |
| **ORM**              | Drizzle ORM                                   | Type-safe queries, lightweight, SQL-first philosophy.                                      |
| **File parsing**     | Papa Parse (CSV), native `JSON.parse`         | Papa Parse handles quoted fields and powers generic plus institution-specific CSV parsers. |
| **Runtime**          | Bun                                           | Super fast NodeJS runtime.                                                                 |
| **Containerization** | Docker Compose                                | PostgreSQL + backend + frontend in one `docker compose up`.                                |

## High-Level Architecture

```
┌─────────────┐       HTTP/JSON        ┌─────────────────┐        SQL         ┌────────────┐
│   Frontend   │  ◄──────────────────►  │  Backend (Hono)  │  ◄──────────────►  │  PostgreSQL │
│  React/Vite  │                        │  + Zod + Drizzle │                    │             │
└─────────────┘                        └─────────────────┘                    └────────────┘
     :5173                                   :3000                                :5432
```

- **Frontend** is a static SPA served by Vite dev server (dev) or a static file server (prod).
- **Backend** is a Hono HTTP server exposing a JSON REST API.
- **Database** is PostgreSQL accessed exclusively through Drizzle ORM.

## Project Structure

```
expenses-v3/
├── PRD.md                     # Product requirements
├── design.md                  # This file — architecture overview
├── docker-compose.yml         # PostgreSQL + backend + frontend
├── frontend/                  # React SPA — see frontend/design.md
├── backend/                   # Hono REST API — see backend/design.md
├── tests/                     # E2E tests for backend and frontend
└── shared/                    # (optional) Types shared between FE/BE
```

## Frontend Functionality

The frontend is a React SPA with client-side routing. See [frontend/design.md](frontend/design.md) for component hierarchy, API client layer, state management, and interaction flows.

Key capabilities:

- **Dashboard** — Summary cards (income, expenses, net) with monthly bar chart and category pie chart
- **Upload** — Drag-and-drop file upload with explicit format selection, account-label selection for institution imports, a dedicated duplicate review route, client-side review filtering/sorting/pagination, and stateless finalize flow
- **Transactions** — Description substring search, multi-account filters, URL-backed sortable/paginated table, bulk tagging and bulk deletion via row selection
- **Transaction detail** — View and edit tags for a single transaction
- **Rules** — Create/edit/delete auto-tag rules with AND conditions, apply retroactively
- **Analytics** — Filterable charts: monthly bar, category pie, trend line, top-N table; drill-down to filtered transaction list
- **Settings** — Manage account labels

## Backend Functionality

The backend is a Hono REST API serving JSON over `/api`. See [backend/design.md](backend/design.md) for full API endpoint tables, database schema, request/response schemas, and implementation details.

Key capabilities:

- **Accounts** — CRUD for user-defined account labels (e.g. "TD Chequing")
- **Uploads** — Multipart file upload for generic CSV/JSON and supported Canadian institution CSV exports, parsing, duplicate detection, auto-tag on ingest
- **Transactions** — Description substring search, multi-account filtering, pagination, sorting, bulk tagging, bulk deletion
- **Tags** — User-scoped string tags, applied to transactions individually or in bulk
- **Auto-tag rules** — Condition-based rules (AND logic) that auto-apply tags; can run retroactively
- **Analytics** — Aggregation queries for monthly summaries, category breakdowns, trends, and top-N lists

### Data model highlights

- 7 tables: `users`, `accounts`, `transactions`, `tags`, `transaction_tags`, `auto_tag_rules`, `auto_tag_rule_conditions`
- A default user is seeded; all requests use a hardcoded user ID until auth is added
- Transaction list indexes support user/date and account lookups; description search currently uses case-insensitive substring matching
- Only CAD currency accepted for now (enforced at parse level)

## Cross-Cutting Concerns

### Error Handling

All errors returned as:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

Hono `onError` handler catches thrown errors and maps them to appropriate HTTP status codes.

### Default User Middleware

A Hono middleware injects `userId` into the request context using the hardcoded default user ID. When auth is added, this middleware is replaced with a real auth middleware — no route handler changes needed.

### Upload Format Normalization

The upload pipeline normalizes all supported source files into the canonical transaction shape before duplicate detection or insertion:

```json
{
  "date": "2026-04-14",
  "description": "Merchant description",
  "amount": "-42.18",
  "currency": "CAD",
  "account": "User-selected account label"
}
```

Supported upload formats are selected explicitly by the user:

- `generic_csv`
- `generic_json`
- `td_canada`
- `rbc_canada`
- `amex_canada`
- `cibc_canada`

Institution CSV uploads use a user-selected or user-entered account label. Generic CSV and JSON uploads keep using the row-level `account` field.

The canonical amount convention is:

- Expenses and charges are negative.
- Income, credits, refunds, and credit-card payments are positive.
- American Express Canada charges are inverted during parsing because the source export presents charges as positive values.
- Payments, credits, refunds, and transfers are imported rather than filtered out at upload time.

### Currency Validation

The backend rejects any transaction where `currency !== 'CAD'`. This is enforced at the file parsing stage (reject files with non-CAD currencies).
