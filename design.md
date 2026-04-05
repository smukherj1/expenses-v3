# Financial Tracker — Architecture & Design

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| **Frontend** | React 19 + TypeScript, Vite 8, React Router 7 | Fast dev server, file-based or config-based routing, modern React features. |
| **Charts** | Recharts | Composable, declarative charting built on React + D3. |
| **Backend** | Hono + TypeScript | Lightweight, fast, runs on Node.js. Built-in middleware ecosystem. |
| **Validation** | Zod + `@hono/zod-validator` | Shared schema definitions for request/response validation and OpenAPI generation. |
| **Database** | PostgreSQL 16 | Full-text search, date/range queries, aggregate functions. |
| **ORM** | Drizzle ORM | Type-safe queries, lightweight, SQL-first philosophy. |
| **File parsing** | Papa Parse (CSV), native `JSON.parse` | Papa Parse handles edge cases (quoted fields, BOM, etc). |
| **Containerization** | Docker Compose | PostgreSQL + backend + frontend in one `docker compose up`. |

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
├── PRD.md
├── design.md
├── docker-compose.yml
├── frontend/
│   ├── design.md              # Detailed frontend design
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── routes/            # React Router route components
│       ├── components/        # Shared UI components
│       ├── hooks/             # Custom React hooks
│       ├── api/               # API client functions
│       └── types/             # Shared TypeScript types
├── backend/
│   ├── design.md              # Detailed backend design
│   ├── package.json
│   └── src/
│       ├── index.ts           # Hono app entry point
│       ├── routes/            # Route handlers
│       ├── middleware/         # Custom middleware
│       ├── db/
│       │   ├── schema.ts      # Drizzle schema definitions
│       │   ├── migrate.ts     # Migration runner
│       │   └── seed.ts        # Default user seed
│       ├── services/          # Business logic
│       ├── parsers/           # CSV/JSON file parsers
│       └── schemas/           # Zod request/response schemas
└── shared/                    # (optional) Types shared between FE/BE
```

## Database Schema (Drizzle)

Detailed column types and constraints:

```
users
  id          uuid        PK, default gen_random_uuid()
  name        varchar(255)
  email       varchar(255) UNIQUE NOT NULL
  created_at  timestamp   default now()

accounts
  id          uuid        PK, default gen_random_uuid()
  user_id     uuid        FK -> users.id ON DELETE CASCADE
  label       varchar(255) NOT NULL
  created_at  timestamp   default now()
  UNIQUE(user_id, label)

uploads
  id          uuid        PK, default gen_random_uuid()
  account_id  uuid        FK -> accounts.id ON DELETE CASCADE
  filename    varchar(512) NOT NULL
  row_count   integer     NOT NULL default 0
  uploaded_at timestamp   default now()

transactions
  id          uuid        PK, default gen_random_uuid()
  account_id  uuid        FK -> accounts.id ON DELETE CASCADE
  upload_id   uuid        FK -> uploads.id ON DELETE SET NULL, nullable
  date        date        NOT NULL
  description text        NOT NULL
  amount      numeric(12,2) NOT NULL  -- positive = income, negative = expense
  currency    varchar(3)  NOT NULL default 'CAD'  -- CHECK (currency = 'CAD') for now
  created_at  timestamp   default now()
  INDEX(account_id, date)
  INDEX(description) using GIN (to_tsvector)  -- full-text search

tags
  id          uuid        PK, default gen_random_uuid()
  user_id     uuid        FK -> users.id ON DELETE CASCADE
  name        varchar(100) NOT NULL
  UNIQUE(user_id, name)

transaction_tags
  transaction_id  uuid    FK -> transactions.id ON DELETE CASCADE
  tag_id          uuid    FK -> tags.id ON DELETE CASCADE
  PRIMARY KEY (transaction_id, tag_id)

auto_tag_rules
  id          uuid        PK, default gen_random_uuid()
  user_id     uuid        FK -> users.id ON DELETE CASCADE
  tag_id      uuid        FK -> tags.id ON DELETE CASCADE

auto_tag_rule_conditions
  id          uuid        PK, default gen_random_uuid()
  rule_id     uuid        FK -> auto_tag_rules.id ON DELETE CASCADE
  match_field varchar(20) NOT NULL  -- 'description' | 'amount'
  match_type  varchar(20) NOT NULL  -- 'contains' | 'exact' | 'regex' | 'gt' | 'lt'
  match_value text        NOT NULL
```

### Seed Data

On first migration, seed a default user:

```
users: { id: '00000000-0000-0000-0000-000000000001', name: 'Default User', email: 'default@local' }
```

All API requests use this hardcoded user ID until auth is implemented.

## API Design

Base path: `/api`

### Accounts
| Method | Path | Description |
|---|---|---|
| GET | `/api/accounts` | List accounts for current user |
| POST | `/api/accounts` | Create account `{ label }` |
| DELETE | `/api/accounts/:id` | Delete account and its transactions |

### Uploads
| Method | Path | Description |
|---|---|---|
| POST | `/api/accounts/:accountId/upload` | Upload file (multipart/form-data) |
| GET | `/api/uploads` | List uploads (filterable by account) |
| DELETE | `/api/uploads/:id` | Delete upload and its transactions |

### Transactions
| Method | Path | Description |
|---|---|---|
| GET | `/api/transactions` | Search/filter transactions (query params: `q`, `dateFrom`, `dateTo`, `amountMin`, `amountMax`, `accountId`, `tags`, `type`, `sort`, `page`, `limit`) |
| GET | `/api/transactions/:id` | Get single transaction with tags |
| PATCH | `/api/transactions/:id` | Update transaction (tags, description) |
| POST | `/api/transactions/bulk-tag` | `{ transactionIds[], tagNames[], action: 'add' | 'remove' }` |

### Tags
| Method | Path | Description |
|---|---|---|
| GET | `/api/tags` | List tags for current user |
| POST | `/api/tags` | Create tag `{ name }` |
| DELETE | `/api/tags/:id` | Delete tag (removes from all transactions) |

### Auto-Tag Rules
| Method | Path | Description |
|---|---|---|
| GET | `/api/rules` | List rules for current user |
| POST | `/api/rules` | Create rule `{ conditions[], tagId }` |
| PUT | `/api/rules/:id` | Update rule |
| DELETE | `/api/rules/:id` | Delete rule |
| POST | `/api/rules/:id/apply` | Retroactively apply rule to existing transactions |
| POST | `/api/rules/apply-all` | Apply all rules to existing transactions |

### Analytics
| Method | Path | Description |
|---|---|---|
| GET | `/api/analytics/monthly-summary` | `?year` -> income/expense totals per month |
| GET | `/api/analytics/category-breakdown` | `?year&month` -> amount per tag |
| GET | `/api/analytics/trend` | `?tag&months` -> monthly amounts for a category over time |
| GET | `/api/analytics/top-transactions` | `?n&dateFrom&dateTo&type` -> largest transactions |

## Cross-Cutting Concerns

### Error Handling

All errors returned as:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

Hono `onError` handler catches thrown errors and maps them to appropriate HTTP status codes.

### Default User Middleware

A Hono middleware injects `userId` into the request context using the hardcoded default user ID. When auth is added, this middleware is replaced with a real auth middleware — no route handler changes needed.

### Currency Validation

The backend rejects any transaction where `currency !== 'CAD'`. This is enforced at:
1. File parsing stage (reject files with non-CAD currencies).
2. Database level (CHECK constraint).
