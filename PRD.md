# Financial Tracker — Product Requirements Document

## Overview

A web application that lets users upload financial transactions from bank accounts, credit cards, and other sources, then search, categorize, and visualize their spending and income over time.

## Goals

- Give users a single place to aggregate transactions from multiple financial accounts.
- Make it easy to search, filter, and tag transactions for categorization.
- Provide clear visualizations (charts, trend lines, breakdowns) so users can understand where their money goes.

## User Personas

| Persona                       | Description                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Individual budget tracker** | Wants to import bank/credit-card CSVs monthly, tag recurring expenses, and see monthly spending breakdowns.          |
| **Freelancer**                | Tracks income from multiple clients alongside personal expenses; needs to separate business vs. personal categories. |
| **Household**                 | Multiple accounts (joint checking, individual cards); wants a combined view with per-account filtering.              |

## Core Features

### 1. Transaction Upload

- **Supported formats:** Generic CSV, generic JSON, TD Canada CSV, RBC Canada CSV, American Express Canada CSV, and CIBC CSV (extensible to OFX/QFX later).
- Users upload one file at a time and explicitly choose the source format before submitting. The app does not auto-detect institution formats for this iteration.
- Institution CSV uploads require a user-chosen **account label** (e.g. "TD Chequing", "CIBC Visa"). The upload page lets users select an existing account label from a dropdown to avoid typos, and also lets users type a new label when needed.
- Generic CSV and JSON uploads use the `account` field provided by each row. They do not require a separate account label because the account is part of the generic data schema.
- The system parses each file and extracts: **date, description, amount, currency, account**.
- **Currency:** Only CAD (Canadian Dollar) is accepted for now. Uploads containing other currencies are rejected. Institution CSV formats are treated as CAD-only. The schema supports multi-currency for future expansion.
- **Amount convention:** Expenses are stored as negative amounts and income, credits, refunds, and payments are stored as positive amounts. Institution parsers normalize source-specific signs into this model. American Express Canada charges are inverted because the export presents charges as positive values.
- Credit-card payments, bank credits, refunds, and transfers are imported rather than dropped so the database remains a source-of-truth ledger. Analytics can later exclude or filter these rows.
- Duplicate detection: warn when a transaction with the same date + amount + description already exists for that account. Uploads requiring duplicate review navigate to a dedicated review page where the user can skip all duplicates, accept all duplicates, or accept/skip duplicate rows individually or in bulk. Non-duplicate rows are included by default.
- Upload history: users can view past uploads and delete an entire upload batch if it was incorrect.

### 2. Transaction Search & Filtering

- Substring search across transaction descriptions.
- Filter by:
  - Date range (start / end).
  - Amount range (min / max).
  - Account label.
  - Tags / categories (include or exclude).
  - Transaction type: income (positive) or expense (negative).
- Results default to ascending date order, oldest first.
- Results are paginated and sortable by date, amount, description, or account label.
- The transaction list keeps search, filter, sort, page, and page size in URL query parameters so refresh, back/forward navigation, and shared links preserve the current view.
- Changing a filter or sort resets the list to page 1. Bulk selection applies only to rows on the currently loaded page.

### 3. Duplicate Upload Review

- Uploads that contain duplicate rows navigate to `/upload/duplicates` with a client-side review payload from the latest upload.
- Duplicate review defaults to ascending date order, oldest first.
- Users can switch review visibility between all uploaded rows, duplicates only, and non-duplicates only.
- Review rows are paginated and sortable by date, amount, description, account label, or duplicate status.
- Non-duplicate rows remain included by default. Duplicate-row accept/skip decisions persist while users filter, sort, and paginate the review table.
- Duplicate review remains stateless on the backend; finalization sends only the rows selected for insertion.

### 4. Data Deletion

- Users can deleted uploaded transactions.
  - They can use the search and filtering
    functionality to find transactions to delete.
  - Transactions can be deleted individually or in bulk by selecting
    multiple transactions and deleting them in one shot.

### 5. Tagging & Categorization

- Users can apply one or more **string tags** to any transaction (e.g. `groceries`, `rent`, `salary`).
- Bulk tagging: select multiple transactions from search results and apply/remove tags in one action.
- Auto-tag rules: users can define rules like "description contains 'WHOLE FOODS' -> tag `groceries`" that are applied automatically on future uploads and can be run retroactively.
- **Rule composition:** A single auto-tag rule can have multiple conditions combined with AND (all must match). Users achieve OR logic by creating separate rules that apply the same tag.

### 6. Visualization & Analytics

All charts are filterable by date range, account, and tags.

| Chart                  | Purpose                                                                          |
| ---------------------- | -------------------------------------------------------------------------------- |
| **Monthly bar chart**  | Total income vs. expenses per month for a selected year.                         |
| **Category pie chart** | Breakdown of expenses (or income) by tag for a given month or year.              |
| **Trend line chart**   | Month-over-month spending in a selected category (or total) over multiple years. |
| **Top-N table**        | Largest transactions in a period, or highest-spend categories.                   |

- Users can toggle between viewing expenses only, income only, or both.
- Drill-down: clicking a chart segment navigates to the filtered transaction list.

## Information Architecture

```
/                       -> Dashboard (summary cards + key charts)
/upload                 -> Upload transactions
/upload/duplicates      -> Review duplicate rows from the most recent upload
/transactions           -> Search & browse transactions
/transactions/:id       -> Single transaction detail (edit tags, notes)
/rules                  -> Auto-tag rule management
/analytics              -> Full analytics / charting page
/settings               -> Account labels, preferences
```

## Non-Functional Requirements

- **Auth:** Deferred. A default user is seeded in the database. All entities reference `user_id` so multi-tenancy can be added later without schema changes.
- **Performance:** Search results return in < 500 ms for up to 100k transactions per user.
- **File size:** Support uploads up to 10 MB per file.
- **Browser support:** Modern evergreen browsers (Chrome, Firefox, Safari, Edge).
- **Responsiveness:** Usable on desktop and tablet; mobile is a stretch goal.

## Deferred Features

- Uploading tagged data.
- Searching for untagged data.
- **Multi-currency:** Schema includes `currency` field; validation will be relaxed when ready.
- **Budgets:** Set spending limits per category per month with alerts.
- **OAuth / SSO:** Social login providers.
- **OFX/QFX import:** Additional bank export formats.
- **Mobile-first layout.**
