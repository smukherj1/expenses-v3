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
          │   ├── <DuplicateReviewTable />   # Paginated review table
          │   └── <DuplicateReviewActions />  # Skip/accept all, finalize, cancel
          │
          ├── <TransactionsPage />
          │   ├── <SearchBar />             # Full-text search input
          │   ├── <FilterPanel />           # Date, amount, account, tags, type filters
          │   ├── <TransactionTable />      # Sortable, paginated table with row selection
          │   │   └── <TransactionRow />
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

| Component                  | Purpose                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `<Sidebar />`              | App navigation, highlights active route                                                                                |
| `<Header />`               | Page title derived from route, optional breadcrumbs                                                                    |
| `<Pagination />`           | Page controls, used by TransactionTable and TopNTable                                                                  |
| `<TagBadge />`             | Displays a tag name with optional remove button                                                                        |
| `<TagInput />`             | Autocomplete input for adding tags (queries GET `/api/tags`)                                                           |
| `<EmptyState />`           | Placeholder when no data exists                                                                                        |
| `<ConfirmDialog />`        | Confirmation modal for destructive actions (delete upload, bulk delete, etc.)                                          |
| `<FileDropzone />`         | Drag-and-drop file upload area with format validation                                                                  |
| `<UploadFormatSelect />`   | Selects one explicit upload format: generic CSV, generic JSON, TD Canada, RBC Canada, American Express Canada, or CIBC |
| `<AccountLabelCombobox />` | Lets users choose an existing account label from `GET /api/accounts` or type a new label                               |

## API Client Layer

`src/api/` contains typed functions wrapping `fetch` calls:

```
src/api/
  client.ts           # Base fetch wrapper (base URL, error handling, JSON parsing)
  accounts.ts         # getAccounts, createAccount, deleteAccount
  uploads.ts          # uploadFile, finalizeUpload
  transactions.ts     # searchTransactions, getTransaction, updateTransaction, bulkTag, bulkDeleteTransactions
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
8. User changes duplicate decisions and finalizes from the review page.
9. Frontend sends the included normalized rows to `POST /api/uploads/finalize`, then renders the completion summary.

Institution-format UX rules:

- The submit button is disabled until a format, file, and required account label are present.
- The account-label input should prefer selecting existing labels to avoid accidental near-duplicate accounts.
- Free-form account labels remain supported so users can create a new account at upload time.
- The upload page should explain that expenses are stored as negative amounts and that American Express Canada charges are inverted during import.
- Payments, credits, refunds, and transfers are imported rather than removed; filtering belongs in transactions and analytics.

### Bulk Tagging and Deletion Flow

1. User checks rows in TransactionTable (checkboxes).
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
