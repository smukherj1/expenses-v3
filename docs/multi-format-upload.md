# Multi-Format Upload Design and Testing Plan

## Scope

Support importing transactions from these formats:

- Generic CSV
- Generic JSON
- TD Canada CSV
- RBC Canada CSV
- American Express Canada CSV
- CIBC CSV

The institution CSV fixtures are:

- `tests/data/td.csv`
- `tests/data/rbc.csv`
- `tests/data/amex.csv`
- `tests/data/cibc.csv`

## Decisions

- Users explicitly choose the upload format. There is no auto-detection in this iteration.
- Institution CSV uploads require an account label selected from existing accounts or entered as free-form text.
- Generic CSV and JSON uploads continue to require row-level `account` fields and do not require a separate account label.
- Account numbers or card numbers found in source files are not persisted.
- All rows are imported, including payments, credits, refunds, and transfers. Analytics can later filter or exclude these categories.
- The canonical amount model remains: expenses and charges are negative; income, credits, refunds, and credit-card payments are positive.
- American Express Canada amounts are inverted during import because its export presents charges as positive values.
- Duplicate detection remains `(date, amount, description, account)` after source-format normalization.
- Duplicate review remains stateless. The backend returns normalized rows to the frontend, and the frontend sends selected normalized rows to finalize.

## User Journey

1. User opens `/upload`.
2. User selects a format:
   - Generic CSV
   - Generic JSON
   - TD Canada CSV
   - RBC Canada CSV
   - American Express Canada CSV
   - CIBC CSV
3. If the selected format is an institution CSV, user selects an existing account label or types a new one.
4. User selects or drops a file.
5. Frontend submits `multipart/form-data` to `POST /api/uploads`.
6. Backend parses the selected format and normalizes rows.
7. Backend rejects the upload if any row is invalid or non-CAD.
8. Backend classifies duplicates against normalized rows.
9. If no duplicates exist, backend inserts immediately and returns a completed summary.
10. If duplicates exist, backend returns normalized rows with duplicate flags.
11. Frontend stores the review payload client-side and navigates to `/upload/duplicates`.
12. User accepts or skips duplicate rows.
13. Frontend sends included rows to `POST /api/uploads/finalize`.
14. Backend recomputes duplicate status, requires `allowDuplicate` for included duplicate rows, inserts rows, and applies auto-tag rules.

## API Contract

### `POST /api/uploads`

Request:

```txt
Content-Type: multipart/form-data

file: File
format: generic_csv | generic_json | td_canada | rbc_canada | amex_canada | cibc_canada
accountLabel: string
```

`accountLabel` is required for:

- `td_canada`
- `rbc_canada`
- `amex_canada`
- `cibc_canada`

`accountLabel` is not required for:

- `generic_csv`
- `generic_json`

Completed response:

```json
{
  "status": "completed",
  "format": "td_canada",
  "summary": {
    "inserted": 6,
    "duplicates": 0
  }
}
```

Needs-review response:

```json
{
  "status": "needs_review",
  "format": "rbc_canada",
  "summary": {
    "inserted": 0,
    "duplicates": 1
  },
  "transactions": [
    {
      "rowNumber": 1,
      "date": "2025-04-20",
      "description": "COFFEE CULTURE",
      "amount": -7.45,
      "currency": "CAD",
      "account": "RBC Mastercard",
      "duplicate": true
    }
  ]
}
```

### `POST /api/uploads/finalize`

No format-specific fields are required because rows have already been normalized:

```json
{
  "transactions": [
    {
      "date": "2025-04-20",
      "description": "COFFEE CULTURE",
      "amount": -7.45,
      "currency": "CAD",
      "account": "RBC Mastercard",
      "allowDuplicate": true
    }
  ]
}
```

## Backend Implementation Plan

### Types

Add an upload format type:

```typescript
export const uploadFormats = [
  "generic_csv",
  "generic_json",
  "td_canada",
  "rbc_canada",
  "amex_canada",
  "cibc_canada",
] as const;

export type UploadFormat = (typeof uploadFormats)[number];
```

Add parser options:

```typescript
interface ParseOptions {
  format: UploadFormat;
  accountLabel?: string;
}
```

Add parser result metadata:

```typescript
interface ParseResult {
  format: UploadFormat;
  transactions: ParsedTransaction[];
  errors: ParseError[];
}
```

### Parser Registry

Create:

```txt
backend/src/parsers/institutions/
  types.ts
  index.ts
  money.ts
  dates.ts
  tdCanada.ts
  rbcCanada.ts
  amexCanada.ts
  cibcCanada.ts
```

`index.ts` maps `UploadFormat` to parser functions. Generic CSV and JSON can either remain in their current files or be wrapped by the registry.

### Shared Parser Helpers

Money helper requirements:

- Trim whitespace.
- Remove `$`.
- Remove commas.
- Support leading `-`.
- Support empty cells as zero only for debit/credit source columns.
- Reject malformed values with row-numbered errors.
- Return fixed two-decimal string values compatible with existing `rowSchema`.

Date helper requirements:

- Keep valid `yyyy-mm-dd`.
- Convert RBC `M/D/YYYY` to `yyyy-mm-dd`.
- Convert Amex `DD Mon. YYYY` and `DD Mon YYYY` to `yyyy-mm-dd`.
- Reject invalid dates with row-numbered errors.

Account-label helper requirements:

- Require non-empty `accountLabel` for institution formats.
- Trim account label.
- Do not derive or persist account numbers from source files.

### Institution Parser Rules

TD Canada:

- Parse as headerless CSV.
- Expected columns: `date`, `description`, `debit`, `credit`, `balance`.
- Date: `yyyy-mm-dd`.
- Description: column 2.
- Amount: `credit - debit`.
- Currency: `CAD`.
- Account: provided `accountLabel`.

RBC Canada:

- Parse as headered CSV.
- Required headers: `Account Type`, `Account Number`, `Transaction Date`, `Description 1`, `CAD$`, `USD$`.
- Date: normalize `M/D/YYYY`.
- Description: join `Description 1` and `Description 2` if both are present.
- Amount: signed `CAD$` value as exported.
- Reject rows with populated `USD$`.
- Currency: `CAD`.
- Account: provided `accountLabel`.
- Do not persist `Account Number`.

American Express Canada:

- Parse as headered CSV.
- Required headers: `Date`, `Description`, `Amount`.
- Date: normalize `DD Mon. YYYY`.
- Description: `Description`.
- Amount: parse source `Amount`, then multiply by `-1`.
- Example: `$42.18` becomes `-42.18`.
- Example: `-$1,001.49` payment credit becomes `1001.49`.
- Currency: `CAD`.
- Account: provided `accountLabel`.

CIBC:

- Parse as headerless CSV.
- Expected columns: `date`, `description`, `debit`, `credit`, `cardNumber`.
- Date: `yyyy-mm-dd`.
- Description: column 2.
- Amount: `credit - debit`.
- Currency: `CAD`.
- Account: provided `accountLabel`.
- Do not persist `cardNumber`.

### Upload Service Changes

- Read `format` and `accountLabel` in `routes/uploads.ts`.
- Validate `format` with Zod or explicit enum validation.
- Pass `{ format, accountLabel }` into `classifyUpload`.
- Replace filename-extension-only parser selection with explicit format selection.
- Preserve the existing duplicate detection, account upsert, insert, rule application, and finalize behavior.
- Include `format` in completed and needs-review upload responses.
- Keep `/api/uploads/finalize` unchanged except for any type updates needed to match upload response rows.

## Frontend Implementation Plan

### Upload Page

Add state:

```typescript
type UploadFormat =
  | "generic_csv"
  | "generic_json"
  | "td_canada"
  | "rbc_canada"
  | "amex_canada"
  | "cibc_canada";

const [format, setFormat] = useState<UploadFormat>("generic_csv");
const [accountLabel, setAccountLabel] = useState("");
```

Add account query:

- Fetch `GET /api/accounts`.
- Render a dropdown or datalist for existing account labels.
- Allow free-form text entry.
- Trim before submit.

Validation:

- Require selected file.
- Require selected format.
- Require account label only for institution formats.
- Ensure `.csv` for CSV formats.
- Ensure `.json` for generic JSON.

Submit:

- `uploadFile(file, { format, accountLabel })`.
- Append `format` to `FormData`.
- Append `accountLabel` only when non-empty.

Copy updates:

- List supported institution formats.
- Explain that generic CSV/JSON must include `account`.
- Explain that institution CSVs use the selected account label.
- Explain amount convention and Amex inversion.
- Explain that payments and credits are imported and can be filtered later.

### Duplicate Review Page

- Preserve existing behavior.
- Store and display `format` from the review payload.
- Finalize normalized rows exactly as today.

### API Types

Update `frontend/src/api/uploads.ts`:

- Add `UploadFormat`.
- Add `UploadOptions`.
- Add `format` to upload response interfaces.
- Change `uploadFile(file)` to `uploadFile(file, options)`.

## Testing Plan

### Backend Parser Unit Tests

Create parser-level tests for each fixture.

TD:

- Parses `tests/data/td.csv`.
- Produces 6 rows.
- Uses supplied account label.
- `SERVICE CHARGE` rows are `-5.65`.
- `LOYALTY CREDIT` rows are `5.65`.
- Dates remain `yyyy-mm-dd`.
- Currency is `CAD`.

RBC:

- Parses `tests/data/rbc.csv`.
- Produces 8 rows.
- Uses supplied account label.
- `4/20/2025` becomes `2025-04-20`.
- `COFFEE CULTURE` amount is `-7.45`.
- `AUTOMATIC PAYMENT -THANK YOU` amount is positive.
- Empty `USD$` values are accepted.
- Populated `USD$` values are rejected in a focused negative test.

American Express Canada:

- Parses `tests/data/amex.csv`.
- Produces 7 rows after the payment credit fixture addition.
- Uses supplied account label.
- `14 Apr. 2026` becomes `2026-04-14`.
- `$42.18` becomes `-42.18`.
- `-$1,001.49` becomes `1001.49`.
- Currency is `CAD`.

CIBC:

- Parses `tests/data/cibc.csv`.
- Produces 7 rows.
- Uses supplied account label.
- Debit rows become negative.
- Credit rows become positive.
- Card number is ignored.
- Currency is `CAD`.

Generic CSV and JSON regression:

- Existing generic CSV parses with row-level `account`.
- Existing generic JSON parses with row-level `account`.
- Generic CSV/JSON without row-level `account` fails validation.

### Backend Service Tests

Coverage:

- `POST /api/uploads` rejects missing `format`.
- Institution formats reject missing `accountLabel`.
- Generic CSV/JSON accept missing `accountLabel` when row-level `account` is present.
- Wrong extension or wrong file shape returns `VALIDATION_ERROR`.
- Each institution fixture uploads and inserts successfully.
- Duplicate detection works on normalized rows.
- Duplicate review response includes `format`.
- Finalize recomputes duplicates and requires `allowDuplicate` for duplicate rows.
- Auto-tag rules apply to inserted rows from institution uploads.

### Frontend E2E Tests

Update `tests/frontend.test.ts`.

Helper changes:

- Extend `uploadAndWaitForOutcome` to set format.
- Add optional account-label input fill.
- Keep existing generic CSV and generic JSON flows.

Suggested helper:

```typescript
async function uploadAndWaitForOutcome(
  page,
  { fileContent, filename, mimeType, format, accountLabel },
);
```

New e2e cases:

- Upload generic CSV with row-level account still succeeds.
- Upload generic JSON with row-level account still succeeds.
- Upload TD Canada CSV with selected account label succeeds and inserts 6 rows.
- Upload RBC Canada CSV with selected account label succeeds and inserts 8 rows.
- Upload Amex Canada CSV with selected account label succeeds and inserts 7 rows.
- Upload CIBC CSV with selected account label succeeds and inserts 7 rows.
- Institution upload submit is disabled or errors when account label is missing.
- Existing-account dropdown can select an account label.
- Free-form account label creates a new account on successful upload.
- Duplicate review still works for an institution CSV:
  - Seed one normalized row.
  - Upload the same fixture.
  - Review page appears.
  - Skip all duplicates inserts only non-duplicate rows.
  - Accept all duplicates inserts all selected rows.

Transaction verification:

- After an institution upload, navigate to `/transactions`.
- Filter or search for a known merchant from the fixture.
- Verify the account label is the selected account label.
- Verify sign convention through visible transaction type or amount text if exposed by the UI.

### Manual QA Checklist

- Format selector is clear and defaults to a deliberate value.
- Account label is only required for institution formats.
- Existing accounts are easy to select.
- User can type a new account label.
- Upload errors identify row numbers and likely cause.
- Duplicate review shows normalized dates and amounts.
- Amex payment credit appears as positive.
- Amex charges appear as negative.
- RBC/CIBC/TD payments or credits are imported, not filtered.

## Deferred Work

- Auto-detecting upload formats.
- Mapping multiple source accounts in one uploaded file to existing app accounts.
- Persisting upload batch history.
- Persisting source institution metadata.
- Analytics-level transfer/payment exclusion controls.
- Multi-currency imports.
