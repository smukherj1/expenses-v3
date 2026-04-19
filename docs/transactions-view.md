# Transactions View Update Plan

## Scope

This document proposes product, technical design, and end-to-end test updates for:

- `/transactions`: persisted transaction search and browse page.
- `/upload/duplicates`: duplicate upload review page.

Both pages render transaction-like rows with pagination, sorting, and filtering needs. They differ in data ownership:

- `/transactions` is backed by `GET /api/transactions` and should keep server-side pagination, filtering, and sorting.
- `/upload/duplicates` receives a stateless upload review payload from `POST /api/uploads`, stores it client-side, and should keep client-side pagination, filtering, and sorting unless the upload review contract changes.

## PRD Update

### Goals

- Provide a consistent transaction table experience across search and duplicate review.
- Default transaction ordering should be increasing by date, oldest first.
- Allow users to sort visible transaction lists by clicking sortable column headers.
- Expose core transaction filters in the transactions search page:
  - Date range.
  - Description search.
  - Amount range.
  - Account label.
- Expose duplicate-review visibility filters:
  - Non-duplicates only.
  - Duplicates only.
  - All uploaded rows.
- Preserve duplicate review as a stateless finalize flow unless a separate server-side review session is introduced.

### User Stories

- As a user browsing transactions, I can see results in chronological order by default so imported ledgers read naturally from oldest to newest.
- As a user browsing transactions, I can click a column header to sort by date, description, amount, or account in ascending or descending order.
- As a user searching transactions, I can filter by date range, description, amount range, and account label so I can find a narrow subset before tagging or deleting.
- As a user reviewing duplicates, I can focus the review list on only duplicates, only non-duplicates, or all rows so large uploads are easier to triage.
- As a user reviewing duplicates, I can apply the same sort and display conventions as the transactions page so duplicate review feels like the same product surface.

### Functional Requirements

#### Transactions Page

- Default query state:
  - `sort=date`.
  - `order=asc`.
  - `page=1`.
  - `limit=50`.
- Search and filters:
  - Description search maps to `q`.
  - Date range maps to `dateFrom` and `dateTo`.
  - Amount range maps to `amountMin` and `amountMax`.
  - Account label should be exposed in the UI and map to an account identifier accepted by the backend.
  - Existing type/tag filters should remain compatible with the new shared filter model.
- Sorting:
  - Date, description, amount, and account headers should be clickable if shown.
  - First click on an unsorted column applies ascending sort.
  - Clicking the active column toggles ascending/descending.
  - Changing sort resets `page` to `1`.
  - Sort state should be represented in URL search params so refresh/back/share preserve state.
- Pagination:
  - Continue using server-side pagination from `GET /api/transactions`.
  - Changing filters or sort resets to page `1`.
  - Bulk selection remains scoped to the currently loaded page unless explicitly expanded in a future bulk-action design.

#### Duplicate Review Page

- Default list state:
  - `sort=date`.
  - `order=asc`.
  - `page=1`.
  - Existing page-size control remains.
  - Duplicate visibility defaults to `all`.
- Visibility filter:
  - `all`: show every uploaded row.
  - `duplicates`: show rows with `duplicate === true`.
  - `nonDuplicates`: show rows with `duplicate === false`.
- Sorting:
  - Date, description, amount, account, and duplicate status headers should be sortable.
  - Sorting is applied to the in-memory review rows before pagination.
  - Changing duplicate visibility or sort resets `page` to `1`.
- Pagination:
  - Continue using client-side pagination over the filtered and sorted review rows.
  - Summary counts should make clear whether they refer to all review rows or filtered rows.
- Review decisions:
  - Current row selection decisions must persist when rows are hidden by filters or moved by sorting.
  - Selection state should continue to be keyed by stable upload `rowNumber`, not by visible index.
  - Non-duplicate rows remain included by default and should not become accidentally excludable unless that is accepted as a separate product change.

### Non-Goals

- Do not introduce persisted server-side upload review sessions in this update.
- Do not change duplicate detection semantics.
- Do not change upload finalization payload semantics except as required to preserve existing row decisions after client-side filtering/sorting.
- Do not add cross-page "select all matching filters" bulk actions for transactions.

## Technical Design

### Current System Constraints

- Backend design already describes `GET /api/transactions` with `q`, `dateFrom`, `dateTo`, `amountMin`, `amountMax`, `accountId`, `tags`, `type`, `sort`, `page`, and `limit`.
- Backend schema currently defaults transaction list sort to `date` and order to `desc`; this must change to `asc`.
- Frontend `ListParams` already includes `amountMin`, `amountMax`, `accountId`, `sort`, and `order`.
- `TransactionsPage` currently exposes description, date range, and type filters, but not amount range, account label, or clickable sort headers.
- `DuplicateReviewPage` currently slices the upload review rows in memory for pagination, and rows are keyed by `rowNumber`.

### Recommended Architecture

Use shared presentational and state-helper components, not one monolithic data-owning component.

The pages should share:

- `TransactionListTable`: renders transaction-shaped rows, sortable headers, empty/loading states, and optional row affordances.
- `SortableHeaderCell`: renders active sort indicator and toggles sort state.
- `TransactionFilters`: renders common filters that are meaningful for persisted transactions and can be configured per page.
- `Pagination`: keep the existing generic component, with optional improvements for total labels or page-size controls.
- `transactionListState` helpers:
  - `toggleSort(current, column)`.
  - `resetPageOnFilterChange(params)`.
  - `sortUploadReviewRows(rows, sort, order)`.
  - `filterUploadReviewRows(rows, filters)`.

The pages should not share:

- Data fetching.
- URL synchronization strategy.
- Duplicate review decision state.
- Bulk tagging/deletion actions.
- Upload finalization logic.

This split avoids forcing the client-side duplicate review page into server-pagination abstractions while still eliminating duplicated table, header, row-formatting, and filter UI code.

### Shared Row Model

Define a frontend row shape that can represent both persisted transactions and upload review rows:

```ts
type TransactionListRow = {
  key: string;
  date: string;
  description: string;
  amount: number;
  currency: "CAD";
  accountLabel: string;
  tags?: string[];
  duplicate?: boolean;
  included?: boolean;
  href?: string;
};
```

Adapters:

- Persisted transaction adapter maps API transaction rows to `TransactionListRow`.
- Duplicate review adapter maps upload review rows to `TransactionListRow`, using `rowNumber` as `key` and `account` as `accountLabel`.

The shared table should accept column configuration:

```ts
type TransactionListColumn =
  | "select"
  | "date"
  | "description"
  | "amount"
  | "account"
  | "tags"
  | "duplicateStatus";
```

Example usage:

- `/transactions`: `select`, `date`, `description`, `amount`, `account`, `tags`.
- `/upload/duplicates`: `select`, `date`, `description`, `amount`, `account`, `duplicateStatus`.

### Sorting Contract

Use one frontend sort model:

```ts
type SortColumn =
  | "date"
  | "description"
  | "amount"
  | "account"
  | "duplicateStatus";
type SortOrder = "asc" | "desc";
```

Transactions backend support should align with the visible columns:

- Existing backend-supported sort columns: `date`, `amount`, `description`.
- Needed backend-supported sort column: `account`.
- Duplicate-only `duplicateStatus` remains client-only unless upload review becomes server-backed.

Backend update required:

- Change default `order` for `GET /api/transactions` from `desc` to `asc`.
- Add `account` to the transaction list sort schema.
- Join accounts in the list query when sorting by or displaying account label.
- Add a deterministic secondary sort, recommended `id ASC`, to prevent unstable pagination when multiple rows share the same date, amount, or description.

Client sorting behavior:

- If the user clicks the active sort column, toggle `asc`/`desc`.
- If the user clicks a new sort column, set that column with `asc`.
- Reset page to `1`.
- Persist `/transactions` sort in URL params.
- Keep duplicate review sort in component state unless a refresh-preserved review URL is explicitly desired.

### Filtering Contract

#### Transactions

The common filter state should include:

```ts
type TransactionFilterState = {
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: string;
  amountMax?: string;
  accountId?: string;
  type?: "income" | "expense";
  tags?: string;
};
```

Implementation notes:

- Keep form inputs as strings so empty fields are representable without `NaN`.
- Convert amount strings to numbers only when building API params.
- Validate amount range in the UI before sending:
  - Both empty is allowed.
  - One-sided ranges are allowed.
  - If both are present, `amountMin <= amountMax`.
- Account label UI should use `GET /api/accounts` and send the selected account id as `accountId`.
- If free-text account label search is desired, add a separate backend `accountLabel` filter rather than overloading `accountId`.

#### Duplicate Review

Recommended duplicate review filters for this update:

```ts
type DuplicateReviewFilterState = {
  duplicateVisibility: "all" | "duplicates" | "nonDuplicates";
};
```

Do not put duplicate visibility into the common transaction filter model initially. It is specific to upload review rows and maps to a local boolean, not to persisted transaction fields.

If later product work introduces persisted duplicate markers, then duplicate status can become part of a broader common filter model.

### Pagination Contract

#### Server-Side Pagination

`/transactions`:

- Source of truth is the backend result: `{ data, total, page, limit }`.
- Table renders only the current server page.
- `Pagination` sends page changes to the URL query params.
- Sorting/filtering changes cause a new API request and reset page.

#### Client-Side Pagination

`/upload/duplicates`:

- Source of truth is the upload review payload in local storage/session storage.
- Derive visible rows in this order:
  - Start with all upload review rows.
  - Apply duplicate visibility filter.
  - Apply client-side sort.
  - Apply pagination slice.
- `Pagination.total` should be the filtered row count, not the original row count.
- Summary should separately show:
  - Total upload rows.
  - Total duplicates in upload.
  - Filtered rows currently shown.
  - Included rows selected for finalization.

### Component API Sketch

```tsx
<TransactionListTable
  rows={rows}
  columns={columns}
  sort={{ column, order }}
  onSortChange={setSort}
  selection={selection}
  onToggleRow={toggleRow}
  onTogglePage={togglePage}
  getRowTone={(row) => (row.duplicate ? "warning" : "default")}
  emptyMessage="No transactions found"
/>
```

The table should remain controlled. Parent pages own:

- Fetching or row derivation.
- Selection decisions.
- Navigation links.
- Mutations and finalize actions.
- URL params.

### Backend Changes Needed For This Feature

- `backend/src/schemas/transaction.ts`:
  - Change `order` default from `desc` to `asc`.
  - Add `account` to the `sort` enum if account sorting is required.
- `backend/src/services/transactionService.ts`:
  - Support account-label sorting.
  - Add stable secondary sort.
  - Consider returning account label in each row to avoid frontend-side account lookup for display.
- `frontend/src/api/transactions.ts`:
  - Keep `sort` and `order`; add `account` to the sort union if backend supports it.
  - Consider adding `accountLabel` to `Transaction` response type if returned.
- `frontend/src/pages/TransactionsPage.tsx`:
  - Replace inline table with shared table.
  - Expose amount range and account filters.
  - Set default `order=asc`.
- `frontend/src/pages/DuplicateReviewPage.tsx`:
  - Replace inline review table with shared table.
  - Add duplicate visibility control.
  - Add in-memory sorting before pagination.

## E2E Test Update Plan

### Backend Tests

Add or update tests in `tests/backend.test.ts`:

- `GET /api/transactions` defaults to date ascending:
  - Seed transactions with non-monotonic upload order.
  - Call `/transactions` without sort/order.
  - Assert dates are ascending.
- `GET /api/transactions` sorts by date ascending and descending:
  - Call `?sort=date&order=asc`.
  - Call `?sort=date&order=desc`.
- `GET /api/transactions` sorts by amount and description:
  - Verify numeric amount order, not lexicographic string order.
  - Verify description order.
- `GET /api/transactions` sorts by account label if implemented:
  - Seed at least two accounts.
  - Assert account sort order.
- `GET /api/transactions` filters by amount range:
  - Test bounded range.
  - Test min-only range.
  - Test max-only range.
- `GET /api/transactions` filters by account:
  - Existing account-id test can remain, but should verify account label UI has a backend-supported target.
- `GET /api/transactions` combines filters:
  - Date range + description + amount range + account id.
- `GET /api/transactions` uses stable pagination:
  - Seed multiple rows with the same primary sort value.
  - Fetch page 1 and page 2.
  - Assert no overlap.

### Frontend Tests

Add or update tests in `tests/frontend.test.ts`:

- Transactions default ordering:
  - Navigate to `/transactions`.
  - Assert rows appear oldest-to-newest by date.
- Transactions sortable headers:
  - Click Date header and assert order toggles.
  - Click Amount header and assert numeric amount order.
  - Click Description header and assert alphabetical order.
  - If account sorting is implemented, click Account header and assert account-label order.
  - Assert URL params update with `sort`, `order`, and reset `page=1`.
- Transactions filters:
  - Enter description search and assert matching rows remain.
  - Enter date range and assert only rows in range remain.
  - Enter amount range and assert only rows in range remain.
  - Select account label and assert only that account's rows remain.
  - Combine filters and assert intersection behavior.
  - Clear filters and assert default state returns.
- Transactions pagination:
  - Move to a later page.
  - Change a filter.
  - Assert page resets to `1`.
- Duplicate review visibility:
  - Upload a file that produces duplicate review.
  - Select `duplicates` and assert only duplicate rows show.
  - Select `nonDuplicates` and assert only non-duplicate rows show.
  - Select `all` and assert both statuses show.
- Duplicate review sorting:
  - Click Date, Description, Amount, and Account headers.
  - Assert visible rows sort within the selected duplicate visibility filter.
- Duplicate review pagination after filtering:
  - Use a review payload large enough for multiple pages.
  - Navigate to page 2.
  - Change duplicate visibility.
  - Assert page resets to `1` and pagination total reflects filtered rows.
- Duplicate review decision persistence:
  - Accept or skip a duplicate.
  - Change visibility filter so the row is hidden.
  - Return to `all`.
  - Assert the row decision is preserved.
  - Finalize and assert the inserted/duplicate counts match the preserved decisions.

### Test Selectors

Add stable `data-testid` values for shared controls:

- `transaction-table`.
- `transaction-row`.
- `sort-date`.
- `sort-description`.
- `sort-amount`.
- `sort-account`.
- `sort-duplicate-status`.
- `filter-description`.
- `filter-date-from`.
- `filter-date-to`.
- `filter-amount-min`.
- `filter-amount-max`.
- `filter-account`.
- `duplicate-visibility`.

Keep existing selectors where possible to avoid broad test churn. If selector names change as part of the shared component extraction, update tests in the same PR.

## Open Questions

### 1. Should account filtering use account id or free-text account label?

Options:

- Use account id from `GET /api/accounts`.
- Add backend support for `accountLabel` text matching.
- Support both exact account selection and free-text label contains.

Recommendation:

Use account id for this update. It is already supported by the backend and avoids ambiguous labels. Add free-text account label search later only if users need partial account matching.

### 2. Should account sorting be required in the first implementation?

Options:

- Add backend account-label sorting now.
- Keep sorting limited to date, description, and amount for `/transactions`, while duplicate review can sort account client-side.
- Fetch account labels client-side and sort the current page only.

Recommendation:

Add backend account-label sorting now if the account column is visible on `/transactions`. Sorting only the current page would be misleading with server-side pagination.

### 3. Should duplicate review support description, amount, date, and account filters too?

Options:

- Only add duplicate visibility filtering.
- Add the full common filter panel to duplicate review.
- Add a smaller review-specific filter panel with duplicate visibility plus optional description search.

Recommendation:

Start with duplicate visibility only. Full filtering may be useful for very large uploads, but it adds review complexity and is not required by the current duplicate triage workflow.

### 4. Should duplicate review pagination remain client-side?

Options:

- Keep client-side pagination over the stateless review payload.
- Introduce persisted upload review sessions and server-side pagination/filtering/sorting.
- Hybrid: keep stateless finalize but store the review payload in IndexedDB for large uploads.

Recommendation:

Keep client-side pagination. The current backend design explicitly avoids persisted review sessions, and upload files are capped at 10 MB. Revisit server-side review sessions only if review payload size or browser memory becomes a real issue.

### 5. Should non-duplicate rows be deselectable in duplicate review?

Options:

- Keep non-duplicates always included and disabled in the review table.
- Allow users to exclude any row during duplicate review.
- Add a separate "review all rows" mode that unlocks non-duplicate row exclusion.

Recommendation:

Keep non-duplicates always included for this update. The page is specifically for duplicate review, and broad row exclusion belongs in a separate upload edit/reconciliation feature.

### 6. Should sorting persist across duplicate review page reloads?

Options:

- Keep duplicate review sorting/filtering in component state only.
- Store duplicate review view state alongside the upload review payload.
- Put duplicate review state in URL params.

Recommendation:

Keep it in component state. Persisting review decisions matters; persisting view preferences does not unless users report reload/navigation pain.

### 7. How should amount range filtering handle expenses?

Options:

- Use signed amounts exactly as stored, so expenses are negative.
- Provide separate absolute-value amount filtering.
- Provide a transaction type toggle plus signed amount inputs.

Recommendation:

Use signed amounts for now because that matches the canonical ledger model. Improve labels and helper text so users understand that expenses are negative. If users expect "amount between 10 and 50" to include `-10` through `-50`, add absolute-value filtering later as a distinct UX.
