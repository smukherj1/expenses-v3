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

| Method | Path                    | Description                                                                                             |
| ------ | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| POST   | `/api/uploads`          | Classify selected-format upload file (multipart/form-data), create immediately when no duplicates exist |
| POST   | `/api/uploads/finalize` | Finalize reviewed rows from JSON payload, optionally allowing duplicates per row                        |

### Transactions

| Method | Path                            | Description                                                                                                                                                                                            |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/transactions`             | Search/filter transactions (query params: `q`, `dateFrom`, `dateTo`, `amountMin`, `amountMax`, `accountIds`, `accountId` for backward compatibility, `tags`, `type`, `sort`, `order`, `page`, `limit`) |
| GET    | `/api/transactions/:id`         | Get single transaction with tags                                                                                                                                                                       |
| PATCH  | `/api/transactions/:id`         | Update transaction (tags, description)                                                                                                                                                                 |
| POST   | `/api/transactions/bulk-tag`    | `{ transactionIds[], tagNames[], action: 'add' \| 'remove' }`                                                                                                                                          |
| POST   | `/api/transactions/bulk-delete` | `{ transactionIds[] }`                                                                                                                                                                                 |
| DELETE | `/api/transactions/:id`         | Delete transaction                                                                                                                                                                                     |

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
│   ├── csv.ts                # Generic CSV parser, column mapping
│   ├── json.ts               # Generic JSON array parsing, validation
│   └── institutions/
│       ├── types.ts          # Upload format enum and parser contract
│       ├── index.ts          # Parser registry
│       ├── tdCanada.ts       # TD Canada CSV parser
│       ├── rbcCanada.ts      # RBC Canada CSV parser
│       ├── amexCanada.ts     # American Express Canada CSV parser
│       └── cibcCanada.ts     # CIBC CSV parser
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

1. Accept `multipart/form-data` with a single file field plus upload metadata:
   - `file`: uploaded CSV or JSON file.
   - `format`: one of `generic_csv`, `generic_json`, `td_canada`, `rbc_canada`, `amex_canada`, `cibc_canada`.
   - `accountLabel`: required for institution CSV formats, ignored for generic CSV/JSON unless a later implementation chooses to support it as a fallback.
2. Validate that the selected format matches the uploaded file extension and expected file shape.
3. Parse file using the selected parser. The backend does not auto-detect institution formats in this iteration.
4. Validate every row:
   - `date`: must be a valid date.
   - `description`: non-empty string.
   - `amount`: valid number.
   - `currency`: must be `'CAD'` (or absent, defaults to `'CAD'`). Reject entire file if any row has a non-CAD currency.
5. Classify duplicates against the current database using `(date, amount, description, account)`.
6. If duplicates exist, return `status: "needs_review"` with parsed rows and duplicate flags.
7. If no duplicates exist, bulk-insert `accounts` rows for new accounts, insert `transactions`, apply auto-tag rules, and return `status: "completed"`.
8. No upload-review records or pending draft state are stored server-side.

Completed response:

```json
{
  "status": "completed",
  "format": "td_canada",
  "summary": {
    "inserted": 6,
    "duplicates": 0
  }
}
```

Review response:

```json
{
  "status": "needs_review",
  "format": "rbc_canada",
  "summary": {
    "inserted": 0,
    "duplicates": 2
  },
  "transactions": []
}
```

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

The service builds a dynamic Drizzle query with `where` conditions based on provided params.

Supported filters:

- `q`: case-insensitive substring match against `transactions.description`.
- `dateFrom` / `dateTo`: inclusive transaction date bounds.
- `amountMin` / `amountMax`: inclusive signed amount bounds.
- `accountIds`: comma-separated account ids. When present, this takes precedence over `accountId`.
- `accountId`: exact account id for backward-compatible links.
- `tags`: comma-separated tag names. Rows match when the transaction has any listed tag.
- `type`: `income` for amounts greater than 0, `expense` for amounts less than 0.

Supported sorting:

- `sort`: `date`, `amount`, `description`, or `account`; defaults to `date`.
- `order`: `asc` or `desc`; defaults to `asc`.
- Account sorting uses the joined account label.
- All list queries add `transactions.id ASC` as a secondary sort to keep pagination stable when multiple rows share the primary sort value.

The list response includes the joined `accountLabel` for each row and converts numeric database amounts to JavaScript numbers.

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

All parsers normalize source files into:

```typescript
interface ParsedTransaction {
  date: string; // yyyy-mm-dd
  description: string;
  amount: string; // canonical sign convention
  currency: "CAD";
  account: string;
}
```

Canonical amount convention:

- Expenses and charges are negative.
- Income, credits, refunds, and credit-card payments are positive.
- Source files are not filtered for payments, credits, refunds, or transfers. They are imported as source-of-truth ledger rows and can be excluded later in analytics.

### Generic CSV Parser (`parsers/csv.ts`)

Uses Papa Parse with:

- `header: true` — first row is column names.
- `skipEmptyLines: true`
- Column mapping: the parser attempts to match common column names:
  - Date: `date`, `Date`, `Transaction Date`, `Posted Date` — must be `yyyy-mm-dd`
  - Description: `description`, `Description`, `Memo`, `Name`
  - Amount: `amount`, `Amount`, `Debit`, `Credit` (if separate debit/credit columns, compute net as credit minus debit)
  - Currency: `currency`, `Currency` (optional, defaults to `'CAD'`)
  - Account: `account`, `Account`, `Account Name` — required for generic CSV

Returns: `ParsedTransaction[]` or throws with row-level errors.

### JSON Parser (`parsers/json.ts`)

Expects a JSON array of objects with the same canonical fields as generic CSV. Dates must be `yyyy-mm-dd`. Each row must include `account`. Validates each object with Zod.

### Institution Parser Registry

Institution parsers are selected by the explicit `format` field, not by automatic detection. They share helper functions for:

- Strict date normalization to `yyyy-mm-dd`.
- Monetary value normalization for currency symbols, commas, whitespace, and negative signs.
- Required account-label validation for institution formats.
- Row-numbered validation errors.

Supported institution formats:

| Format        | Source Shape                                                                                    | Date Rule                | Amount Rule                                                                       | Account Rule                                      |
| ------------- | ----------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| `td_canada`   | Headerless columns: date, description, debit, credit, balance                                   | Already `yyyy-mm-dd`     | `credit - debit`                                                                  | Use `accountLabel`                                |
| `rbc_canada`  | Headered columns including `Transaction Date`, `Description 1`, `Description 2`, `CAD$`, `USD$` | Normalize `M/D/YYYY`     | Use signed `CAD$` value                                                           | Use `accountLabel`; do not persist account number |
| `amex_canada` | Headered columns including `Date`, `Description`, `Amount`                                      | Normalize `DD Mon. YYYY` | Invert source sign so charges become negative and payment credits become positive | Use `accountLabel`                                |
| `cibc_canada` | Headerless columns: date, description, debit, credit, card number                               | Already `yyyy-mm-dd`     | `credit - debit`                                                                  | Use `accountLabel`; do not persist card number    |

Institution uploads reject non-CAD columns or values. RBC rows with populated `USD$` are rejected while CAD-only rows are accepted.

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
