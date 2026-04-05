# Backend — Detailed Design

## Stack

- **Hono** — HTTP framework (runs on Node.js)
- **Zod** + `@hono/zod-validator` — request/response validation
- **Drizzle ORM** + `drizzle-kit` — type-safe DB queries and migrations
- **Papa Parse** — CSV parsing
- **Node.js 22** — runtime

## API Endpoints

Base path: `/api`

### Accounts

| Method | Path                | Description                         |
| ------ | ------------------- | ----------------------------------- |
| GET    | `/api/accounts`     | List accounts for current user      |
| POST   | `/api/accounts`     | Create account `{ label }`          |
| DELETE | `/api/accounts/:id` | Delete account and its transactions |

### Uploads

| Method | Path                              | Description                          |
| ------ | --------------------------------- | ------------------------------------ |
| POST   | `/api/accounts/:accountId/upload` | Upload file (multipart/form-data)    |
| GET    | `/api/uploads`                    | List uploads (filterable by account) |
| DELETE | `/api/uploads/:id`                | Delete upload and its transactions   |

### Transactions

| Method | Path                         | Description                                                                                                                                          |
| ------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/transactions`          | Search/filter transactions (query params: `q`, `dateFrom`, `dateTo`, `amountMin`, `amountMax`, `accountId`, `tags`, `type`, `sort`, `page`, `limit`) |
| GET    | `/api/transactions/:id`      | Get single transaction with tags                                                                                                                     |
| PATCH  | `/api/transactions/:id`      | Update transaction (tags, description)                                                                                                               |
| POST   | `/api/transactions/bulk-tag` | `{ transactionIds[], tagNames[], action: 'add' \| 'remove' }`                                                                                       |

### Tags

| Method | Path            | Description                                |
| ------ | --------------- | ------------------------------------------ |
| GET    | `/api/tags`     | List tags for current user                 |
| POST   | `/api/tags`     | Create tag `{ name }`                      |
| DELETE | `/api/tags/:id` | Delete tag (removes from all transactions) |

### Auto-Tag Rules

| Method | Path                   | Description                                       |
| ------ | ---------------------- | ------------------------------------------------- |
| GET    | `/api/rules`           | List rules for current user                       |
| POST   | `/api/rules`           | Create rule `{ conditions[], tagId }`             |
| PUT    | `/api/rules/:id`       | Update rule                                       |
| DELETE | `/api/rules/:id`       | Delete rule                                       |
| POST   | `/api/rules/:id/apply` | Retroactively apply rule to existing transactions |
| POST   | `/api/rules/apply-all` | Apply all rules to existing transactions          |

### Analytics

| Method | Path                                | Description                                               |
| ------ | ----------------------------------- | --------------------------------------------------------- |
| GET    | `/api/analytics/monthly-summary`    | `?year` -> income/expense totals per month                |
| GET    | `/api/analytics/category-breakdown` | `?year&month` -> amount per tag                           |
| GET    | `/api/analytics/trend`              | `?tag&months` -> monthly amounts for a category over time |
| GET    | `/api/analytics/top-transactions`   | `?n&dateFrom&dateTo&type` -> largest transactions         |

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

## Entry Point

`src/index.ts` creates the Hono app, registers middleware, mounts route groups, and starts the server.

```typescript
// Pseudocode
const app = new Hono()
app.use('*', defaultUserMiddleware)
app.route('/api/accounts', accountRoutes)
app.route('/api/uploads', uploadRoutes)
app.route('/api/transactions', transactionRoutes)
app.route('/api/tags', tagRoutes)
app.route('/api/rules', ruleRoutes)
app.route('/api/analytics', analyticsRoutes)
```

## Source Layout

```
backend/src/
├── index.ts                  # App setup, middleware, route mounting
├── routes/
│   ├── accounts.ts           # CRUD for accounts
│   ├── uploads.ts            # File upload + parsing
│   ├── transactions.ts       # Search, detail, update, bulk-tag
│   ├── tags.ts               # CRUD for tags
│   ├── rules.ts              # CRUD + apply for auto-tag rules
│   └── analytics.ts          # Aggregation queries for charts
├── middleware/
│   ├── defaultUser.ts        # Injects userId into context
│   └── errorHandler.ts       # Maps errors to { error: { code, message } }
├── db/
│   ├── index.ts              # Drizzle client + connection pool
│   ├── schema.ts             # All table definitions
│   ├── migrate.ts            # Run migrations
│   └── seed.ts               # Seed default user
├── services/
│   ├── accountService.ts
│   ├── uploadService.ts      # Orchestrates parsing + insert + duplicate check
│   ├── transactionService.ts # Search with filters, bulk ops
│   ├── tagService.ts
│   ├── ruleService.ts        # Rule matching engine
│   └── analyticsService.ts   # Aggregation queries
├── parsers/
│   ├── csv.ts                # Papa Parse wrapper, column mapping
│   └── json.ts               # JSON array parsing, validation
└── schemas/
    ├── account.ts            # Zod schemas for account endpoints
    ├── upload.ts
    ├── transaction.ts
    ├── tag.ts
    ├── rule.ts
    └── analytics.ts
```

## Middleware

### Default User Middleware (`defaultUser.ts`)

```typescript
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

export const defaultUserMiddleware = createMiddleware(async (c, next) => {
  c.set('userId', DEFAULT_USER_ID)
  await next()
})
```

When auth is added, this is swapped for a real auth middleware that extracts `userId` from a JWT/session. Route handlers only ever read `c.get('userId')`, so no other changes are needed.

### Error Handler (`errorHandler.ts`)

Catches errors and returns structured JSON:

| Error Type | HTTP Status | Code |
|---|---|---|
| `ZodError` | 400 | `VALIDATION_ERROR` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ConflictError` | 409 | `CONFLICT` (duplicates) |
| `UnsupportedCurrencyError` | 422 | `UNSUPPORTED_CURRENCY` |
| Unhandled | 500 | `INTERNAL_ERROR` |

## Route Handlers — Detail

### `POST /api/accounts/:accountId/upload`

1. Accept `multipart/form-data` with a single file field.
2. Detect format from file extension (`.csv` or `.json`).
3. Parse file using the appropriate parser.
4. Validate every row:
   - `date`: must be a valid date.
   - `description`: non-empty string.
   - `amount`: valid number.
   - `currency`: must be `'CAD'` (or absent, defaults to `'CAD'`). Reject entire file if any row has a non-CAD currency.
5. Check for duplicates: query existing transactions for this account where `(date, amount, description)` matches.
6. Insert an `uploads` row, then bulk-insert `transactions`.
7. Run auto-tag rules against the newly inserted transactions.
8. Return: `{ uploadId, inserted: N, duplicatesSkipped: N, duplicateWarnings: [...] }`.

### `GET /api/transactions`

Query params validated by Zod:

```typescript
z.object({
  q: z.string().optional(),               // full-text search
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  amountMin: z.coerce.number().optional(),
  amountMax: z.coerce.number().optional(),
  accountId: z.string().uuid().optional(),
  tags: z.string().optional(),             // comma-separated tag names
  type: z.enum(['income', 'expense']).optional(),
  sort: z.enum(['date', 'amount', 'description']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
```

The service builds a dynamic Drizzle query with `where` conditions based on provided params. Full-text search uses PostgreSQL `to_tsvector` / `plainto_tsquery`.

Returns: `{ data: Transaction[], total: number, page, limit }`.

### `POST /api/transactions/bulk-tag`

```typescript
z.object({
  transactionIds: z.array(z.string().uuid()).min(1),
  tagNames: z.array(z.string().min(1)).min(1),
  action: z.enum(['add', 'remove']),
})
```

- `add`: creates tags if they don't exist, inserts into `transaction_tags` (ON CONFLICT DO NOTHING).
- `remove`: deletes matching rows from `transaction_tags`.

### `POST /api/rules`

```typescript
z.object({
  tagId: z.string().uuid(),
  conditions: z.array(z.object({
    matchField: z.enum(['description', 'amount']),
    matchType: z.enum(['contains', 'exact', 'regex', 'gt', 'lt']),
    matchValue: z.string().min(1),
  })).min(1),
})
```

All conditions are AND-ed. To achieve OR, users create multiple rules for the same tag.

### `POST /api/rules/:id/apply`

1. Load the rule and its conditions.
2. Query all transactions for the user.
3. For each transaction, evaluate all conditions (AND). If all match, insert into `transaction_tags`.
4. Return: `{ matched: N, tagged: N }`.

## File Parsers

### CSV Parser (`parsers/csv.ts`)

Uses Papa Parse with:
- `header: true` — first row is column names.
- `skipEmptyLines: true`
- Column mapping: the parser attempts to match common column names:
  - Date: `date`, `Date`, `Transaction Date`, `Posted Date`
  - Description: `description`, `Description`, `Memo`, `Name`
  - Amount: `amount`, `Amount`, `Debit`, `Credit` (if separate debit/credit columns, compute net)
  - Currency: `currency`, `Currency` (optional, defaults to `'CAD'`)

Returns: `ParsedTransaction[]` or throws with row-level errors.

### JSON Parser (`parsers/json.ts`)

Expects a JSON array of objects with the same field mapping as CSV. Validates each object with Zod.

## Auto-Tag Rule Engine (`services/ruleService.ts`)

The rule matching engine:

```
function matchesRule(transaction, rule): boolean
  for each condition in rule.conditions:
    if not matchesCondition(transaction, condition):
      return false   // AND: all must match
  return true

function matchesCondition(transaction, condition): boolean
  value = transaction[condition.matchField]
  switch condition.matchType:
    'contains': return value.toLowerCase().includes(condition.matchValue.toLowerCase())
    'exact':    return value === condition.matchValue
    'regex':    return new RegExp(condition.matchValue, 'i').test(value)
    'gt':       return parseFloat(value) > parseFloat(condition.matchValue)
    'lt':       return parseFloat(value) < parseFloat(condition.matchValue)
```

## Analytics Queries

All analytics queries filter by `user_id` (via account ownership) and accept optional date/account/tag filters.

### `GET /api/analytics/monthly-summary?year=2025`

```sql
SELECT
  EXTRACT(MONTH FROM t.date) AS month,
  SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS income,
  SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END) AS expenses
FROM transactions t
JOIN accounts a ON t.account_id = a.id
WHERE a.user_id = $1 AND EXTRACT(YEAR FROM t.date) = $2
GROUP BY month
ORDER BY month
```

### `GET /api/analytics/category-breakdown?year=2025&month=3`

```sql
SELECT tg.name AS tag, SUM(ABS(t.amount)) AS total
FROM transactions t
JOIN transaction_tags tt ON t.id = tt.transaction_id
JOIN tags tg ON tt.tag_id = tg.id
JOIN accounts a ON t.account_id = a.id
WHERE a.user_id = $1
  AND EXTRACT(YEAR FROM t.date) = $2
  AND EXTRACT(MONTH FROM t.date) = $3
  AND t.amount < 0  -- expenses by default
GROUP BY tg.name
ORDER BY total DESC
```

### `GET /api/analytics/trend?tag=groceries&months=12`

Returns the last N months of spending for a given tag.

### `GET /api/analytics/top-transactions?n=10&type=expense`

Returns the N largest transactions (by absolute amount) in a date range.
