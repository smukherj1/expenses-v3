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
  - Account label should be exposed in the UI as an exact account selector backed by `GET /api/accounts`, and should send the selected account id as `accountId`.
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
  - Non-duplicate rows remain included by default and disabled in the review table. Broad row exclusion belongs in a separate upload edit/reconciliation feature.

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
- Keep duplicate review sort in component state. Persisting review decisions matters; persisting view preferences is out of scope for this update.

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
- Amount filtering uses signed amounts as stored in the ledger. Expense helper text should make clear that expenses are negative.
- Free-text account label search is out of scope for this update. If later needed, add a separate backend `accountLabel` filter rather than overloading `accountId`.

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

`TransactionListTable` should have an explicit documented props contract in the implementation. Future readers should not need to inspect component internals to know what each prop expects, which page owns each behavior, or when callbacks fire.

```tsx
<TransactionListTable
  rows={rows}
  columns={columns}
  sort={{ column, order }}
  sortableColumns={["date", "description", "amount", "account"]}
  onSortChange={setSort}
  selection={selection}
  getRowSelected={(row) => selectedKeys.has(row.key)}
  isRowSelectable={(row) => row.duplicate !== false}
  onToggleRow={toggleRow}
  onTogglePage={togglePage}
  getRowHref={(row) => row.href}
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

### TransactionListTable Props Contract

Add a detailed API comment above the exported `TransactionListTableProps` type or interface. The implementation comment should cover the following props and behavior.

| Prop                    | Type                                                             | Required | Behavior                                                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rows`                  | `TransactionListRow[]`                                           | Yes      | Already-filtered, already-sorted, already-paginated rows to render. The table does not fetch, sort, filter, or paginate internally.                                                                                                |
| `columns`               | `TransactionListColumn[]`                                        | Yes      | Ordered columns to render. Supported values are `select`, `date`, `description`, `amount`, `account`, `tags`, and `duplicateStatus`. The component renders columns exactly in this order.                                          |
| `sort`                  | `TransactionListSort \| null`                                    | No       | Current active sort state for header display. When `null`, no column is visually marked as sorted. The table does not reorder rows.                                                                                                |
| `sortableColumns`       | `SortColumn[]`                                                   | No       | Columns whose headers are clickable. A visible column is not sortable unless it is present here. Omit or pass `[]` to render all headers as static.                                                                                |
| `onSortChange`          | `(next: TransactionListSort) => void`                            | No       | Called only when the user clicks a sortable header. Clicking a new sortable column emits `{ column, order: "asc" }`. Clicking the active column toggles `asc`/`desc`. Parent must update rows, reset page, and sync URL if needed. |
| `selection`             | `TransactionListSelection \| null`                               | No       | Controlled page-selection summary. When omitted or `null`, row and page selection controls are not rendered even if `columns` contains `select`.                                                                                   |
| `getRowSelected`        | `(row: TransactionListRow) => boolean`                           | No       | Returns whether a row checkbox is checked. Required when selection controls are rendered. For `/transactions`, use persisted transaction ids. For `/upload/duplicates`, use stable upload row numbers.                             |
| `isRowSelectable`       | `(row: TransactionListRow) => boolean`                           | No       | Determines whether a row checkbox is enabled. Defaults to `true`. Duplicate review should return `row.duplicate === true` so non-duplicates remain included and disabled.                                                          |
| `onToggleRow`           | `(row: TransactionListRow) => void`                              | No       | Called when the user toggles an enabled row checkbox. Not called for disabled rows. Parent owns selected or included state updates.                                                                                                |
| `onTogglePage`          | `(rows: TransactionListRow[], nextChecked: boolean) => void`     | No       | Called when the header checkbox is toggled. Receives only currently rendered selectable rows, not all rows matching server filters. Parent decides how to apply page-level selection.                                              |
| `getRowHref`            | `(row: TransactionListRow) => string \| undefined`               | No       | Optional row detail link provider. If provided for a row, the description cell renders as a link. If omitted or returns `undefined`, description renders as plain text.                                                            |
| `getRowTone`            | `(row: TransactionListRow) => "default" \| "warning" \| "muted"` | No       | Optional visual row tone. Duplicate review can return `"warning"` for duplicates. Defaults to `"default"`.                                                                                                                         |
| `emptyMessage`          | `string`                                                         | No       | Message shown when `rows.length === 0` and `loading` is false. Defaults to `"No transactions found"`.                                                                                                                              |
| `loading`               | `boolean`                                                        | No       | When true, renders a loading state instead of rows. Selection and sort callbacks are not triggered while the loading placeholder is shown.                                                                                         |
| `testId`                | `string`                                                         | No       | Base `data-testid` for the table. Defaults to `transaction-table`. Row test ids should remain stable and derive from row keys.                                                                                                     |
| `formatAmount`          | `(row: TransactionListRow) => string`                            | No       | Optional amount formatter. Defaults to signed fixed-point amount plus currency when currency is present. Parent can override if display conventions change.                                                                        |
| `renderTags`            | `(row: TransactionListRow) => React.ReactNode`                   | No       | Optional custom tag renderer for persisted transactions. If omitted, tags render as plain labels or the tags column can be omitted.                                                                                                |
| `renderDuplicateStatus` | `(row: TransactionListRow) => React.ReactNode`                   | No       | Optional duplicate-status renderer. If omitted, duplicate rows show `Duplicate` and non-duplicate rows show `Included`. Only used when `duplicateStatus` is present.                                                               |

Recommended supporting types:

```ts
type SortColumn =
  | "date"
  | "description"
  | "amount"
  | "account"
  | "duplicateStatus";

type SortOrder = "asc" | "desc";

type TransactionListSort = {
  column: SortColumn;
  order: SortOrder;
};

type TransactionListColumn =
  | "select"
  | "date"
  | "description"
  | "amount"
  | "account"
  | "tags"
  | "duplicateStatus";

type TransactionListRow = {
  key: string;
  date: string;
  description: string;
  amount: number;
  currency?: "CAD";
  accountLabel?: string;
  tags?: string[];
  duplicate?: boolean;
  included?: boolean;
  href?: string;
};

type TransactionListSelection = {
  pageSelected: boolean;
  pageIndeterminate: boolean;
};
```

Recommended implementation comment:

```ts
/**
 * Controlled table for transaction-shaped rows.
 *
 * TransactionListTable is presentational only:
 * - It does not fetch data.
 * - It does not own URL params.
 * - It does not sort, filter, or paginate rows internally.
 * - It does not mutate selection state.
 * - It does not know about upload finalization or transaction bulk actions.
 *
 * Parent pages must pass rows in the exact order and page slice that should be
 * displayed. Callback methods only report user intent.
 *
 * Sorting:
 * - A column is clickable only when it appears in sortableColumns.
 * - Clicking a new sortable column calls onSortChange({ column, order: "asc" }).
 * - Clicking the active sortable column toggles order.
 * - The table does not reset pagination; parent must do that.
 * - The table does not update URL params; /transactions owns that behavior.
 *
 * Selection:
 * - Row selection is controlled by getRowSelected and onToggleRow.
 * - Disabled rows, as determined by isRowSelectable, do not trigger onToggleRow.
 * - The page checkbox only applies to currently rendered selectable rows.
 * - onTogglePage never means "select all rows matching current server filters."
 * - /transactions should key selection by persisted transaction id.
 * - /upload/duplicates should key selection by stable upload rowNumber.
 *
 * Column rendering:
 * - columns controls both presence and order.
 * - A visible column is not automatically sortable.
 * - Duplicate-only columns should be configured by the duplicate review page.
 * - Tags should only be rendered when the tags column is included.
 *
 * Row identity:
 * - row.key must be stable across filtering, sorting, and pagination.
 * - Do not use visible row index as a key or callback identifier.
 */
```

### Backend Changes Needed For This Feature

- `backend/src/schemas/transaction.ts`:
  - Change `order` default from `desc` to `asc`.
  - Add `account` to the `sort` enum.
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
- `GET /api/transactions` sorts by account label:
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
  - Click Account header and assert account-label order.
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
