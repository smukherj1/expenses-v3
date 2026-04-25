# Transaction List Tags

## Goals

- Show uploaded tags during duplicate review before the upload is finalized.
- Show tags in the `/transactions` search/list table.
- Allow tag edits from the transactions list without requiring a detail-page visit.
- Keep bulk add/remove tag flows fast for selected search results.
- Add a way to search for transactions with one or more tags, or with no tags.
- Remove the separate income/expense type filter from the transactions search UI because signed amount min/max already covers that use case.
- Keep `TransactionListTable` presentational and keep the UI compact.

## Current State

- Generic CSV/JSON uploads can include optional row tags.
- The backend preserves uploaded tags on immediate insert and on finalize.
- `GET /api/transactions/:id` returns tags, and the transaction detail page edits them.
- `GET /api/transactions` does not return row tags, so the transactions table cannot render them.
- Duplicate review rows already have `tags` in the upload review payload, but the review table does not include the `tags` column.
- `/transactions` already has a selected-row bulk action bar with `POST /api/transactions/bulk-tag`.

## Recommended UX

Use visible tag chips plus compact inline editors in the two list contexts.

### Duplicate Review

- Add the existing shared `tags` table column between `account` and `duplicateStatus`.
- Render uploaded tags as chips in each row.
- Each chip gets a small remove button.
- Add a compact `+ tag` row control in the tags cell.
- Tag edits update the local upload-review row state and the persisted local-storage review session.
- Finalize uses the edited row tags from local review state.
- Non-duplicate rows stay non-selectable for duplicate decision purposes, but their tags are still editable.
- Institution uploads start with empty tag cells and can receive tags during review.

This gives the user a chance to correct or add tags before insert, including rows that are duplicates but intentionally accepted.

### Transactions Search List

- Return tags from `GET /api/transactions`.
- Render tags as removable chips in the existing tags column.
- Add a compact `+ tag` control in the row's tags cell.
- Removing one chip calls `PATCH /api/transactions/:id` with the row's full updated tag list.
- Adding one tag calls `PATCH /api/transactions/:id` with the row's full updated tag list.
- On success, invalidate `['transactions']`, `['transaction', id]`, `['tags']`, and analytics queries that depend on tags.
- Keep the existing detail page tag editor as the full-page edit surface.

The list table should not open a modal for common single-row edits. Inline chips minimize clicks: one click to reveal the input, type tag, Enter.

### Bulk Tagging

- Keep the selected-row action bar because users already understand it from bulk delete and existing bulk tag tests.
- Keep one input plus `Add tags` and `Remove tags`.
- Add helper text clarifying that actions apply to selected rows on the current page.
- Do not add a separate bulk edit modal in this iteration.
- After bulk add/remove succeeds, clear selection and refresh the list.

This is the fewest-click path for bulk changes: select rows, type tags once, click add/remove.

### Tag Presence Search

- Add a `Tag status` filter beside the tag-name filter:
  - `All`
  - `Tagged`
  - `Untagged`
- URL param: `tagStatus=tagged|untagged`.
- API param: `tagStatus=tagged|untagged`.
- `tagStatus=untagged` means transactions with no rows in `transaction_tags`.
- `tagStatus=tagged` means transactions with at least one row in `transaction_tags`.
- Existing `tags=...` filtering remains tag-name inclusion filtering.
- If `tags` is present, ignore `tagStatus=untagged` in the UI by disabling the impossible combination, or clear `tagStatus` when tag names are entered.

Use an explicit filter instead of overloading `tags=none` or `tags=any`; it keeps URLs and backend validation clear and avoids collisions with real tag names.

### Tag Name Search

- Keep and expose named tag filtering through `tags=<tag-name>[,<tag-name>...]`.
- Add a visible `Tags` filter input/control in the search panel if it is not already present.
- The control can start as a comma-separated text input to match the existing API shape.
- A later enhancement can replace it with an autocomplete multi-select backed by `GET /api/tags`.
- Named tag filtering means "has at least one of these tag names."
- Example: `/transactions?tags=groceries,restaurant` returns transactions tagged `groceries` or `restaurant`.
- Named tag filtering can combine with description, date, amount, and account filters.
- Named tag filtering should clear or disable `tagStatus=untagged`, because a transaction cannot both have a named tag and have no tags.
- Named tag filtering can combine with `tagStatus=tagged`, but that combination is redundant because named tags already imply tagged rows.

### Transaction Type Filter

- Remove the dedicated `Type` select from the recommended transactions search UI.
- Users can already express type through signed amount filters:
  - Expenses: `amountMax=-0.01`, or a narrower negative range.
  - Income: `amountMin=0.01`, or a narrower positive range.
- Remove `type=income|expense` from the transactions API because the frontend is the only caller and there is no external compatibility requirement.
- Remove tests and assertions that specifically depend on transaction `type` filtering.
- Preserve coverage for income/expense-like filtering by relying on existing or new amount-range tests instead.

## UI Options Considered

### Option A: Visible Chips With Inline Add/Remove

- Pros: lowest click count for common edits, tags are always visible, no modal state, works in both review and transactions.
- Cons: table cells become denser, needs careful keyboard behavior and loading state.
- Decision: use this option.

### Option B: Row Actions Menu

- Pros: visually cleaner table, tag edit controls are hidden until needed.
- Cons: higher click count, harder to scan editable state, duplicate-review edits become less discoverable.
- Decision: reject for this iteration.

### Option C: Side Panel or Modal Editor

- Pros: can show autocomplete, validation, and existing tags comfortably.
- Cons: more implementation and interaction complexity, slower for repeated row edits.
- Decision: reject for list editing; keep detail page as the larger edit surface.

## Backend Design

### `GET /api/transactions`

Extend list response rows with `tags: string[]`.

Implementation approach:

1. Keep the existing filtered, sorted, paginated transaction query as the source of row ids.
2. Fetch tags for the page's transaction ids in one additional query:

```sql
SELECT tt.transaction_id, tg.name
FROM transaction_tags tt
JOIN tags tg ON tt.tag_id = tg.id
WHERE tt.transaction_id = ANY($page_transaction_ids)
ORDER BY tg.name ASC
```

3. Attach tags to each returned row in memory.
4. Return an empty array for untagged rows.

Avoid joining tags into the primary list query because it would multiply rows and complicate pagination/counting.

### Tag Status Filter

Add `tagStatus?: "tagged" | "untagged"` to `listTransactionsSchema`, service params, frontend `ListParams`, and URL state.

Backend conditions:

```sql
-- tagged
EXISTS (
  SELECT 1 FROM transaction_tags tt
  WHERE tt.transaction_id = transactions.id
)

-- untagged
NOT EXISTS (
  SELECT 1 FROM transaction_tags tt
  WHERE tt.transaction_id = transactions.id
)
```

When `tags` is also supplied, tag-name filtering remains the stronger condition. The UI should avoid generating `tags` plus `tagStatus=untagged`, but the backend can still safely apply both and return zero rows.

`tagStatus=tagged` can be combined with other filters such as date, amount, account, and description search to find transactions that have one or more tags without caring which tag names they have.

`tags=<tag-name>[,<tag-name>...]` remains the filter for finding transactions with specific tag names. The backend should continue treating multiple tag names as OR matching unless a separate AND-match feature is designed later.

### Tag Search Query Shape and Indexes

For named-tag searches, do not rely on a transaction-table scan with a per-row tag lookup. Resolve matching transaction ids through the tag tables and use that as a semi-join filter.

Recommended SQL shape:

```sql
SELECT t.id, t.user_id, t.account_id, t.date, t.description, t.amount,
       t.currency, t.created_at, a.label AS account_label
FROM transactions t
JOIN accounts a ON a.id = t.account_id
WHERE t.user_id = $1
  AND EXISTS (
    SELECT 1
    FROM transaction_tags tt
    JOIN tags tg ON tg.id = tt.tag_id
    WHERE tt.transaction_id = t.id
      AND tg.user_id = $1
      AND tg.name = ANY($2)
  )
ORDER BY t.date ASC, t.id ASC
LIMIT $3 OFFSET $4;
```

Equivalent `t.id IN (...)` or `JOIN (SELECT DISTINCT ...) matched` forms are acceptable if `EXPLAIN` shows a better plan, but the query must include `tg.user_id = $1` so the existing unique index on `(user_id, name)` is useful.

Current schema issue:

- `tags` has a unique index on `(user_id, name)`, which is good for finding tag ids by user and name.
- `transaction_tags` has primary key `(transaction_id, tag_id)`, which is good for fetching tags for known transactions and for `tagStatus` `EXISTS` checks by transaction id.
- `transaction_tags` does not currently have an index starting with `tag_id`, so finding all transactions for a given tag can require scanning `transaction_tags`.

Add this index:

```ts
index("transaction_tags_tag_transaction_idx").on(t.tagId, t.transactionId);
```

With that index, a tag-name-only search can use:

1. `tags(user_id, name)` to find the requested tag ids.
2. `transaction_tags(tag_id, transaction_id)` to find matching transaction ids.
3. `transactions` primary key or `transactions_user_date_idx` depending on the planner's chosen join/sort strategy.

`tagStatus=tagged` and `tagStatus=untagged` can use the existing `(transaction_id, tag_id)` primary key because those checks are anchored on each transaction id. Fetching tags for the visible page can also use the existing primary key because it queries `transaction_tags` by `transaction_id IN (...)`.

### Existing Mutations

No new mutation endpoints are required.

- Single-row list edits use `PATCH /api/transactions/:id` with the full replacement `tags` array.
- Bulk edits keep using `POST /api/transactions/bulk-tag`.

### Response Types

Update frontend `Transaction` to include `tags: string[]`, or introduce `TransactionListItem` if keeping detail/list models separate is preferred.

Recommended simple change:

```ts
export interface Transaction {
  id: string;
  accountId: string;
  accountLabel: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  createdAt: string;
  tags: string[];
}
```

`TransactionWithTags` can remain as an alias-compatible extension or be removed later.

## Frontend Design

### Shared Table

Keep `TransactionListTable` presentational.

Add optional rendering callbacks rather than mutation logic:

- `renderTags?: (row) => ReactNode` already exists and should be used.
- No API calls or local tag state should be added inside `TransactionListTable`.

### Shared Tag Cell Component

Create a small controlled component, for example `EditableTagCell`.

Props:

```ts
type EditableTagCellProps = {
  tags: string[];
  disabled?: boolean;
  pending?: boolean;
  onAdd: (tagName: string) => void;
  onRemove: (tagName: string) => void;
};
```

Behavior:

- Shows tags as chips with remove buttons.
- Shows a compact `+ tag` button when not editing.
- Clicking `+ tag` reveals a small input.
- Enter adds the typed tag.
- Escape cancels.
- Empty input cancels.
- Existing tag names are deduped case-sensitively to match current backend behavior unless tag normalization is changed separately.
- The input accepts a single tag for inline row edits; bulk action bar remains comma-separated.

### Duplicate Review Page

State changes:

- Replace the read-only `rows` derived value with local editable review rows.
- Initialize from `session.result.transactions`.
- When a row tag changes, update local React state and call a store helper to persist the edited session back to local storage.
- `buildReviewRows` reads current edited tags.
- `buildFinalizeRows` reads current edited tags.

Table changes:

- Add `"tags"` to `REVIEW_COLUMNS`.
- Pass `renderTags={(row) => <EditableTagCell ... />}`.
- Tag update lookup is by stable `rowNumber`.

Persistence matters because refreshing `/upload/duplicates` should not lose edits before finalize.

### Transactions Page

Search state changes:

- Add `tagStatus` to `TransactionSearchState`.
- Read/write it from URL params.
- Include it in `buildListParams`.
- Clear it in `defaultTransactionSearchParams`.
- Remove `type` from `TransactionSearchState`, URL parsing, URL updates, `buildListParams`, and frontend `ListParams`.

Filter UI:

- Add `Tag status` select with data-testid `filter-tag-status`.
- Add a tag-name input with data-testid `filter-tags` if one is not currently visible despite `tags` support in the API.
- When tag-name input becomes non-empty, clear `tagStatus` if it is `untagged`.
- Remove the `Type` select from the visible filter panel.

Backend cleanup:

- Remove `type` from `listTransactionsSchema`.
- Remove `type` from `listTransactions` service params.
- Remove the `params.type === "income"` and `params.type === "expense"` amount predicates from `transactionService`.
- Keep signed amount min/max filters unchanged.

Rows:

- `buildTransactionRows` copies `txn.tags ?? []` into `TransactionListRow.tags`.
- `TransactionListActions` passes `renderTags` with `EditableTagCell`.

Single-row mutation:

- Use `useMutation` around `updateTransaction(id, { tags: nextTags })`.
- Optimistic update is optional; invalidating the transaction list after success is enough for this iteration.
- Disable the row tag input while its row is pending to avoid overlapping full-array replacements.

Bulk mutation:

- Keep existing selected-row bulk action bar.
- After success, invalidate `['transactions']`, `['tags']`, and analytics tag queries.

## E2E Test Plan

### Backend Tests

Add cases to `tests/backend.test.ts`:

1. `GET /transactions` includes tags on each row.
2. Untagged rows return `tags: []`.
3. `GET /transactions?tags=<tag>` still filters by named tag and includes returned tags.
4. `GET /transactions?tags=<tag-a>,<tag-b>` returns rows with either named tag and excludes rows that have only other tags.
5. `GET /transactions?tags=<tag>&q=<query>` combines named tag filtering with description search.
6. `GET /transactions?tagStatus=untagged` returns only rows without transaction tags.
7. `GET /transactions?tagStatus=tagged` returns only rows with at least one transaction tag.
8. `GET /transactions?tagStatus=tagged&q=<query>` returns only matching rows that have one or more tags.
9. Pagination remains correct when list rows have multiple tags.
10. Bulk add tag followed by list fetch shows the new tag in `GET /transactions`.
11. Bulk remove tag followed by `tagStatus=untagged` includes the now-untagged transaction when no other tags remain.
12. A request with invalid `tagStatus` is rejected by validation.
13. Remove existing backend tests that call `GET /api/transactions` with `type=expense` or `type=income`.
14. Keep or add amount-range tests that verify negative and positive transaction filtering through `amountMax` and `amountMin`.

### Frontend Tests

Add cases to `tests/frontend.test.ts`:

1. Duplicate review shows uploaded tags for generic rows when duplicates are present.
2. Duplicate review can remove an uploaded tag before finalizing, and the inserted transaction detail/list no longer shows that tag.
3. Duplicate review can add a tag to an institution-upload duplicate before finalizing, and the inserted transaction has the tag.
4. Transactions search list renders row tag chips without visiting the detail page.
5. Adding a tag inline from the transactions list updates the row after refresh.
6. Removing a tag chip inline from the transactions list updates the row after refresh.
7. Bulk add from selected search results shows the tag chips in the refreshed list.
8. Bulk remove from selected search results removes the tag chips in the refreshed list.
9. `Tag status = Untagged` filters the list to rows with no tags.
10. `Tag status = Tagged` filters the list to rows with at least one tag.
11. `Tag status = Tagged` combines with description search and amount filters.
12. Entering a named tag in the `Tags` filter shows only transactions with that tag.
13. Entering multiple named tags in the `Tags` filter shows transactions with any of those tags.
14. Entering a named tag filter and then selecting/clearing tag status produces a stable URL and expected results.
15. The transactions search filter panel no longer shows a separate income/expense `Type` select.
16. Selection still clears after bulk tag actions, and the bulk action bar disappears.
17. Remove existing frontend tests that exercise `type=expense` or `type=income` filters.
18. Keep amount-range frontend coverage so positive and negative transaction filtering remains tested.

## Data Test IDs

Recommended additions:

- `transaction-row-tags`
- `duplicate-review-row-tags`
- `tag-cell-add`
- `tag-cell-input`
- `tag-cell-submit`
- `tag-chip`
- `filter-tags`
- `filter-tag-status`

Use row-scoped locators where possible instead of globally unique tag ids.

## Rollout Steps

1. Backend: add list-row tags and `tagStatus` filter.
2. Backend: remove transaction `type` list filtering from schema, service params, and service predicates.
3. Frontend API types: include list-row tags and `tagStatus`, and remove transaction `type` from list params.
4. Frontend search UI: remove the `Type` select while keeping signed amount filters.
5. Frontend shared tag cell: implement visible chips plus inline add/remove.
6. Transactions list: render tags and wire single-row tag mutations.
7. Duplicate review: add tags column, editable review-row tag state, and local-storage persistence.
8. Tests: add backend cases first, remove type-specific cases, then update frontend e2e cases.
9. Update `frontend/design.md` and `backend/design.md` after implementation to remove stale statements such as "duplicate review table does not need special tag-editing UI" and transaction-list `type` filtering.
