# Duplicate Uploads Implementation Plan

## Goal

Change upload handling from the current "duplicates are always skipped" behavior to a two-step flow where the user can:

- Skip all duplicates.
- Accept all duplicates.
- Review duplicate candidates and accept or skip selected rows.

This plan is based on the current state of the codebase:

- Backend duplicate detection lives in [backend/src/services/uploadService.ts](/home/suvanjan/depot/expenses-v3/backend/src/services/uploadService.ts).
- Upload routing lives in [backend/src/routes/uploads.ts](/home/suvanjan/depot/expenses-v3/backend/src/routes/uploads.ts).
- Frontend upload API types live in [frontend/src/api/uploads.ts](/home/suvanjan/depot/expenses-v3/frontend/src/api/uploads.ts).
- Frontend upload UI lives in [frontend/src/pages/UploadPage.tsx](/home/suvanjan/depot/expenses-v3/frontend/src/pages/UploadPage.tsx).
- Existing backend e2e coverage is in [tests/backend.test.ts](/home/suvanjan/depot/expenses-v3/tests/backend.test.ts).
- Existing frontend e2e coverage is in [tests/frontend.test.ts](/home/suvanjan/depot/expenses-v3/tests/frontend.test.ts).

## Current Behavior

Today the backend resolves accounts, detects duplicates by `(date, amount, description, account)`, silently excludes duplicate rows from insertion, and returns:

- `inserted`
- `duplicatesSkipped`
- `duplicateWarnings`

The frontend only shows a success summary and an expandable duplicate warning list. There is no way to override the skip behavior. The current backend and frontend tests both assert that re-uploaded duplicates are skipped automatically.

## Target Behavior

The upload flow should become:

1. User selects a file and submits it.
2. Backend parses the file and checks for duplicates.
3. If there are no duplicates, the upload completes immediately.
4. If duplicates exist, backend returns a structured "review required" response without inserting anything yet.
5. Frontend shows a duplicate-review UI with bulk and per-row actions.
6. User chooses one of:
   - skip all duplicates
   - accept all duplicates
   - review and decide row-by-row or for a selected subset
7. Frontend submits only the rows it wants inserted on the second request.
8. For rows that were duplicates in the first response and are still being submitted intentionally, the frontend marks them with `allowDuplicate`.
9. Backend reparses the second request, recomputes duplicate status, validates the client decisions, inserts the allowed rows, and then applies auto-tag rules.

## Design Constraints

- Duplicate identity stays aligned with the PRD and current implementation: same `date + amount + description + account`.
- Non-duplicate rows should not require manual review.
- The design should stay stateless on the server for duplicate review. No upload-review record, token, or pending draft row set is required.
- The backend stays authoritative for parsing, normalization, account resolution, and duplicate classification.
- The client may keep review state in memory for the current file, but the server should not trust the client to mutate transaction contents arbitrarily.
- Existing "single POST completes upload" behavior should still work when no duplicates are present.

## Recommended API Shape

### 1. Keep the initial upload endpoint for classification

Keep `POST /api/uploads` as the initial upload endpoint, but change its response contract.

Possible response modes:

- `status: "completed"` when no duplicates were found.
- `status: "needs_review"` when duplicates were found

Recommended initial response shapes:

```json
{
  "status": "completed",
  "summary": {
    "inserted": 3,
    "duplicates": 0
  }
}
```

```json
{
  "status": "needs_review",
  "summary": {
    "inserted": 0,
    "duplicates": 1
  },
  "transactions": [
    {
      "rowNumber": 1,
      "date": "2025-03-01",
      "description": "Payroll",
      "amount": 2500,
      "currency": "CAD",
      "account": "Uploads Test - Chequing",
      "duplicate": false
    },
    {
      "rowNumber": 2,
      "date": "2025-03-02",
      "description": "Grocery Store",
      "amount": -82.5,
      "currency": "CAD",
      "account": "Uploads Test - Chequing",
      "duplicate": true
    }
  ]
}
```

Notes:

- `transactions` should include the parsed upload rows in upload order.
- `rowNumber` is for UI mapping only.
- The server response does not need to allocate persistent IDs for review rows.

### 2. Add a second stateless finalize endpoint

Recommended endpoint:

- `POST /api/uploads/finalize`

Recommended request shape:

```json
{
  "transactions": [
    {
      "date": "2025-03-01",
      "description": "Payroll",
      "amount": 2500,
      "currency": "CAD",
      "account": "Uploads Test - Chequing"
    },
    {
      "date": "2025-03-02",
      "description": "Grocery Store",
      "amount": -82.5,
      "currency": "CAD",
      "account": "Uploads Test - Chequing",
      "allowDuplicate": true
    }
  ]
}
```

The client should send:

- all rows it expects to insert
- no rows it wants to skip
- `allowDuplicate: true` only for rows the user explicitly chose to upload despite duplication

Recommended final response shape:

```json
{
  "status": "completed",
  "inserted": 4,
  "duplicates": 1
}
```

### Why this shape is the best fit

- It avoids server-side review storage entirely.
- It keeps the common case unchanged: one request when there are no duplicates.
- It lets the frontend own the review state without making the backend trust frontend duplicate detection.
- It avoids sending explicit skip decisions, because skipped rows are simply omitted from the finalize payload.
- It keeps the server-side contract small: the only extra per-row flag is `allowDuplicate`.

## Backend Plan

### 1. Split upload into classify and finalize operations

Refactor [backend/src/services/uploadService.ts](/home/suvanjan/depot/expenses-v3/backend/src/services/uploadService.ts) into explicit steps:

- `parseAndValidateUpload`
- `resolveAccountsForUpload`
- `classifyDuplicateRows`
- `insertUploadRows`
- `finalizeReviewedUpload`

Expected behavior:

- Initial upload request parses and validates the file.
- If no duplicates exist, insert immediately as today.
- If duplicates exist:
  - insert nothing
  - return `status: "needs_review"`
  - return the parsed rows with duplicate flags so the client can decide what to resend

### 2. Finalization rules

The finalize endpoint should accept a JSON payload of transactions rather than multipart file upload.

On finalize, the backend should:

1. Validate the submitted transaction payload.
2. Resolve accounts exactly the same way as the initial upload path.
3. Recompute duplicate status against the current database.
4. Reject any row that is currently a duplicate unless `allowDuplicate === true`.
5. Insert all remaining rows.
6. Apply auto-tag rules only to actually inserted transaction IDs.

Recommended validation rules:

- If a submitted row is a duplicate and `allowDuplicate` is missing or false, return `400 VALIDATION_ERROR`.
- If a submitted row has `allowDuplicate: true` but is not actually a duplicate at finalize time, accept it anyway. The flag is harmless in that case.
- Ignore skip semantics entirely on the server. Skipped rows are represented by absence from the finalize request.
- Continue to reject malformed rows and unsupported currencies exactly as in the initial upload flow.

This keeps the protocol simple:

- "upload these rows if they are non-duplicates"
- "upload these rows even if they are duplicates"

### 3. Handle race conditions explicitly

The database can change between the initial classification request and the finalize request.

Recommended rule:

- The finalize request is evaluated against current database state, not against a saved snapshot.

Implications:

- A row that was non-duplicate in the first response may become duplicate before finalize. In that case the finalize request should fail unless that row is resubmitted with `allowDuplicate: true`.
- A row that was duplicate in the first response may stop being duplicate only in unusual cases such as deletion; if the client still sends `allowDuplicate: true`, the backend can still insert it.

This is the main tradeoff of removing server-side review state. It is acceptable because it keeps the backend stateless and the rule easy to explain.

### 4. Decide whether to support partial rejection or fail-fast

Two valid backend behaviors exist for finalize:

- fail the entire finalize request if any submitted row is duplicate without `allowDuplicate`
- insert valid rows and reject only the invalid subset

Recommended behavior:

- fail the entire finalize request

Reasoning:

- It prevents partial surprises when the client and server disagree about duplicate classification.
- It forces the frontend to refresh its review state if the underlying data changed.
- It keeps tests and error handling simpler.

### 5. Update backend schemas and route validation

Add or update schema definitions for:

- initial upload response union
- finalize request payload
- finalize response payload

Files likely affected:

- [backend/src/routes/uploads.ts](/home/suvanjan/depot/expenses-v3/backend/src/routes/uploads.ts)
- [backend/src/services/uploadService.ts](/home/suvanjan/depot/expenses-v3/backend/src/services/uploadService.ts)
- any upload-specific schema files under `backend/src/schemas/`

### 6. Keep upload history semantics simple

This design does not create pending review records, so there is no pending upload history state to model.

## Frontend Plan

### 1. Change the upload client types

Update [frontend/src/api/uploads.ts](/home/suvanjan/depot/expenses-v3/frontend/src/api/uploads.ts) to match the new server return types.

Recommended client types:

- `UploadResult`
- `FinalizeUploadResult`

Also add a second client function:

- `finalizeUpload(transactions)`

### 2. Add duplicate-review state to `UploadPage`

Update [frontend/src/pages/UploadPage.tsx](/home/suvanjan/depot/expenses-v3/frontend/src/pages/UploadPage.tsx) so it manages:

- selected file
- initial upload request state
- parsed review data returned by the server
- client-side decisions for duplicate rows
- finalization request state
- final completed result

Recommended page states:

- idle
- uploading
- review_required
- finalizing
- completed
- error

### 3. Replace the current warning-only UI with an actionable review flow

Current UI only renders:

- inserted count
- duplicates skipped count
- duplicate warnings list

Recommended replacement when `status === "needs_review"`:

- summary banner showing parsed rows, duplicates found, and non-duplicate rows ready to upload
- primary actions:
  - `Skip all duplicates`
  - `Upload all duplicates`
  - `Confirm selected`
- duplicate table with:
  - checkbox per row
  - select all / clear all control
  - date, description, amount, account columns

Recommended behavior:

- default all checkboxes unchecked
- `Skip all duplicates` submits only rows where `isDuplicate === false`
- `Upload all duplicates` submits every row, with `allowDuplicate: true` attached to rows where `isDuplicate === true`
- `Confirm selected` submits:
  - all non-duplicate rows
  - selected duplicate rows with `allowDuplicate: true`
  - no unselected duplicate rows

### 4. Preserve the simple path when no duplicates are found

If the backend returns `status: "completed"` from the initial request:

- keep the success panel
- no review UI should appear

This avoids regressing the common case.

### 5. Add stable test selectors

The current page only exposes:

- `upload-file-input`
- `upload-submit`
- `upload-result`
- `upload-error`

Add explicit selectors for the new review flow, for example:

- `duplicate-review`
- `duplicate-row-<rowNumber>`
- `duplicate-select-all`
- `duplicate-skip-all`
- `duplicate-accept-all`
- `duplicate-confirm-selected`
- `duplicate-selected-count`

This keeps Playwright-style tests stable and avoids brittle text-only selectors.

## E2E Test Plan

The current tests assume duplicates are skipped automatically. Those assertions must change to reflect the new two-step flow.

### Backend e2e changes in `tests/backend.test.ts`

#### Keep these scenarios

- uploading non-duplicate rows inserts immediately
- auto-created accounts still work
- non-CAD validation still works
- valid JSON upload still works

#### Replace the current duplicate test

Current test to replace:

- `POST /api/uploads — skips duplicate rows on second upload`

New backend coverage should include:

1. `POST /api/uploads — returns needs_review when duplicates are present`
   - seed one upload
   - re-upload one duplicate and one new row
   - assert response status is `201`
   - assert payload has `status: "needs_review"`
   - assert duplicate count is `1`
   - assert nothing new has been inserted yet

2. `POST /api/uploads/finalize — skip_all inserts only non-duplicates`
   - submit only the non-duplicate rows from the review response
   - assert final response reports `inserted: 1`, `duplicatesSkipped: 1`, `duplicatesAccepted: 0`
   - fetch transactions and assert only the new non-duplicate row was added

3. `POST /api/uploads/finalize — accept_all inserts duplicates too`
   - create a fresh review response
   - submit all rows and set `allowDuplicate: true` on the duplicate rows
   - assert both rows are inserted
   - assert duplicate row count for that account increases as expected

4. `POST /api/uploads/finalize — custom selection inserts only approved duplicates`
   - create a review response with multiple duplicate rows
   - submit all non-duplicate rows plus a chosen subset of duplicate rows marked with `allowDuplicate: true`
   - assert only selected duplicates plus all non-duplicates are inserted

5. `POST /api/uploads/finalize — rejects duplicate rows missing allowDuplicate`
   - intentionally submit a duplicate row without `allowDuplicate`
   - assert `400 VALIDATION_ERROR`

6. `POST /api/uploads/finalize — fails if duplicate state changed between requests`
   - classify a file where one row is initially non-duplicate
   - insert a conflicting row before finalize
   - submit finalize payload without `allowDuplicate`
   - assert the finalize request fails and inserts nothing

#### Test helper updates

Extend the upload helpers in [tests/backend.test.ts](/home/suvanjan/depot/expenses-v3/tests/backend.test.ts):

- keep `uploadCsv`
- replace `uploadCsvOk` with a helper that returns the full response body instead of only `{ inserted, duplicatesSkipped }`
- add `finalizeUpload`
- add transaction-count helpers for exact assertions after classification and finalize

### Frontend e2e changes in `tests/frontend.test.ts`

#### Keep these scenarios

- upload page loads
- non-duplicate CSV upload shows success
- JSON upload still succeeds

#### Replace the current duplicate UI test

Current test to replace:

- `shows duplicate-skipped count on re-upload of same rows`

New frontend coverage should include:

1. `shows duplicate review UI when duplicates are detected`
   - seed initial upload
   - upload a file containing one duplicate and one new row
   - assert the review panel appears
   - assert the duplicate row is listed
   - assert success summary is not shown yet

2. `skip all duplicates finalizes the upload`
   - click `duplicate-skip-all`
   - assert final result shows only the new row inserted
   - assert duplicate skipped count is `1`

3. `accept all duplicates finalizes the upload`
   - create a fresh review
   - click `duplicate-accept-all`
   - assert inserted count includes duplicate rows

4. `confirm selected accepts only checked duplicates`
   - create a review with at least two duplicate rows
   - check one row
   - click `duplicate-confirm-selected`
   - assert result reflects one accepted and one skipped duplicate

5. `review actions are disabled while finalizing`
   - click any finalize action
   - assert controls disable until completion

6. `review UI recovers from finalize rejection`
   - force a duplicate-state mismatch between review and finalize
   - assert the finalize error is shown
   - assert the user can retry after refreshing or re-uploading

#### Frontend helper updates

Update helper logic in [tests/frontend.test.ts](/home/suvanjan/depot/expenses-v3/tests/frontend.test.ts):

- keep `uploadAndWaitForResult` only for the no-duplicates path, or rename it to clarify its scope
- add `uploadAndWaitForReview`
- add helpers for clicking review actions and waiting for the final result state

The current helper assumes every upload ends in either `upload-result` or `upload-error`. That assumption will break once a third state, `duplicate-review`, is introduced.

## Suggested Implementation Order

1. Refactor backend upload service into classify, insert, and finalize steps.
2. Add `POST /api/uploads/finalize`.
3. Update backend e2e tests first so the contract is executable.
4. Update frontend upload API types to match the new contract.
5. Build the duplicate-review UI and client-side decision state in `UploadPage`.
6. Update frontend e2e tests to cover the new interactive flow.
7. Run the full backend and frontend e2e suites and fix contract mismatches.

## Key Decisions To Lock Before Coding

1. Should the initial `needs_review` response include all parsed rows, or only duplicates plus summary counts? Answer: Include all parsed rows to avoid ambiguity in the next upload attempt.
2. Should finalize accept transaction JSON only, or should it also support resubmitting the original file format? Answer: JSON only as the upload API returns JSON.
3. Should finalize fail the whole request on decision mismatch, or return row-level errors for partial retry? Answer: Fail the whole request.
4. Should the duplicate review list show only candidate upload rows, or also the matching existing transaction for comparison? Answer: Only candidate upload rows.
5. Should a completed "skip everything" review produce an upload-history record? Answer: No because we're not recording upload history.

## Out of Scope

- Reworking duplicate identity beyond the existing `(date, amount, description, account)` rule
- File-level deduplication based on upload hash
- Persisting upload-review state on the server
- Comparing uploaded duplicate rows against existing transaction IDs in the UI
- Editing transaction fields during duplicate review
- Multi-file duplicate review in one combined session

## Definition of Done

This work is done when:

- duplicate uploads no longer auto-skip without user choice
- backend supports `completed` and `needs_review` upload outcomes
- backend supports a stateless finalize endpoint that accepts selected rows and `allowDuplicate`
- frontend lets the user skip all, accept all, or accept a selected subset of duplicates
- non-duplicate uploads still complete in one step
- backend e2e tests cover `needs_review`, skip-all via omission, accept-all via `allowDuplicate`, custom selection, and finalize mismatch errors
- frontend e2e tests cover review rendering and all finalize actions
