# Financial Tracker — Product Requirements Document

## Overview

A web application that lets users upload financial transactions from bank accounts, credit cards, and other sources, then search, categorize, and visualize their spending and income over time.

## Goals

- Give users a single place to aggregate transactions from multiple financial accounts.
- Make it easy to search, filter, and tag transactions for categorization.
- Provide clear visualizations (charts, trend lines, breakdowns) so users can understand where their money goes.

## User Personas

| Persona | Description |
|---|---|
| **Individual budget tracker** | Wants to import bank/credit-card CSVs monthly, tag recurring expenses, and see monthly spending breakdowns. |
| **Freelancer** | Tracks income from multiple clients alongside personal expenses; needs to separate business vs. personal categories. |
| **Household** | Multiple accounts (joint checking, individual cards); wants a combined view with per-account filtering. |

## Core Features

### 1. Transaction Upload

- **Supported formats:** CSV, JSON (extensible to OFX/QFX later).
- Users upload one or more files at a time; each upload is tied to a user-chosen **account label** (e.g. "TD Chequing", "CIBC Visa").
- The system parses each file and extracts: **date, description, amount**.
- **Currency:** Only CAD (Canadian Dollar) is accepted for now. Uploads containing other currencies are rejected. The schema supports multi-currency for future expansion.
- Duplicate detection: warn when a transaction with the same date + amount + description already exists for that account.
- Upload history: users can view past uploads and delete an entire upload batch if it was incorrect.

### 2. Transaction Search & Filtering

- Full-text search across transaction descriptions.
- Filter by:
  - Date range (start / end).
  - Amount range (min / max).
  - Account label.
  - Tags / categories (include or exclude).
  - Transaction type: income (positive) or expense (negative).
- Results are paginated and sortable by date, amount, or description.

### 3. Tagging & Categorization

- Users can apply one or more **string tags** to any transaction (e.g. `groceries`, `rent`, `salary`).
- Bulk tagging: select multiple transactions from search results and apply/remove tags in one action.
- Auto-tag rules: users can define rules like "description contains 'WHOLE FOODS' -> tag `groceries`" that are applied automatically on future uploads and can be run retroactively.
- **Rule composition:** A single auto-tag rule can have multiple conditions combined with AND (all must match). Users achieve OR logic by creating separate rules that apply the same tag.

### 4. Visualization & Analytics

All charts are filterable by date range, account, and tags.

| Chart | Purpose |
|---|---|
| **Monthly bar chart** | Total income vs. expenses per month for a selected year. |
| **Category pie chart** | Breakdown of expenses (or income) by tag for a given month or year. |
| **Trend line chart** | Month-over-month spending in a selected category (or total) over multiple years. |
| **Top-N table** | Largest transactions in a period, or highest-spend categories. |

- Users can toggle between viewing expenses only, income only, or both.
- Drill-down: clicking a chart segment navigates to the filtered transaction list.

## Information Architecture

```
/                       -> Dashboard (summary cards + key charts)
/upload                 -> Upload transactions
/transactions           -> Search & browse transactions
/transactions/:id       -> Single transaction detail (edit tags, notes)
/rules                  -> Auto-tag rule management
/analytics              -> Full analytics / charting page
/settings               -> Account labels, preferences
```

## Data Model (Conceptual)

```
User
  id          UUID
  name        string
  email       string        -- unique
  created_at  timestamp
  -- A default user is seeded; auth is added later.

Account
  id          UUID
  user_id     UUID (FK -> User)
  label       string        -- e.g. "TD Chequing"
  created_at  timestamp

Transaction
  id          UUID
  account_id  UUID (FK -> Account)
  upload_id   UUID (FK -> Upload)   -- nullable, for manual entries later
  date        date
  description string
  amount      decimal       -- positive = income, negative = expense
  currency    string        -- default "CAD"; only "CAD" accepted for now
  created_at  timestamp

Tag
  id          UUID
  user_id     UUID (FK -> User)
  name        string        -- unique per user

TransactionTag            -- join table
  transaction_id  UUID (FK)
  tag_id          UUID (FK)

Upload
  id          UUID
  account_id  UUID (FK -> Account)
  filename    string
  row_count   integer
  uploaded_at timestamp

AutoTagRule
  id          UUID
  user_id     UUID (FK -> User)
  tag_id      UUID (FK -> Tag)

AutoTagRuleCondition      -- one rule has 1..N conditions, all must match (AND)
  id          UUID
  rule_id     UUID (FK -> AutoTagRule)
  match_field enum(description, amount)
  match_type  enum(contains, exact, regex, gt, lt)
  match_value string
```

## Non-Functional Requirements

- **Auth:** Deferred. A default user is seeded in the database. All entities reference `user_id` so multi-tenancy can be added later without schema changes.
- **Performance:** Search results return in < 500 ms for up to 100k transactions per user.
- **File size:** Support uploads up to 10 MB per file.
- **Browser support:** Modern evergreen browsers (Chrome, Firefox, Safari, Edge).
- **Responsiveness:** Usable on desktop and tablet; mobile is a stretch goal.

## Milestones

| # | Milestone | Scope |
|---|---|---|
| 1 | **Upload & Store** | Account creation, file upload (CSV/JSON), parsing, transaction storage, duplicate warnings. |
| 2 | **Search & Tag** | Transaction list with search/filter, manual tagging, bulk tagging. |
| 3 | **Visualize** | Dashboard with monthly bar chart, category pie chart, trend line, top-N table. |
| 4 | **Auto-tag Rules** | Rule CRUD with AND conditions, retroactive application, auto-apply on upload. |
| 5 | **Auth & Multi-user** | User registration/login, replace default user with real auth. |
| 6 | **Polish & Deploy** | Responsive layout, error handling, Docker production config, CI. |

## Deferred Features

- **Multi-currency:** Schema includes `currency` field; validation will be relaxed when ready.
- **Budgets:** Set spending limits per category per month with alerts.
- **OAuth / SSO:** Social login providers.
- **OFX/QFX import:** Additional bank export formats.
- **Mobile-first layout.**
