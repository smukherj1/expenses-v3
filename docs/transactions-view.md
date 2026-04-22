# Transactions View Implementation Plan

## Approach

Implement multi-account filtering as a first-class server-backed filter and keep the transaction table/pagination components custom for now.

The current architecture already draws a clean boundary:

- `TransactionsPage` owns URL state, server queries, filters, sorting, pagination, and row selection.
- `TransactionListTable` is presentational and reusable by both `/transactions` and `/upload/duplicates`.
- The backend already performs filtering, sorting, counting, and pagination.

This implementation should use the existing `TransactionListTable`, add a focused account multi-select component, and extend the existing `Pagination` component. Do not add a table/grid library for this work.

## Behavior

### Account Filter

Replace the single-account filter with a multi-account filter backed by `accountIds`.

- URL param: `accountIds=<uuid>,<uuid>,...`
- API param: `accountIds=<uuid>,<uuid>,...`
- Empty or absent `accountIds` means all accounts.
- Keep `accountId=<uuid>` supported temporarily for backward compatibility with existing links and tests.
- If both `accountIds` and `accountId` are present, prefer `accountIds`.
- Filter changes reset `page=1`.
- The UI label should summarize the selection:
  - `All accounts`
  - selected account label for one account
  - `N accounts` for multiple accounts

Frontend control:

- Use a compact account filter popover/list with checkboxes and a search input when account count warrants it.
- Use checkboxes for each account so multi-select semantics are obvious.
- Include `All accounts` or `Clear` action.
- Keep selected values URL-backed so reloads, bookmarks, and chart drill-downs remain deterministic.

Avoid a native `<select multiple>` unless we need the fastest possible implementation. It is accessible but awkward for everyday filtering because users must know platform-specific multi-select behavior.

### Pagination

Extend the shared `Pagination` component to include first and last page controls:

- `First` jumps to page `1`.
- `Prev` jumps to `page - 1`.
- current page indicator remains `page / totalPages`.
- `Next` jumps to `page + 1`.
- `Last` jumps to `totalPages`.
- Disable `First` and `Prev` on page `1`.
- Disable `Next` and `Last` on `totalPages`.

This can remain a small custom component because pagination state is already simple and server-backed.

## Implementation Constraints

- Reuse `TransactionListTable`; do not migrate table rendering to a third-party table/grid package.
- Keep sorting, filtering, pagination, and selection controlled by parent pages.
- Keep `/transactions` server-backed and `/upload/duplicates` client-backed; do not couple their pagination or sorting implementations.
- Build the account multi-select as a local component using existing React, Tailwind, and route state patterns.
- Keep all transaction list filters URL-backed.
- Preserve existing design docs as the source of truth by updating `design.md`, `frontend/design.md`, and `backend/design.md` alongside code changes.

## Backend Plan

1. Update `backend/src/schemas/transaction.ts`.
   - Add optional `accountIds` query param as a comma-separated UUID list.
   - Keep existing `accountId` optional.
   - Reject invalid UUIDs in `accountIds` with a validation error.

2. Update `backend/src/services/transactionService.ts`.
   - Normalize `accountIds` into a string array.
   - Use `inArray(transactions.accountId, accountIds)` when multiple accounts are supplied.
   - Preserve the existing `eq(transactions.accountId, accountId)` path for legacy single-account requests.
   - Prefer `accountIds` when both params are supplied.

3. Update backend documentation.
   - `backend/design.md`: change `GET /api/transactions` query params from `accountId` to `accountIds`, noting `accountId` backward compatibility.
   - Root `design.md`: update the Transactions capability wording if needed.

No database migration is required. Existing `transactions_account_idx` supports filtering by account id; PostgreSQL can use it for `IN (...)` predicates.

## Frontend Plan

1. Update `frontend/src/api/transactions.ts`.
   - Add `accountIds?: string` or `accountIds?: string[]` to `ListParams`.
   - Prefer `string[]` internally and serialize it as comma-separated query text in `listTransactions`.
   - Keep `accountId?: string` temporarily only if needed by existing call sites/tests.

2. Update `frontend/src/pages/TransactionsPage.tsx`.
   - Replace `accountId` in `TransactionSearchState` with `accountIds: string[]`.
   - Read from `accountIds`; fall back to legacy `accountId` when present.
   - Write only `accountIds` for new UI interactions.
   - Reset page to `1` when account selection changes.
   - Clear selected rows when filters change if current behavior starts allowing selection to survive hidden result changes.

3. Add an account multi-select filter component.
   - Recommended local component: `frontend/src/components/AccountMultiSelect.tsx`.
   - Props: accounts, selectedIds, onChange.
   - Render a trigger button and checkbox list, or a simple inline checkbox group if we want less interaction code.
   - Add stable test ids for trigger, options, and clear action.

4. Update `frontend/src/components/Pagination.tsx`.
   - Compute `totalPages = Math.max(1, Math.ceil(total / limit))`.
   - Render first/previous/current/next/last controls.
   - Keep returning `null` when `totalPages <= 1`.
   - Add stable test ids for `pagination-first`, `pagination-prev`, `pagination-next`, and `pagination-last`.

5. Update frontend documentation.
   - `frontend/design.md`: describe account filter as multi-select and pagination as first/prev/next/last.

## Test Plan

### Backend E2E

Update `tests/backend.test.ts`.

- Add a test for `GET /api/transactions?accountIds=id1,id2`.
  - Seed two accounts with known transactions.
  - Assert returned rows include only those accounts.
  - Assert total matches the combined set.
- Add a test that a single value in `accountIds` behaves like `accountId`.
- Add a validation test for an invalid UUID inside `accountIds`.
- Keep the existing `accountId` test while backward compatibility remains.

### Frontend E2E

Update `tests/frontend.test.ts`.

- Replace helpers that assume a single account filter with multi-select-aware helpers where appropriate.
- Add a test that selecting two accounts updates the URL with `accountIds` and renders rows from both accounts.
- Add a test that clearing the account selection returns to all accounts.
- Update the amount/account filter test to select one account through the new multi-select control.
- Add a pagination test that:
  - navigates to a later page,
  - clicks first page and asserts `page=1`,
  - clicks last page and asserts `page=<lastPage>`,
  - checks first/prev and next/last disabled states at boundaries.

## Rollout Notes

- Keep `accountId` support until all internal links and tests use `accountIds`.
- Chart drill-downs currently use tag/date filters; if account drill-downs are added later, they should generate `accountIds`.
- Do not introduce a table library in this implementation.
