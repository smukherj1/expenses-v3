# Frontend — Detailed Design

## Stack

- **React 19** + TypeScript
- **Vite 8** — dev server, build tool
- **React Router 7** — client-side routing
- **Recharts** — charting library
- **TanStack Query (React Query)** — server state management, caching, refetching
- **Tailwind CSS 4** — utility-first styling
- **Runtime**- Bun

## Routing

React Router 7 configured in `src/router.tsx`:

```
/                       -> <DashboardPage />
/upload                 -> <UploadPage />
/upload/duplicates      -> <DuplicateReviewPage />
/transactions           -> <TransactionsPage />
/transactions/:id       -> <TransactionDetailPage />
/rules                  -> <RulesPage />
/analytics              -> <AnalyticsPage />
/settings               -> <SettingsPage />
```

A `<RootLayout />` wraps all routes with the app shell (sidebar nav, header).

## Component Hierarchy

```
<App>
  <RouterProvider>
    <RootLayout>
      ├── <Sidebar />             # Navigation links
      ├── <Header />              # Page title, breadcrumbs
      └── <Outlet />              # Route content
          │
          ├── <DashboardPage />
          │   ├── <SummaryCards />          # Total income, expenses, net this month
          │   ├── <MonthlyBarChart />       # Income vs expense per month
          │   └── <CategoryPieChart />      # Top categories this month
          │
          ├── <UploadPage />
          │   ├── <UploadFormatSelect />    # Explicit generic/institution format selection
          │   ├── <AccountLabelCombobox />  # Existing-account dropdown plus free-form entry for institution imports
          │   ├── <FileDropzone />          # Drag & drop / file picker
          │   ├── <UploadStatus />          # Immediate success or error summary
          │   └── <UploadReviewStore />     # Saves needs_review payload before navigation
          │
          ├── <DuplicateReviewPage />
          │   ├── <DuplicateReviewSummary /> # Upload summary + decision counts
          │   ├── <DuplicateVisibilityFilter /> # All, duplicates only, non-duplicates only
          │   ├── <PageSizeSelect />         # Client-side review page size
          │   ├── <TransactionListTable />   # Client-side filtered, sorted, paginated review rows
          │   └── <DuplicateReviewActions />  # Skip/accept all, finalize, cancel
          │
          ├── <TransactionsPage />
          │   ├── <SearchBar />             # Description substring search input
          │   ├── <FilterPanel />           # Date, amount, multi-account, tags, type filters
          │   ├── <TransactionListTable />  # Server-backed sortable, paginated table with row selection
          │   └── <SelectionActionBar />     # Appears when rows are selected; bulk tag + bulk delete
          │
          ├── <TransactionDetailPage />
          │   ├── <TransactionInfo />       # Date, description, amount, account
          │   └── <TagEditor />             # Add/remove tags
          │
          ├── <RulesPage />
          │   ├── <RuleList />
          │   │   └── <RuleCard />          # Shows conditions + tag, edit/delete/apply
          │   └── <RuleForm />              # Create/edit rule with N conditions (AND)
          │       └── <ConditionRow />      # match_field + match_type + match_value
          │
          ├── <AnalyticsPage />
          │   ├── <ChartFilters />          # Date range, account, tags
          │   ├── <MonthlyBarChart />       # Reused from dashboard
          │   ├── <CategoryPieChart />      # Reused from dashboard
          │   ├── <TrendLineChart />        # Category trend over months
          │   └── <TopNTable />             # Largest transactions / categories
          │
          └── <SettingsPage />
              └── <AccountManager />        # List, create, delete accounts
```

## Shared Components

| Component                  | Purpose                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<Sidebar />`              | App navigation, highlights active route                                                                                                          |
| `<Header />`               | Page title derived from route, optional breadcrumbs                                                                                              |
| `<Pagination />`           | Page controls, used by transaction lists and TopNTable                                                                                           |
| `<TransactionListTable />` | Controlled presentational table for transaction-shaped rows; parent pages own fetching, filtering, sorting, pagination, selection, and mutations |
| `<AccountMultiSelect />`   | Multi-select popover for transaction account filtering with checkbox rows and URL-backed selection                                               |
| `<TagBadge />`             | Displays a tag name with optional remove button                                                                                                  |
| `<TagInput />`             | Autocomplete input for adding tags (queries GET `/api/tags`)                                                                                     |
| `<EmptyState />`           | Placeholder when no data exists                                                                                                                  |
| `<ConfirmDialog />`        | Confirmation modal for destructive actions (delete upload, bulk delete, etc.)                                                                    |
| `<FileDropzone />`         | Drag-and-drop file upload area with format validation                                                                                            |
| `<UploadFormatSelect />`   | Selects one explicit upload format: generic CSV, generic JSON, TD Canada, RBC Canada, American Express Canada, or CIBC                           |
| `<AccountLabelCombobox />` | Lets users choose an existing account label from `GET /api/accounts` or type a new label                                                         |

## API Client Layer

`src/api/` contains typed functions wrapping `fetch` calls:

```
src/api/
  client.ts           # Base fetch wrapper (base URL, error handling, JSON parsing)
  accounts.ts         # getAccounts, createAccount, deleteAccount
  uploads.ts          # uploadFile, finalizeUpload
  transactions.ts     # listTransactions, getTransaction, updateTransaction, bulkTag, bulkDeleteTransactions
  tags.ts              # getTags, createTag, deleteTag
  rules.ts             # getRules, createRule, updateRule, deleteRule, applyRule, applyAllRules
  analytics.ts         # getMonthlySummary, getCategoryBreakdown, getTrend, getTopTransactions
```

Each function returns typed data; errors throw an `ApiError` with `code` and `message`.

## Server State Management

TanStack Query handles all server state:

- **Query keys** follow the pattern: `['resource', ...params]` (e.g. `['transactions', { q, page }]`).
- **Mutations** invalidate related queries on success (e.g. bulk-tag and bulk-delete invalidate `['transactions']`).
- Stale time: 30s for transaction lists, 5min for tags and accounts.

## Transaction List Model

`TransactionListTable` is shared by `/transactions` and `/upload/duplicates`, but it is deliberately presentational. It receives already filtered, already sorted, already paginated rows and emits user intent through callbacks. It does not fetch data, own URL params, sort rows, filter rows, paginate rows, or mutate selection state.

Shared row state lives in `src/lib/transactionList.ts`:

The transactions page adapts API transactions into rows keyed by persisted transaction id. The duplicate review page adapts upload review rows into rows keyed by stable upload `rowNumber`.

## Key Interactions

### Upload Flow

1. User selects one explicit format:
   - Generic CSV
   - Generic JSON
   - TD Canada CSV
   - RBC Canada CSV
   - American Express Canada CSV
   - CIBC CSV
2. For institution CSV formats, the user chooses an account label from an existing-account dropdown or types a new account label. Generic CSV and JSON do not require this field because each row must include `account`.
3. User drops/picks a CSV or JSON file. The file picker accepts `.csv` for CSV formats and `.json` for generic JSON.
4. Frontend sends `multipart/form-data` to `POST /api/uploads`:

```txt
file: File
format: generic_csv | generic_json | td_canada | rbc_canada | amex_canada | cibc_canada
accountLabel: string, only required for institution CSV formats
```

5. If no duplicates exist, backend inserts the rows immediately and returns `status: "completed"` plus the selected `format`.
6. If duplicates exist, backend returns `status: "needs_review"` with parsed rows, duplicate flags, and the selected `format`.
7. Frontend saves the review payload, navigates to `/upload/duplicates`, and renders a paginated review table.
8. The review page defaults to ascending date order in component state, applies duplicate visibility filtering, sorts the in-memory rows, then slices the current client-side page.
9. User changes duplicate decisions and finalizes from the review page. Non-duplicate rows are included by default and disabled in the table; duplicate decisions remain keyed by row number so filtering, sorting, and pagination do not lose them.
10. Frontend sends the included normalized rows to `POST /api/uploads/finalize`, then renders the completion summary.

Institution-format UX rules:

- The submit button is disabled until a format, file, and required account label are present.
- The account-label input should prefer selecting existing labels to avoid accidental near-duplicate accounts.
- Free-form account labels remain supported so users can create a new account at upload time.
- The upload page should explain that expenses are stored as negative amounts and that American Express Canada charges are inverted during import.
- Payments, credits, refunds, and transfers are imported rather than removed; filtering belongs in transactions and analytics.

### Transaction Search Flow

1. `/transactions` normalizes missing URL params to `sort=date`, `order=asc`, `page=1`, and `limit=50`.
2. The filter panel controls description search (`q`), date range, signed amount range, account id, transaction type, and tags.
3. Amount filter inputs stay as strings in the UI. Empty values are omitted from API params, and an invalid min/max range disables the list query and shows an inline validation message.
4. Account filtering uses `GET /api/accounts` to populate a multi-select popover and sends the selected ids as `accountIds`. Legacy `accountId` links still work, but new interactions write `accountIds`.
5. The page calls `GET /api/transactions` through TanStack Query with `keepPreviousData` so existing rows stay visible while filters, sorts, or pages transition.
6. Sortable headers are date, description, amount, and account. Clicking a new column sorts ascending; clicking the active column toggles ascending/descending.
7. Filter and sort changes reset `page=1`. If a filter or deletion leaves the current page beyond the result count, the page is clamped to the last available page.
8. Row selection is scoped to the currently rendered server page. Bulk tag and bulk delete invalidate the transactions query and clear selection on success.

Pagination controls expose `First`, `Prev`, `Next`, and `Last` in addition to the current page indicator.

### Bulk Tagging and Deletion Flow

1. User checks rows in TransactionListTable (checkboxes).
2. SelectionActionBar appears at top with tag input + "Add" / "Remove" buttons and a destructive bulk delete action.
3. On submit, calls `POST /api/transactions/bulk-tag` or `POST /api/transactions/bulk-delete`.
4. Table refreshes via query invalidation and selection clears.

### Chart Drill-Down

1. User clicks a pie slice or bar segment.
2. App navigates to `/transactions?tag=X&dateFrom=Y&dateTo=Z` (pre-filtered).

## Styling Approach

- Tailwind CSS 4 for utility-based styling.
- Consistent spacing/color via Tailwind theme configuration.
- Dark mode support as a stretch goal (Tailwind `dark:` variants).
