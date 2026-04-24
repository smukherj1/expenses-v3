# Tagged Generic Upload Plan

## Problem

Generic CSV and generic JSON uploads can now contain tags in the test fixtures:

- `tests/data/generic.csv` has a `Tags` column.
- `tests/data/generic.json` has a `tags` array on each transaction object.

The upload pipeline currently parses and persists only `date`, `description`, `amount`, `currency`, and `account`. Tags are dropped before duplicate review, before `/api/uploads/finalize`, and before transaction insertion. This breaks the intended backup/restore workflow where a user tags transactions in the app, exports a generic backup later, and imports it again after data loss.

## Goals

- Preserve tags supplied by generic CSV and generic JSON uploads.
- Apply uploaded tags to inserted transactions in both immediate uploads and duplicate-review finalization.
- Preserve tags through the duplicate review client-side payload so accepted rows keep their uploaded tags.
- Keep institution uploads unchanged; only generic formats accept uploaded tags.
- Keep auto-tag rules active for uploaded transactions, with uploaded tags and rule-derived tags both ending up attached.
- Ensure auto-tag rules do not create duplicate tag associations when an uploaded transaction already has the rule tag.
- Add e2e coverage in `tests/backend.test.ts` and `tests/frontend.test.ts`.

## Non-Goals

- Implement export/download backup support.
- Add tags to institution parser formats.
- Change duplicate detection semantics; duplicates remain keyed by `date + amount + description + account`, not tags.
- Replace the existing auto-tag rules system.

## Data Contract

### Generic JSON

Accept an optional `tags` property per row:

```json
{
  "date": "2015-10-16",
  "description": "Haircut",
  "amount": "-18.91",
  "currency": "CAD",
  "account": "Test Account #1",
  "tags": ["personal"]
}
```

Validation rules:

- `tags` is optional.
- If present, it must be an array of strings.
- Trim each tag.
- Drop empty tags after trimming.
- Deduplicate tags per transaction after trimming.
- Prefer preserving case exactly as provided, because existing tag names are case-sensitive by database uniqueness.

### Generic CSV

Accept an optional tags column for generic CSV only. The fixture uses `Tags`; support the same case-insensitive column behavior as the other generic columns by accepting at least:

- `tags`
- `Tags`
- `Tag`
- `tag`

CSV tag value parsing:

- Treat an empty/missing tags cell as no tags.
- Split on comma by default, because CSV quoting already protects a cell like `"groceries,food"`.
- Trim each tag.
- Drop empty tags.
- Deduplicate tags per transaction.

This means these values are valid:

```csv
Tags
"groceries"
"groceries, food"
" groceries , food , groceries "
```

## Backend Implementation

### 1. Extend Parser Types

Update `backend/src/parsers/schema.ts`:

- Add `tags?: string[]` to `ParsedTransaction`.
- Add a shared tag normalizer helper, either in this file or a small parser utility.
- Extend `rowSchema` with optional tags validation for JSON rows.

Suggested schema shape:

```ts
tags: z.array(z.string()).optional().transform(normalizeTags);
```

Use an explicit helper for normalization so CSV and JSON behave identically.

### 2. Parse Tags in Generic Parsers

Update `backend/src/parsers/json.ts`:

- Keep using `rowSchema.safeParse`.
- Include `tags: result.data.tags ?? []` in the returned parsed transaction.

Update `backend/src/parsers/csv.ts`:

- Add `TAGS_COLUMNS`.
- Find the optional tags column with `findColumn`.
- Parse the tags cell through the shared normalizer.
- Include `tags` when calling `rowSchema.safeParse`.

Institution parsers should continue returning rows without tags or with `tags: []`. Do not require changes in institution fixtures.

### 3. Preserve Tags in Upload Review Contracts

Update `backend/src/services/uploadService.ts`:

- Add `tags: string[]` to `ReviewTransaction`.
- Add `tags?: string[]` to `FinalizeUploadRow`.
- Include tags in `classifyDuplicateRows` response rows.
- Include tags when building `parsedRows` in `finalizeUpload`.

Important: duplicate keys must not include tags. A restored backup row should still be considered a duplicate if the ledger fields match, regardless of tag differences.

### 4. Insert Uploaded Tags

Update insertion logic in `uploadService.ts`:

- Keep `insertUploadRows` returning inserted ids.
- After inserting transactions, attach uploaded tags to inserted transaction ids.
- Then apply auto-tag rules, or apply rules first and uploaded tags second. Either order is acceptable if both use conflict-safe inserts.

Implementation detail:

- Add an internal helper such as `attachUploadedTags(userId, insertedIds, rows)`.
- Collect unique non-empty tag names across inserted rows.
- Use `getOrCreateTag(userId, name)` or a batched equivalent.
- Insert into `transaction_tags` with `onConflictDoNothing()`.

Expected result:

- If uploaded tags are `["groceries"]` and a matching auto-tag rule applies `food`, the transaction ends with both `groceries` and `food`.
- If uploaded tags include a tag already applied by a rule, the join table conflict is ignored.
- If uploaded tags are `["foo", "bar"]` and a matching auto-tag rule applies `bar`, the final transaction tags remain exactly `["foo", "bar"]`; the rule must not add a second `bar`.

Potential optimization:

- Current `getOrCreateTag` is fine for fixture-sized e2e tests.
- If large backup imports become slow, add a batch tag upsert in `tagService.ts`.

### 5. Validate Finalize Payload

Update `backend/src/schemas/upload.ts`:

- Add optional `tags: z.array(z.string()).optional()` to `uploadFinalizeRowSchema`.
- Reuse or mirror backend tag normalization rules after schema validation.

The finalize endpoint is part of the backup restore path because any duplicate-containing upload goes through frontend-held review state. Losing tags here would still break restore.

### 6. API Response Shape

`POST /api/uploads` `needs_review` rows should include tags:

```json
{
  "rowNumber": 1,
  "date": "2015-10-16",
  "description": "Haircut",
  "amount": -18.91,
  "currency": "CAD",
  "account": "Test Account #1",
  "duplicate": false,
  "tags": ["personal"]
}
```

Completed upload responses do not need a tags summary for this change.

## Frontend Implementation

### 1. Update Upload API Types

Update `frontend/src/api/uploads.ts`:

- Add `tags: string[]` to `UploadRow`.
- Add optional `tags?: string[]` or required `tags: string[]` to `FinalizeUploadRow`.

Prefer `tags: string[]` internally after the backend always returns an array in review rows.

### 2. Preserve Tags Through Duplicate Review

Update `frontend/src/pages/DuplicateReviewPage.tsx`:

- Include `tags: row.tags ?? []` in `buildFinalizeRows`.
- No visible table change is required for correctness.
- Optional UI improvement: show uploaded tags in the duplicate review table if `TransactionListTable` already supports tags, but avoid expanding scope if it requires table redesign.

Update `frontend/src/lib/uploadReviewStore.ts` only if type changes require it; the stored JSON payload will naturally include tags once the upload API type includes them.

### 3. Upload Page

No UX changes are required for the initial implementation. The upload page already sends raw files and handles `needs_review`; tag preservation is backend/API-contract driven.

## E2E Test Plan

### Backend: `tests/backend.test.ts`

Add helpers:

- Extend `CsvRow` with `tags?: string[]`.
- Extend `makeCsv` optionally to emit a `tags` column only for tests that need it, or add a separate `makeTaggedCsv`.
- Extend `finalizeUpload` helper rows with `tags?: string[]`.
- Add a small helper to fetch a transaction detail by account and description, then assert its `tags`.

Add test cases:

- `POST /api/uploads — imports tags from generic CSV`
  - Upload a generic CSV row with tags.
  - Fetch the inserted transaction detail using the test account IDs (to avoid leaking in real world data).
  - Assert the uploaded tags exist.
  - Assert `GET /api/tags` includes the uploaded tag names.
  - Delete all uploaded transactions with the test account IDs (similar to other tests.)

- `POST /api/uploads — imports tags from generic JSON`
  - Upload a JSON row with `tags`.
  - Fetch the inserted transaction detail using the test account IDs (to avoid leaking in real world data).
  - Assert tags are attached.
  - Delete all uploaded transactions with the test account IDs (similar to other tests.)

- `POST /api/uploads — duplicate review response preserves tags`
  - Seed an existing duplicate row.
  - Upload a tagged file containing that duplicate and a non-duplicate.
  - Assert the `needs_review.transactions` rows include `tags`.
  - Delete all uploaded transactions with the test account IDs (similar to other tests.)

- `POST /api/uploads/finalize — preserves tags for reviewed rows`
  - Finalize rows with tags directly, including an accepted duplicate if useful.
  - Fetch the inserted transaction detail using the test account IDs (to avoid leaking in real world data).
  - Assert tags are attached.
  - Delete all uploaded transactions with the test account IDs (similar to other tests.)

- `POST /api/uploads — combines uploaded tags with auto-tag rule tags`
  - Create a tag and an auto-tag rule matching a description.
  - Upload a generic row with a different uploaded tag.
  - Fetch the inserted transaction detail using the test account IDs (to avoid leaking in real world data).
  - Assert both the uploaded tag and rule-derived tag are present.
  - Delete all uploaded transactions with the test account IDs (similar to other tests.)

- `POST /api/uploads — auto-tag rule does not duplicate an uploaded tag`
  - Create tag `bar` and an auto-tag rule that applies `bar`.
  - Upload a matching generic row already tagged with `foo` and `bar`.
  - Fetch the inserted transaction detail using the test account IDs (to avoid leaking in real world data).
  - Assert the returned tags contain `foo` and `bar` once each.
  - Delete all uploaded transactions with the test account IDs (similar to other tests.)

Fixture-based coverage:

- Add one backend test that uploads `tests/data/generic.csv` as `generic_csv` and verifies at least one known row, such as `Haircut`, has `personal`.
- Add one backend test that uploads `tests/data/generic.json` as `generic_json` and verifies at least one known row has its tag.
- Because fixture account labels are static, cleanup must track the fixture accounts or use generated inline fixtures for isolation. If using checked-in fixtures, clean up `Test Account #1`, `Test Account #2` and `Test Account #3` after the test.

### Frontend: `tests/frontend.test.ts`

Add helpers:

- Extend `makeCsv` or add `makeTaggedCsv` so browser upload tests can include a `tags` column.
- Reuse existing API helpers to fetch accounts, transactions, and transaction detail after UI upload.

Add test cases:

- `uploads a tagged generic CSV file and preserves tags`
  - Upload through `/upload` with `format: generic_csv`.
  - Wait for `Inserted: N`.
  - Use API helpers to find the inserted transaction.
  - Fetch detail and assert the uploaded tags are present.

- `uploads a tagged generic JSON file and preserves tags`
  - Same as CSV, using `format: generic_json`.

- `preserves tags through duplicate review finalization`
  - Seed a duplicate.
  - Upload a tagged generic CSV or JSON with one duplicate and one non-duplicate.
  - Accept or skip duplicates as needed.
  - Finalize.
  - Fetch the inserted/accepted transaction detail and assert tags survived.

Avoid asserting that tags are visibly rendered on duplicate review unless UI rendering is explicitly added. The critical behavior is persistence after finalization.

## Acceptance Criteria

- Generic CSV `Tags` values are persisted as transaction tags.
- Generic JSON `tags` arrays are persisted as transaction tags.
- Duplicate review responses include `tags` for each row.
- `/api/uploads/finalize` accepts and persists tags.
- Uploaded tags and auto-tag rule tags are both attached without duplicate join rows.
- Existing institution upload tests still pass unchanged.
- Backend and frontend e2e tests cover immediate upload and duplicate-review finalization paths.

## Rollout Order

1. Backend parser/schema changes.
2. Backend upload service tag attachment.
3. Backend finalize validation.
4. Frontend API type and duplicate review payload changes.
5. Backend e2e tests.
6. Frontend e2e tests.
7. Run `bun run test:backend` and `bun run test:frontend`.
