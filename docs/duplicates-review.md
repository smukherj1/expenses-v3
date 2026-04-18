# Duplicate Review Flow Design

## Purpose

Move duplicate transaction review out of the upload page and into a dedicated
review page. The upload page should stay focused on file selection and upload
status, while duplicate decisions happen in a route that can support large
review sets with client-side pagination.

This design refines the existing upload flow described in [PRD.md](../PRD.md),
[design.md](../design.md), [frontend/design.md](../frontend/design.md), and
[backend/design.md](../backend/design.md).

## Problem

The current frontend renders duplicate review inline on `/upload`. When an
upload has many duplicates, `/upload` becomes a giant page with one rendered
label/card per parsed row. This creates:

- Poor scanability when the user needs to review tens or hundreds of duplicate
  rows.
- Slow interaction and layout work because every row is rendered at once.
- A muddled page responsibility: upload input, review workflow, and completion
  summary all live in one component.
- Limited room to add review-specific affordances such as page size, selected
  counts, duplicate-only filters, and a sticky action bar.

## Goals

- Route all `needs_review` uploads to a dedicated duplicate review page.
- Use client-side pagination for review rows so large uploads never render as
  one giant list.
- Preserve the existing backend's stateless review model: no pending upload
  records are required server-side.
- Keep all existing duplicate actions:
  - skip all duplicates
  - accept all duplicates
  - accept or skip individual duplicates
  - accept or skip multiple entries by selection
- Make non-duplicate rows safe by default: include them in finalization and do
  not require user decisions for them.
- Keep the finalize path resilient by relying on the backend's existing
  duplicate recomputation before insert.

## Non-Goals

- Do not introduce persisted upload drafts or server-side review sessions.
- Do not add server-side pagination for duplicate review rows; review rows are
  already returned by `POST /api/uploads` and will be paginated client-side.
- Do not change duplicate matching semantics. Duplicates remain exact matches on
  date, amount, description, and account.
- Do not add fuzzy duplicate detection.
- Do not require authentication changes.

## Proposed PRD Changes

Update the "Transaction Upload" section in [PRD.md](../PRD.md):

- Add `/upload/duplicates` to the information architecture as the page for
  duplicate transaction review after upload classification.
- Clarify that any upload requiring duplicate review navigates away from
  `/upload` to the dedicated review page, regardless of duplicate count.
- Clarify that duplicate review must support large result sets with client-side
  pagination.
- Clarify that non-duplicate rows in a reviewed upload are included by default
  and duplicate rows are skipped by default unless accepted by the user.
- Clarify that users can finalize from the review page and then see a completion
  summary before returning to upload or transactions.

Suggested PRD wording:

```md
Duplicate detection: warn when a transaction with the same date + amount +
description already exists for that account. Uploads requiring duplicate review
navigate to a dedicated duplicate review page. The review page supports
client-side pagination for large uploads and lets the user skip all duplicates,
accept all duplicates, or accept/skip duplicate rows individually or in bulk.
Non-duplicate rows are included by default.
```

Update the "Information Architecture" section:

```text
/upload                 -> Upload transactions
/upload/duplicates      -> Review duplicate rows from the most recent upload
```

## Current Behavior

Current backend behavior:

- `POST /api/uploads` parses a CSV or JSON file.
- If no duplicates exist, rows are inserted immediately and response status is
  `completed`.
- If duplicates exist, the response status is `needs_review` and includes every
  parsed row with a `duplicate` flag.
- `POST /api/uploads/finalize` accepts the selected rows, revalidates currency,
  recomputes duplicate status, rejects duplicate rows unless `allowDuplicate` is
  true, inserts rows, applies auto-tag rules, and returns a completion summary.

Current frontend behavior:

- `UploadPage` stores the `needs_review` response in local component state.
- It renders every returned row inline on `/upload`.
- Duplicate rows are unchecked by default; non-duplicates are checked and
  disabled.
- Finalization sends only checked rows to `POST /api/uploads/finalize`.

## Proposed User Flow

### No Duplicates

1. User selects or drops a file on `/upload`.
2. Frontend calls `POST /api/uploads`.
3. Backend returns `status: "completed"`.
4. `/upload` shows the existing success summary.

### Duplicates Found

1. User selects or drops a file on `/upload`.
2. Frontend calls `POST /api/uploads`.
3. Backend returns `status: "needs_review"` with all parsed rows.
4. Frontend stores the review payload in a client-side review store.
5. Frontend navigates to `/upload/duplicates`.
6. Review page renders upload summary, decision controls, and a paginated table.
7. User changes duplicate decisions.
8. User finalizes.
9. Frontend calls `POST /api/uploads/finalize` with included rows.
10. Review page shows a completion summary and offers navigation to
    `/upload` or `/transactions`.

### Direct Navigation or Lost Review State

If the user opens `/upload/duplicates` without an active review payload:

- Show an empty state explaining that there is no upload awaiting review.
- Provide a primary action linking back to `/upload`.

If the user refreshes `/upload/duplicates`:

- Restore review state from `sessionStorage` when available.
- If no stored state exists, show the empty state.

## Routing Design

Add a route in [frontend/src/App.tsx](../frontend/src/App.tsx):

```tsx
<Route path="upload/duplicates" element={<DuplicateReviewPage />} />
```

Route behavior:

- `/upload` remains the entry point for file selection.
- `/upload/duplicates` is reachable only when client review state exists.
- The route does not need a URL parameter in the first implementation because
  review state is client-owned and not persisted on the backend.

Future server-side review sessions could evolve this to
`/upload/duplicates/:reviewId`, but that is intentionally out of scope for this
iteration.

## Frontend State Design

The review payload should be stored outside `UploadPage` so navigation does not
lose it.

Recommended minimal approach:

- Create `frontend/src/lib/uploadReviewStore.ts`.
- Keep an in-memory module variable for same-session navigation.
- Mirror the payload to `sessionStorage` so refresh works.
- Clear the store after successful finalization or explicit cancel.

Why not only React Router navigation state:

- `navigate("/upload/duplicates", { state })` works for immediate navigation,
  but state is lost on refresh and cannot be recovered if the user reloads the
  review page.
- A tiny store plus `sessionStorage` keeps the backend stateless while improving
  UX.

Suggested shape:

```ts
export interface UploadReviewSession {
  createdAt: string;
  sourceFileName: string;
  result: UploadReviewResult;
}

export function saveUploadReviewSession(session: UploadReviewSession): void;
export function loadUploadReviewSession(): UploadReviewSession | null;
export function clearUploadReviewSession(): void;
```

Storage constraints:

- The app already supports files up to 10 MB. Storing the parsed review payload
  in `sessionStorage` should be acceptable for the first implementation, but the
  code should handle quota errors gracefully.
- If `sessionStorage` write fails, keep the in-memory value and continue
  navigation. Refresh recovery will not be available in that case.

## Component Design

### `UploadPage`

Responsibilities after this change:

- File selection and drag/drop.
- Calling `uploadFile`.
- Showing parse/upload errors.
- Showing immediate completion summaries when there are no duplicates.
- Saving review session and navigating to `/upload/duplicates` when
  `status === "needs_review"`.

Remove from `UploadPage`:

- Inline duplicate review card.
- Duplicate selection state.
- Finalize mutation.
- Row rendering for duplicate review.

### `DuplicateReviewPage`

New page: `frontend/src/pages/DuplicateReviewPage.tsx`.

Responsibilities:

- Load active review session.
- Initialize decisions:
  - non-duplicate rows included by default
  - duplicate rows skipped by default
- Render summary counts:
  - total rows
  - duplicate rows
  - non-duplicate rows
  - rows currently selected for import
  - duplicate rows currently accepted
- Render bulk controls:
  - skip all duplicates
  - accept all duplicates
  - select current page duplicates
  - clear current page duplicates
- Render paginated review table.
- Build `FinalizeUploadRow[]` from included rows.
- Call `finalizeUpload`.
- Clear review session after successful finalization.
- Show completion summary.
- Handle empty/missing review session.

### `DuplicateReviewTable`

New component: `frontend/src/components/DuplicateReviewTable.tsx`.

Props:

```ts
interface DuplicateReviewTableProps {
  rows: UploadRow[];
  decisions: Record<number, boolean>;
  page: number;
  limit: number;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
  onToggleDuplicate: (rowNumber: number) => void;
  onSetPageDuplicates: (accepted: boolean) => void;
}
```

Behavior:

- Paginate client-side with `rows.slice(start, end)`.
- Use the existing `Pagination` component for page navigation.
- Render rows in a table rather than stacked cards to improve density.
- Disable checkboxes for non-duplicate rows because they are always included.
- Include accessible labels for duplicate decision checkboxes.
- Keep row identity keyed by `row.rowNumber`.

### `DuplicateReviewSummary`

Optional component for keeping the page readable.

Props:

```ts
interface DuplicateReviewSummaryProps {
  sourceFileName: string;
  totalRows: number;
  duplicateRows: number;
  includedRows: number;
  acceptedDuplicateRows: number;
}
```

## Pagination Design

Pagination is client-side because the backend returns a finite review payload
from upload classification and does not persist review sessions.

Defaults:

- Default page size: 25 rows.
- Page size options: 25, 50, 100.
- Current page resets to 1 when page size changes.
- If filtering is added later, page resets to 1 when filters change.

Selection semantics:

- Decisions are stored by `rowNumber`, not by visible index.
- Changing pages must not lose decisions.
- Bulk "accept all duplicates" and "skip all duplicates" apply to the full
  upload, not only the visible page.
- Page-level actions should be explicitly labeled "on this page".

## Finalize Payload

Build the finalize payload from all included rows:

```ts
const transactions: FinalizeUploadRow[] = reviewRows
  .filter((row) => decisions[row.rowNumber])
  .map((row) => ({
    date: row.date,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    account: row.account,
    allowDuplicate: row.duplicate ? true : undefined,
  }));
```

Important behavior:

- Non-duplicate rows are included because their default decision is `true`.
- Skipped duplicates are omitted.
- Accepted duplicates include `allowDuplicate: true`.
- The backend still recomputes duplicate status at finalize time, so the
  frontend decision state is not trusted for correctness.

Concurrency note:

- A row that was non-duplicate during classification can become duplicate before
  finalization if another upload inserts the same transaction. In that case,
  the backend will reject the finalize request unless the submitted row includes
  `allowDuplicate: true`.
- For the first implementation, surface this backend validation error and ask
  the user to re-upload/review. A future enhancement can add a conflict recovery
  flow that reclassifies and updates the review page.

## Backend Design

No backend API changes are required for the first implementation.

Keep:

- `POST /api/uploads`
- `POST /api/uploads/finalize`
- Existing response shapes in [frontend/src/api/uploads.ts](../frontend/src/api/uploads.ts)
- Existing duplicate recomputation in `finalizeUpload`

Recommended backend documentation updates:

- Amend [backend/design.md](../backend/design.md) to clarify that duplicate
  review is presented on a dedicated frontend route, but server behavior remains
  stateless.
- Clarify that `POST /api/uploads` may return a large review payload and the
  frontend paginates it client-side.

Potential future backend enhancement:

- Add persisted `upload_review_sessions` if review payload size or refresh
  resilience becomes a problem.
- Then change the upload response to return a `reviewId`, and fetch pages with
  `GET /api/uploads/reviews/:id/rows?page=&limit=`.
- This is not recommended now because it adds lifecycle, cleanup, auth, and
  partial state complexity without being necessary for the current problem.

## Error Handling

Upload page:

- Continue showing validation, parse, currency, and network errors from
  `POST /api/uploads`.
- If saving review state fails due to `sessionStorage` quota, continue with
  in-memory state and optionally show a non-blocking note that refresh recovery
  is unavailable.

Duplicate review page:

- Missing review state: show empty state with link to `/upload`.
- Finalize validation error: show backend message and keep decisions intact.
- Finalize network error: show retryable error and keep decisions intact.
- Successful finalize: clear review session and show completion summary.

## Accessibility

- Use a semantic table for review rows.
- Checkbox labels must include row number and transaction description.
- Bulk action buttons must have visible text that scopes the action clearly.
- Pagination controls should remain keyboard accessible through native buttons.
- Completion summary should be announced through normal page content; no modal is
  required.

## Testing Plan

### Frontend E2E Tests

Update the existing upload-review coverage in
[tests/frontend.test.ts](../tests/frontend.test.ts) so tests no longer expect
inline review content on `/upload`.

Helper changes:

- Replace `uploadAndWaitForOutcome` waiting for
  `[data-testid="upload-review"]` on `/upload` with route-aware behavior.
- The helper should wait for one of:
  - `[data-testid="upload-result"]`
  - `[data-testid="upload-error"]`
  - URL matching `/upload/duplicates`
- If the URL becomes `/upload/duplicates`, return `{ kind: "review" }` and read
  review text from the duplicate review page, not from `/upload`.
- Keep existing behavior for immediate `completed` uploads and upload errors.

Recommended new test ids:

- `duplicate-review-page` on the review page root.
- `duplicate-review-empty` for direct navigation without review state.
- `duplicate-review-summary` for counts.
- `duplicate-review-table` for the paginated table.
- `duplicate-review-row-{rowNumber}` for visible rows.
- `duplicate-review-checkbox-{rowNumber}` for duplicate decision checkboxes.
- `duplicate-review-page-size` for the page size select.
- `duplicate-review-page-accept` for accepting visible page duplicates.
- `duplicate-review-page-skip` for skipping visible page duplicates.
- `skip-duplicates` for global skip-all duplicates.
- `accept-duplicates` for global accept-all duplicates.
- `upload-finalize` for finalization from the review page.
- `upload-result` for the post-finalize completion summary.

Existing test updates:

- Update `"shows duplicate review and can skip duplicates"`:
  - Upload a file that has one existing duplicate and one new row.
  - Assert navigation to `/upload/duplicates`.
  - Assert `[data-testid="duplicate-review-page"]` is visible.
  - Assert the summary reports the duplicate count.
  - Click `[data-testid="skip-duplicates"]`.
  - Click `[data-testid="upload-finalize"]`.
  - Assert `[data-testid="upload-result"]` shows `Inserted: 1` and
    `Duplicates: 0`.
- Update `"can accept duplicate rows during review"`:
  - Upload a file that has one existing duplicate and one new row.
  - Assert navigation to `/upload/duplicates`.
  - Click `[data-testid="accept-duplicates"]`.
  - Finalize.
  - Assert the result shows `Inserted: 2` and `Duplicates: 1`.
- Update any assertions that look for `Duplicate review required` inside
  `[data-testid="upload-review"]`; that text should now be asserted on
  `[data-testid="duplicate-review-summary"]` or the page root.

New E2E tests:

- `navigates duplicate uploads to the dedicated review page`:
  - Seed an existing transaction through the first upload.
  - Upload a second file containing that duplicate.
  - Assert the browser URL is `/upload/duplicates`.
  - Assert `/upload` does not contain `[data-testid="upload-review"]`.
- `shows an empty state when duplicate review is opened without state`:
  - Navigate directly to `/upload/duplicates` in a fresh page context.
  - Assert `[data-testid="duplicate-review-empty"]` is visible.
  - Assert the empty state links back to `/upload`.
- `paginates large duplicate review sets client-side`:
  - Seed at least 30 existing transactions for a unique account.
  - Upload a second file with the same 30 transactions so every row is a
    duplicate.
  - Assert the review page uses the default page size of 25.
  - Assert row 1 and row 25 are visible.
  - Assert row 26 is not visible on page 1.
  - Click the next-page control in `[data-testid="pagination"]`.
  - Assert row 26 is visible on page 2.
- `preserves duplicate decisions across pages`:
  - Use the same large duplicate fixture.
  - Accept row 1 on page 1.
  - Navigate to page 2 and accept row 26.
  - Navigate back to page 1.
  - Assert row 1 remains checked.
  - Finalize.
  - Assert the result shows `Inserted: 2` and `Duplicates: 2`.
- `page-level duplicate actions only affect visible rows`:
  - Use a large duplicate fixture with more than one page.
  - Click `[data-testid="duplicate-review-page-accept"]` on page 1.
  - Navigate to page 2.
  - Assert page 2 duplicate checkboxes remain unchecked.
  - Finalize from page 2 or navigate back and finalize.
  - Assert inserted/duplicate counts match only the accepted page 1 rows.
- `changing page size resets pagination without losing decisions`:
  - Use a large duplicate fixture.
  - Accept row 1.
  - Navigate to page 2.
  - Change `[data-testid="duplicate-review-page-size"]` from 25 to 50.
  - Assert the page returns to page 1.
  - Assert row 1 remains checked.
- `refresh restores a pending duplicate review from sessionStorage`:
  - Upload a duplicate file and land on `/upload/duplicates`.
  - Reload the page.
  - Assert the review page and summary are still visible.
  - Finalize successfully.
- `successful finalization clears review state`:
  - Finalize a duplicate review.
  - Navigate back to `/upload/duplicates`.
  - Assert the empty state is shown.

Fixture guidance:

- Generate large CSV fixtures in the test with `makeCsv` instead of checking in
  static files.
- Use unique account labels and descriptions per test to avoid cross-test
  collisions in a shared database.
- For pagination assertions, keep row descriptions deterministic, for example
  `Paged Duplicate 01` through `Paged Duplicate 30`.
- Prefer asserting visible row test ids over counting all DOM rows; the behavior
  under test is that only the current page is rendered.

Core scenarios covered by the updated and new tests:

- Uploading a duplicate file navigates to `/upload/duplicates`.
- The review page shows duplicate summary counts.
- "Skip all duplicates" followed by finalize inserts only non-duplicate rows.
- "Accept all duplicates" followed by finalize inserts duplicate rows.
- A fixture with more than 25 rows shows pagination and does not render all rows
  on the first page.
- Decisions made on page 1 persist after navigating to page 2 and back.
- Direct navigation to `/upload/duplicates` without state shows the empty state.

### Backend Tests

No new backend behavior is required, so existing backend upload/finalize tests
should continue to pass.

## Implementation Plan

1. Create `frontend/src/lib/uploadReviewStore.ts`.
2. Add `DuplicateReviewPage` and route `/upload/duplicates`.
3. Extract review UI into `DuplicateReviewTable` and optional
   `DuplicateReviewSummary`.
4. Update `UploadPage` so `needs_review` saves the review session and navigates
   to `/upload/duplicates`.
5. Remove inline duplicate review and finalize logic from `UploadPage`.
6. Add client-side pagination with page size controls.
7. Add empty-state handling for missing review state.
8. Update frontend E2E tests for the new route and pagination.
9. Update [frontend/design.md](../frontend/design.md) to document the new route
   and component hierarchy.
10. Update [backend/design.md](../backend/design.md) only to clarify that the
    backend remains stateless while the frontend review page paginates
    client-side.
11. Apply the PRD changes listed above.

## Acceptance Criteria

- Any `needs_review` upload navigates from `/upload` to `/upload/duplicates`.
- `/upload` no longer renders duplicate review rows inline.
- `/upload/duplicates` paginates review rows client-side with a default page
  size of 25.
- Duplicate decisions persist across pagination.
- Non-duplicate rows are included by default and cannot be accidentally skipped
  through duplicate review controls.
- Users can skip all duplicates, accept all duplicates, and toggle individual
  duplicate rows.
- Finalize sends only included rows and marks accepted duplicates with
  `allowDuplicate: true`.
- Successful finalization clears the review session and shows inserted and
  duplicate counts.
- Refreshing `/upload/duplicates` restores the pending review when
  `sessionStorage` is available.
- Direct navigation to `/upload/duplicates` without pending review shows a clear
  empty state and a link back to `/upload`.
