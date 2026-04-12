# Transaction Deletion: Frontend Design and Implementation Plan

## Goal

Add transaction deletion to the main transactions workflow so users can:

- delete one or more transactions from the transactions list by selecting rows

This document focuses on the frontend work required to satisfy the updated CUJs in `PRD.md`, while calling out the backend changes that are still needed for bulk deletion. The existing delete flow on the transaction detail page remains unchanged.

## Current State

### Product and design intent

The updated PRD requires users to:

- find transactions via search and filtering
- delete transactions individually
- delete multiple selected transactions in one shot

The design docs already position the transactions page as the primary place for search, filtering, and bulk actions.

### What the codebase already supports

Backend:

- `DELETE /api/transactions/:id` exists in [backend/src/routes/transactions.ts](/home/suvanjan/depot/expenses-v3/backend/src/routes/transactions.ts) and is implemented in [backend/src/services/transactionService.ts](/home/suvanjan/depot/expenses-v3/backend/src/services/transactionService.ts).
- Ownership validation is already handled before deletion.
- Deleting a transaction should cascade through `transaction_tags` because the join table references `transactions` with `onDelete: "cascade"` in [backend/src/db/schema.ts](/home/suvanjan/depot/expenses-v3/backend/src/db/schema.ts).

Frontend:

- `deleteTransaction(id)` already exists in [frontend/src/api/transactions.ts](/home/suvanjan/depot/expenses-v3/frontend/src/api/transactions.ts).
- The transaction detail page already exposes a delete button and confirmation dialog in [frontend/src/pages/TransactionDetailPage.tsx](/home/suvanjan/depot/expenses-v3/frontend/src/pages/TransactionDetailPage.tsx).
- The transactions list already supports row selection and a bulk action bar, but only for tagging, in [frontend/src/pages/TransactionsPage.tsx](/home/suvanjan/depot/expenses-v3/frontend/src/pages/TransactionsPage.tsx).

### Gaps relative to the new CUJs

1. The main list view does not support deletion yet.
2. There is no bulk delete API.
3. The current bulk action bar is tag-specific, so the UX needs to evolve from "bulk tag bar" to a more general "selection action bar".
4. There are no backend or frontend tests covering transaction-list deletion flows.

## Scope

### In scope

- single delete from transaction list
- bulk delete from transaction list
- confirmation UX for destructive actions
- query invalidation and selection cleanup after delete
- automated coverage for backend and frontend transaction-list deletion flows

### Out of scope

- undo support
- soft delete / recycle bin
- deletion by upload batch from the transactions page
- analytics redesign beyond cache refresh after deletion

## Design Principles

### Keep search and filtering as the entry point

The PRD explicitly says users should use search and filtering to find what to delete. The primary deletion experience should therefore live on the transactions page, not only on the detail page.

### Make destructive actions explicit

Deletion must always require confirmation. The confirmation copy should clearly state the number of transactions being deleted and that the action cannot be undone.

### Preserve the existing selection model

The current table already has per-row checkboxes and select-all. Reusing that model is lower risk than introducing a second selection mechanism.

### Do not rely on optimistic delete for the first pass

Deletion changes counts, pagination, charts, and detail views. For the initial implementation, prefer server-confirmed updates plus query invalidation over optimistic cache surgery.

## Proposed UX

## 1. Transactions list page

### Selection action bar

Replace the current tag-only bulk bar with a generalized selection action bar that still supports tagging and now supports deletion.

Suggested layout:

- selected count on the left
- tag input and `Add tags` / `Remove tags` actions
- a visually separate `Delete selected` destructive action on the right

Behavior:

- appears when `selectedIds.size > 0`
- bulk delete opens a confirmation dialog
- confirmation text includes the selected count
- after success:
  - selection clears
  - action bar hides
  - transactions query refetches

### Pagination behavior after deletion

Deletion can empty the current page. Handle this explicitly:

- if the current page still has rows after refetch, stay on the same page
- if the current page becomes empty and `page > 1`, move to the previous page

This prevents users from landing on an empty page after deleting the last item on page 2+.

## 2. Confirmation dialogs

The existing [frontend/src/components/ConfirmDialog.tsx](/home/suvanjan/depot/expenses-v3/frontend/src/components/ConfirmDialog.tsx) is sufficient structurally, but the deletion flow will benefit from slightly richer copy.

Recommended enhancement:

- keep the component simple
- pass explicit messages from the caller for:
  - single delete from list
  - bulk delete

Optional enhancement if needed:

- add a `confirmLabel` prop so destructive dialogs can say `Delete` instead of `Confirm`

This is nice-to-have, not required for the first pass.

## Backend Requirements

## 1. Single delete

No backend API changes are needed for single delete.

The existing endpoint is sufficient:

- `DELETE /api/transactions/:id`

## 2. Bulk delete

The backend does not currently support bulk deletion. To satisfy the PRD CUJ, add a dedicated bulk delete endpoint rather than issuing N single-delete requests from the browser.

Recommended API:

- `POST /api/transactions/bulk-delete`

Request body:

```json
{
  "transactionIds": ["uuid-1", "uuid-2"]
}
```

Response body:

```json
{
  "deleted": 2
}
```

Why use a dedicated bulk endpoint:

- it matches the existing bulk-tag API shape
- it keeps authorization and validation server-side
- it avoids partial success ambiguity across multiple client-issued DELETE requests
- it reduces request overhead and simplifies frontend error handling

### Backend validation rules

- `transactionIds` must be a non-empty array
- all ids must be UUIDs
- only transactions owned by the current user may be deleted

### Backend behavior

Recommended behavior is strict validation:

- verify all requested transactions belong to the current user
- if any requested id is missing or unauthorized, return `404` and delete nothing

This is safer than silently deleting only the subset the user owns.

### Backend implementation shape

Files likely to change:

- [backend/src/schemas/transaction.ts](/home/suvanjan/depot/expenses-v3/backend/src/schemas/transaction.ts)
- [backend/src/routes/transactions.ts](/home/suvanjan/depot/expenses-v3/backend/src/routes/transactions.ts)
- [backend/src/services/transactionService.ts](/home/suvanjan/depot/expenses-v3/backend/src/services/transactionService.ts)

Add:

- `bulkDeleteSchema`
- route handler for `POST /bulk-delete`
- service method `bulkDeleteTransactions(userId, transactionIds)`

## Frontend Implementation Plan

## 1. API client updates

File:

- [frontend/src/api/transactions.ts](/home/suvanjan/depot/expenses-v3/frontend/src/api/transactions.ts)

Changes:

- keep `deleteTransaction(id)` for single delete
- add `bulkDeleteTransactions(transactionIds: string[])`
- add response type `{ deleted: number }`

## 2. Transactions page refactor

File:

- [frontend/src/pages/TransactionsPage.tsx](/home/suvanjan/depot/expenses-v3/frontend/src/pages/TransactionsPage.tsx)

Changes:

- import `deleteTransaction` and `bulkDeleteTransactions`
- introduce delete-related local state:
  - `pendingDeleteId: string | null`
  - `showBulkDeleteConfirm: boolean`
  - optional `actionError` if we want one shared error surface
- add single-delete mutation
- add bulk-delete mutation
- preserve the existing bulk-tag mutation
- refactor the selected-row bar into a generalized action bar
- add row-level delete buttons
- add confirmation dialog rendering for:
  - row delete
  - bulk delete

Important state handling:

- clear selection after successful bulk delete
- if a deleted row was selected individually, remove it from `selectedIds`
- close dialogs on success
- if current page becomes invalid after delete, update `page` search param before or after refetch

### Recommended internal refactor

To keep the page maintainable, extract small helpers inside the file or split components if needed:

- `handleDeleteSuccess`
- `adjustPageAfterDeletion`
- `SelectionActionBar`

This does not need to become a major component extraction unless the file becomes unwieldy.

## 3. Confirm dialog polish

File:

- [frontend/src/components/ConfirmDialog.tsx](/home/suvanjan/depot/expenses-v3/frontend/src/components/ConfirmDialog.tsx)

Minimum change:

- no structural change required

Optional changes:

- `confirmLabel?: string`
- `isPending?: boolean`

If added, use them for deletion flows so the UI can show a disabled `Delete` button while the mutation is in flight.

## Query Invalidation Plan

Deletion affects more than the visible list. At minimum, invalidate:

- `["transactions"]`

Recommended additional invalidation because totals and charts depend on transactions:

- dashboard-related queries
- analytics-related queries
- any upload-history views that surface transaction counts, if applicable

The exact keys should match the existing query usage in:

- [frontend/src/pages/DashboardPage.tsx](/home/suvanjan/depot/expenses-v3/frontend/src/pages/DashboardPage.tsx)
- [frontend/src/pages/AnalyticsPage.tsx](/home/suvanjan/depot/expenses-v3/frontend/src/pages/AnalyticsPage.tsx)

If there is no centralized key factory yet, this is still manageable with targeted `invalidateQueries` calls by prefix.

## Testing Plan

## 1. Backend tests

File:

- [tests/backend.test.ts](/home/suvanjan/depot/expenses-v3/tests/backend.test.ts)

Add coverage for:

- `DELETE /api/transactions/:id` deletes an owned transaction
- deleted transaction is no longer returned from `GET /api/transactions/:id`
- deleting another user's or missing transaction returns `404`
- `POST /api/transactions/bulk-delete` deletes multiple transactions
- bulk delete rejects empty `transactionIds`
- bulk delete rejects invalid ids
- bulk delete is atomic if any requested id is invalid or unauthorized

## 2. Frontend tests

File:

- [tests/frontend.test.ts](/home/suvanjan/depot/expenses-v3/tests/frontend.test.ts)

Add coverage for:

- deleting from a row action removes the row from the list
- selecting multiple rows and deleting them removes the rows and clears the selection bar
- canceling the confirmation dialog leaves data unchanged
- deleting the last row on a page moves the user to the previous page

Suggested test ids:

- `delete-row-${txn.id}`
- `bulk-delete-btn`
- `confirm-dialog`
- `confirm-ok`

## Edge Cases

- deleting while filters are active should preserve the filters
- deleting all rows visible under the current filter should show the existing empty state
- delete errors should not clear selection prematurely
- repeated clicks on delete should be blocked while the mutation is pending
- bulk delete should work with mixed pages only for currently selected rows on the current page, since selection is page-local today

## Recommended Delivery Sequence

1. Add backend bulk delete support and tests.
2. Add frontend API client for bulk delete.
3. Refactor the transactions page action bar to support delete alongside bulk tag.
4. Add row-level delete from the list.
5. Add frontend E2E coverage for single and bulk deletion from the list page.

This sequence keeps the frontend implementation simple because the UI can be built against a real bulk API instead of a temporary workaround.

## Open Questions

1. Should bulk delete be all-or-nothing if one id is invalid? This document recommends yes.
2. Do we want row-level delete only via a visible button, or via a kebab menu for denser tables? This document recommends a visible button because the current UI is simple and spacious.
3. Should selection remain page-local or persist across pagination/filter changes? This document assumes page-local selection because that matches the current implementation and is lower risk.

## Summary

The repo already has the pieces for single-item deletion, but not the full CUJ required by the updated PRD. The highest-value change is to make the transactions page the deletion surface for the new work by:

- adding row-level delete
- upgrading the bulk action bar to include `Delete selected`
- adding a backend bulk delete endpoint
- tightening cache invalidation and tests around transaction-list deletion

That gives users a direct path from search/filter -> select -> confirm delete, which is the core behavior the new CUJs require.
