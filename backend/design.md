# Backend — Detailed Design

## Stack

- **Hono** — HTTP framework (runs on Node.js)
- **Zod** + `@hono/zod-validator` — request/response validation
- **Drizzle ORM** + `drizzle-kit` — type-safe DB queries and migrations
- **Papa Parse** — CSV parsing
- **Bun** — runtime

## API Endpoints

Base path: `/api`

### Accounts

| Method | Path                | Description                         |
| ------ | ------------------- | ----------------------------------- |
| GET    | `/api/accounts`     | List accounts for current user      |
| DELETE | `/api/accounts/:id` | Delete account and its transactions |

### Uploads

| Method | Path                    | Description                                                                             |
| ------ | ----------------------- | --------------------------------------------------------------------------------------- |
| POST   | `/api/uploads`          | Classify upload file (multipart/form-data), create immediately when no duplicates exist |
| POST   | `/api/uploads/finalize` | Finalize reviewed rows from JSON payload, optionally allowing duplicates per row        |

### Transactions

| Method | Path                            | Description                                                                                                                                          |
| ------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/transactions`             | Search/filter transactions (query params: `q`, `dateFrom`, `dateTo`, `amountMin`, `amountMax`, `accountId`, `tags`, `type`, `sort`, `page`, `limit`) |
| GET    | `/api/transactions/:id`         | Get single transaction with tags                                                                                                                     |
| PATCH  | `/api/transactions/:id`         | Update transaction (tags, description)                                                                                                               |
| POST   | `/api/transactions/bulk-tag`    | `{ transactionIds[], tagNames[], action: 'add' \| 'remove' }`                                                                                        |
| POST   | `/api/transactions/bulk-delete` | `{ transactionIds[] }`                                                                                                                               |
| DELETE | `/api/transactions/:id`         | Delete transaction                                                                                                                                   |

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

Source of truth for db schema is in `src/db/schema.ts`.

### Seed Data

On first migration, seed a default user:

```
users: { id: '00000000-0000-0000-0000-000000000001', name: 'Default User', email: 'default@local' }
```

All API requests use this hardcoded user ID until auth is implemented.

## Entry Point

`src/index.ts` creates the Hono app, registers middleware, mounts route groups, and starts the server.

## Source Layout

```
backend/src/
├── index.ts                  # App setup, middleware, route mounting
├── routes/
│   ├── accounts.ts           # CRUD for accounts
│   ├── uploads.ts            # File upload + parsing
│   ├── transactions.ts       # Search, detail, update, bulk-tag, bulk-delete
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
const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

export const defaultUserMiddleware = createMiddleware(async (c, next) => {
  c.set("userId", DEFAULT_USER_ID);
  await next();
});
```

When auth is added, this is swapped for a real auth middleware that extracts `userId` from a JWT/session. Route handlers only ever read `c.get('userId')`, so no other changes are needed.

### Error Handler (`errorHandler.ts`)

Catches errors and returns structured JSON:

| Error Type                 | HTTP Status | Code                    |
| -------------------------- | ----------- | ----------------------- |
| `ZodError`                 | 400         | `VALIDATION_ERROR`      |
| `NotFoundError`            | 404         | `NOT_FOUND`             |
| `ConflictError`            | 409         | `CONFLICT` (duplicates) |
| `UnsupportedCurrencyError` | 422         | `UNSUPPORTED_CURRENCY`  |
| Unhandled                  | 500         | `INTERNAL_ERROR`        |

## Route Handlers — Detail

### `POST /api/uploads`

1. Accept `multipart/form-data` with a single file field.
2. Detect format from file extension (`.csv` or `.json`).
3. Parse file using the appropriate parser.
4. Validate every row:
   - `date`: must be a valid date.
   - `description`: non-empty string.
   - `amount`: valid number.
   - `currency`: must be `'CAD'` (or absent, defaults to `'CAD'`). Reject entire file if any row has a non-CAD currency.
5. Classify duplicates against the current database using `(date, amount, description, account)`.
6. If duplicates exist, return `status: "needs_review"` with parsed rows and duplicate flags.
7. If no duplicates exist, bulk-insert `accounts` rows for new accounts, insert `transactions`, apply auto-tag rules, and return `status: "completed"`.
8. No upload-review records or pending draft state are stored server-side.

### `POST /api/uploads/finalize`

1. Accept JSON `{ transactions: [...] }`.
2. Validate each row and reject non-CAD currencies.
3. Recompute duplicate status against the current database.
4. Reject any duplicate row unless it includes `allowDuplicate: true`.
5. Create any missing accounts, insert the selected rows, and apply auto-tag rules to inserted transactions only.
6. Return `{ status: "completed", inserted: N, duplicates: N }`.

### Duplicate Review Contract

- The backend remains stateless during review; there is no persisted upload draft or review session.
- `POST /api/uploads` may return a large `needs_review` payload, and the frontend paginates it client-side on `/upload/duplicates`.
- The frontend is responsible for remembering the user'"'"'s review decisions until finalize is submitted.

### `GET /api/transactions`

Query params validated by Zod schema `src/schemas/transaction.ts`.

The service builds a dynamic Drizzle query with `where` conditions based on provided params. Full-text search uses PostgreSQL `to_tsvector` / `plainto_tsquery`.

Returns: `{ data: Transaction[], total: number, page, limit }`.

### `POST /api/transactions/bulk-tag`

Query params validated by Zod schema `src/schemas/transaction.ts`.

- `add`: creates tags if they don't exist, inserts into `transaction_tags` (ON CONFLICT DO NOTHING).
- `remove`: deletes matching rows from `transaction_tags`.

### `POST /api/transactions/bulk-delete`

1. Validate `transactionIds` as a non-empty array of UUIDs.
2. Load all transactions owned by the current user that match the requested ids.
3. If any requested id is missing or unauthorized, return `404` and delete nothing.
4. Delete the matching transactions in one statement.
5. Return `{ deleted: N }`.

### `POST /api/rules`

Query params validated by Zod schema `src/schemas/rules.ts`.
Upload a rule with one or more conditions AND-ed to decide whether to apply a tag
to a user's transactions. To achieve OR, users create multiple rules for the same tag.

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
  - Date: `date`, `Date`, `Transaction Date`, `Posted Date` — must be `yyyy-mm-dd`
  - Description: `description`, `Description`, `Memo`, `Name`
  - Amount: `amount`, `Amount`, `Debit`, `Credit` (if separate debit/credit columns, compute net)
  - Currency: `currency`, `Currency` (optional, defaults to `'CAD'`)

Returns: `ParsedTransaction[]` or throws with row-level errors.

### JSON Parser (`parsers/json.ts`)

Expects a JSON array of objects with the same field mapping as CSV. Dates must be `yyyy-mm-dd`. Validates each object with Zod.

## Auto-Tag Rule Engine (`services/ruleService.ts`)

Funtionality to:

- Match tagging rules on transactions.
- CRUD methods on tagging rules.
- Applying tagging rules on transactions.

## Analytics Queries

All analytics queries filter by `user_id` (via account ownership) and accept optional date/account/tag filters.

### `GET /api/analytics/monthly-summary?year=2025`

Returns a monthly summary of income and expenses for the requested year and user.

### `GET /api/analytics/category-breakdown?year=2025&month=3`

Returns a breakdown of total transaction amounts by tag for requested year, month and user.

### `GET /api/analytics/trend?tag=groceries&months=12`

Returns the last N months of spending for a given tag.

### `GET /api/analytics/top-transactions?n=10&type=expense`

Returns the N largest transactions (by absolute amount) in a date range.
