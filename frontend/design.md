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
          │   ├── <AccountSelector />       # Pick or create account
          │   ├── <FileDropzone />          # Drag & drop / file picker
          │   ├── <UploadPreview />         # Parsed rows preview + duplicate warnings
          │   └── <UploadHistory />         # Past uploads with delete
          │
          ├── <TransactionsPage />
          │   ├── <SearchBar />             # Full-text search input
          │   ├── <FilterPanel />           # Date, amount, account, tags, type filters
          │   ├── <TransactionTable />      # Sortable, paginated table
          │   │   └── <TransactionRow />
          │   └── <BulkTagBar />            # Appears when rows are selected
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

| Component           | Purpose                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `<Sidebar />`       | App navigation, highlights active route                          |
| `<Header />`        | Page title derived from route, optional breadcrumbs              |
| `<Pagination />`    | Page controls, used by TransactionTable and TopNTable            |
| `<TagBadge />`      | Displays a tag name with optional remove button                  |
| `<TagInput />`      | Autocomplete input for adding tags (queries GET `/api/tags`)     |
| `<EmptyState />`    | Placeholder when no data exists                                  |
| `<ConfirmDialog />` | Confirmation modal for destructive actions (delete upload, etc.) |
| `<FileDropzone />`  | Drag-and-drop file upload area with format validation            |

## API Client Layer

`src/api/` contains typed functions wrapping `fetch` calls:

```
src/api/
  client.ts           # Base fetch wrapper (base URL, error handling, JSON parsing)
  accounts.ts         # getAccounts, createAccount, deleteAccount
  uploads.ts          # uploadFile, getUploads, deleteUpload
  transactions.ts     # searchTransactions, getTransaction, updateTransaction, bulkTag
  tags.ts             # getTags, createTag, deleteTag
  rules.ts            # getRules, createRule, updateRule, deleteRule, applyRule, applyAllRules
  analytics.ts        # getMonthlySummary, getCategoryBreakdown, getTrend, getTopTransactions
```

Each function returns typed data; errors throw an `ApiError` with `code` and `message`.

## Server State Management

TanStack Query handles all server state:

- **Query keys** follow the pattern: `['resource', ...params]` (e.g. `['transactions', { q, page }]`).
- **Mutations** invalidate related queries on success (e.g. bulk-tag invalidates `['transactions']`).
- Stale time: 30s for transaction lists, 5min for tags and accounts.

## Key Interactions

### Upload Flow

1. User selects account (or creates new one).
2. User drops/picks file(s).
3. Frontend reads file, sends as `multipart/form-data` to `POST /api/accounts/:accountId/upload`.
4. Backend responds with parsed count + duplicate warnings.
5. Frontend shows result summary and refreshes upload history.

### Bulk Tagging Flow

1. User checks rows in TransactionTable (checkboxes).
2. BulkTagBar appears at top with tag input + "Add" / "Remove" buttons.
3. On submit, calls `POST /api/transactions/bulk-tag`.
4. Table refreshes via query invalidation.

### Chart Drill-Down

1. User clicks a pie slice or bar segment.
2. App navigates to `/transactions?tag=X&dateFrom=Y&dateTo=Z` (pre-filtered).

## Styling Approach

- Tailwind CSS 4 for utility-based styling.
- Consistent spacing/color via Tailwind theme configuration.
- Dark mode support as a stretch goal (Tailwind `dark:` variants).
