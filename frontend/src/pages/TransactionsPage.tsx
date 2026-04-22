import { useCallback, useEffect, useMemo, useState } from "react";
import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import {
  listTransactions,
  bulkTag,
  bulkDeleteTransactions,
  type Transaction,
  type ListParams,
} from "../api/transactions.ts";
import { getAccounts } from "../api/accounts.ts";
import Pagination from "../components/Pagination.tsx";
import ConfirmDialog from "../components/ConfirmDialog.tsx";
import TransactionListTable from "../components/TransactionListTable.tsx";
import type {
  TransactionListColumn,
  TransactionListRow,
  TransactionListSort,
} from "../lib/transactionList.ts";

const DEFAULT_SORT: TransactionListSort = { column: "date", order: "asc" };
const DEFAULT_LIMIT = 50;
type TransactionSortColumn = Exclude<
  TransactionListSort["column"],
  "duplicateStatus"
>;
type SearchParamUpdateOptions = { resetPage?: boolean; replace?: boolean };
type TransactionSearchState = {
  q: string;
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  accountId: string;
  type: ListParams["type"] | "";
  tags: string;
  sort: TransactionSortColumn;
  order: TransactionListSort["order"];
  page: number;
};
type BulkTagAction = "add" | "remove";

const TRANSACTION_COLUMNS: TransactionListColumn[] = [
  "select",
  "date",
  "description",
  "amount",
  "account",
  "tags",
];
const TRANSACTION_SORTABLE_COLUMNS: TransactionSortColumn[] = [
  "date",
  "description",
  "amount",
  "account",
];

/**
 * Parses an amount filter input into the API's numeric representation.
 *
 * @param value Raw text from a min/max amount input.
 * @returns undefined for blank or invalid text so the API filter is omitted,
 * otherwise the parsed finite number.
 */
function normalizeAmount(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Reads the transaction list's URL-backed filter, sort, and page state.
 *
 * @param searchParams Current React Router URLSearchParams object.
 * @returns Normalized search state used by inputs, API params, and pagination.
 */
function readTransactionSearchState(
  searchParams: URLSearchParams,
): TransactionSearchState {
  return {
    q: searchParams.get("q") ?? "",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    amountMin: searchParams.get("amountMin") ?? "",
    amountMax: searchParams.get("amountMax") ?? "",
    accountId: searchParams.get("accountId") ?? "",
    type: (searchParams.get("type") as ListParams["type"]) ?? "",
    tags: searchParams.get("tags") ?? "",
    sort:
      (searchParams.get("sort") as TransactionSortColumn) ??
      DEFAULT_SORT.column,
    order:
      (searchParams.get("order") as TransactionListSort["order"]) ??
      DEFAULT_SORT.order,
    page: Number(searchParams.get("page") ?? "1"),
  };
}

/**
 * Adds missing default URL params for the transaction list route.
 *
 * @param searchParams Current URLSearchParams from React Router.
 * @returns A replacement URLSearchParams object when defaults were missing, or
 * null when the URL already contains the defaults.
 */
function buildDefaultedSearchParams(
  searchParams: URLSearchParams,
): URLSearchParams | null {
  const next = new URLSearchParams(searchParams);
  let changed = false;

  if (!next.get("sort")) {
    next.set("sort", DEFAULT_SORT.column);
    changed = true;
  }
  if (!next.get("order")) {
    next.set("order", DEFAULT_SORT.order);
    changed = true;
  }
  if (!next.get("page")) {
    next.set("page", "1");
    changed = true;
  }
  if (!next.get("limit")) {
    next.set("limit", String(DEFAULT_LIMIT));
    changed = true;
  }

  return changed ? next : null;
}

/**
 * Applies URL param updates for filter, sort, and pagination controls.
 *
 * @param searchParams Current URLSearchParams from React Router.
 * @param updates Param values to set; blank or undefined values remove a param.
 * @param options resetPage controls whether page returns to 1, and replace
 * controls browser-history behavior.
 * @returns New URLSearchParams object ready for setSearchParams.
 */
function buildUpdatedSearchParams(
  searchParams: URLSearchParams,
  updates: Record<string, string | undefined>,
  options?: SearchParamUpdateOptions,
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  for (const [key, value] of Object.entries(updates)) {
    if (value && value.length > 0) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
  }
  if (options?.resetPage !== false) {
    next.set("page", "1");
  }
  return next;
}

/**
 * Builds the canonical default URL param object used by the Clear button.
 *
 * @returns Filter-free sort/page/limit defaults for setSearchParams.
 */
function defaultTransactionSearchParams(): Record<string, string> {
  return {
    sort: DEFAULT_SORT.column,
    order: DEFAULT_SORT.order,
    page: "1",
    limit: String(DEFAULT_LIMIT),
  };
}

/**
 * Converts URL search state into typed listTransactions params.
 *
 * @param state URL-backed transaction search state.
 * @param amountMinValue Parsed minimum amount filter.
 * @param amountMaxValue Parsed maximum amount filter.
 * @returns API params with blank filters omitted.
 */
function buildListParams(
  state: TransactionSearchState,
  amountMinValue: number | undefined,
  amountMaxValue: number | undefined,
): ListParams {
  return {
    q: state.q || undefined,
    dateFrom: state.dateFrom || undefined,
    dateTo: state.dateTo || undefined,
    amountMin: amountMinValue,
    amountMax: amountMaxValue,
    accountId: state.accountId || undefined,
    type: state.type || undefined,
    tags: state.tags || undefined,
    sort: state.sort,
    order: state.order,
    page: state.page,
    limit: DEFAULT_LIMIT,
  };
}

/**
 * Adapts API transactions into shared table rows.
 *
 * @param transactions Transactions returned by GET /api/transactions.
 * @returns Rows keyed by persisted transaction id with detail-page hrefs.
 */
function buildTransactionRows(
  transactions: Transaction[] = [],
): TransactionListRow[] {
  return transactions.map((txn) => ({
    key: txn.id,
    date: txn.date,
    description: txn.description,
    amount: txn.amount,
    currency: txn.currency,
    accountLabel: txn.accountLabel,
    href: `/transactions/${txn.id}`,
  }));
}

/**
 * Toggles one transaction id in a selection set without mutating the old set.
 *
 * @param current Current selected transaction ids.
 * @param id Persisted transaction id to toggle.
 * @returns A new Set with the id added or removed.
 */
function toggleSelectedId(current: Set<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Applies select-all changes for the currently rendered server page.
 *
 * @param current Current selected transaction ids.
 * @param pageRows Rows rendered in TransactionListTable.
 * @param nextChecked True adds all page rows; false removes all page rows.
 * @returns A new Set reflecting the page-level selection change.
 */
function updatePageSelection(
  current: Set<string>,
  pageRows: TransactionListRow[],
  nextChecked: boolean,
): Set<string> {
  const next = new Set(current);
  for (const row of pageRows) {
    if (nextChecked) next.add(row.key);
    else next.delete(row.key);
  }
  return next;
}

/**
 * Parses the bulk tag input into individual tag names.
 *
 * @param value Comma-separated tag input from the selection action bar.
 * @returns Non-empty trimmed tag names.
 */
function parseBulkTagNames(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/**
 * Determines whether deletion emptied the current page.
 *
 * @param page Current one-based server page.
 * @param rowCount Number of rows visible before deletion.
 * @param deletedCount Number of selected transactions deleted.
 * @returns True when pagination should move to the previous page.
 */
function shouldMoveToPreviousPage(
  page: number,
  rowCount: number,
  deletedCount: number,
): boolean {
  return page > 1 && rowCount > 0 && deletedCount >= rowCount;
}

/**
 * Transaction list page.
 *
 * The page owns URL-backed filters/sort/page, server queries, current-page
 * selection, bulk tagging, and bulk deletion confirmation.
 */
export default function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();

  /*
   * URL normalization effect for the transaction search flow.
   *
   * It examines the current URL params and, when sort/order/page/limit are
   * missing, replaces the URL with canonical defaults. This keeps direct visits
   * and cleared filters aligned with the design.md route contract without adding
   * extra React state.
   */
  useEffect(() => {
    const next = buildDefaultedSearchParams(searchParams);
    if (next) {
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const searchState = useMemo(
    () => readTransactionSearchState(searchParams),
    [searchParams],
  );
  const {
    q,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
    accountId,
    type,
    sort,
    order,
    page,
  } = searchState;

  const amountMinValue = normalizeAmount(amountMin);
  const amountMaxValue = normalizeAmount(amountMax);
  const amountRangeInvalid =
    amountMinValue !== undefined &&
    amountMaxValue !== undefined &&
    amountMinValue > amountMaxValue;

  // Bulk action flow: selected transaction ids for the currently rendered
  // server page. Row checkboxes and page select-all update it; successful bulk
  // tag/delete mutations clear it.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk tagging flow: comma-separated tag entry shown only while rows are
  // selected. The input updates on typing and clears after successful bulk tag
  // or delete operations.
  const [bulkTagInput, setBulkTagInput] = useState("");

  // Bulk action flow: inline error shown in the selection action bar. It is set
  // for empty tag submissions or API mutation errors and cleared on success.
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Bulk deletion flow: selected ids pending confirmation. Clicking delete
  // selected fills it, cancel clears it, and successful deletion clears it.
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null);

  const params = useMemo(
    () => buildListParams(searchState, amountMinValue, amountMaxValue),
    [searchState, amountMinValue, amountMaxValue],
  );

  /**
   * URL update handler for filter, sort, and pagination flows.
   *
   * @param updates Param values to set; blank or undefined removes a param.
   * @param options resetPage controls whether page returns to 1, and replace
   * controls browser-history behavior.
   * @sideEffect Writes the new URL search params through React Router.
   */
  const updateSearchParams = useCallback(
    (
      updates: Record<string, string | undefined>,
      options?: SearchParamUpdateOptions,
    ) => {
      const next = buildUpdatedSearchParams(searchParams, updates, options);
      setSearchParams(next, { replace: options?.replace ?? false });
    },
    [searchParams, setSearchParams],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", params],
    queryFn: () => listTransactions(params),
    enabled: !amountRangeInvalid,
    placeholderData: keepPreviousData,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: getAccounts,
    staleTime: 5 * 60_000,
  });

  const rows = useMemo<TransactionListRow[]>(
    () => buildTransactionRows(data?.data),
    [data?.data],
  );

  const selectedCount = selectedIds.size;
  const allSelected =
    rows.length > 0 && rows.every((row) => selectedIds.has(row.key));

  const bulkMutation = useMutation({
    mutationFn: ({
      tagNames,
      action,
    }: {
      tagNames: string[];
      action: "add" | "remove";
    }) => bulkTag([...selectedIds], tagNames, action),
    onSuccess: () => {
      setBulkTagInput("");
      setBulkError(null);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e: Error) => setBulkError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteTransactions(ids),
    onSuccess: (_result, deletedIds) => {
      const shouldGoPrevPage = shouldMoveToPreviousPage(
        page,
        rows.length,
        deletedIds.length,
      );

      setDeleteTarget(null);
      setSelectedIds(new Set());
      setBulkTagInput("");
      setBulkError(null);

      if (shouldGoPrevPage) {
        updateSearchParams({ page: String(page - 1) });
      }

      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e: Error) => setBulkError(e.message),
  });

  /*
   * Page clamp effect for filter and deletion flows.
   *
   * It examines the latest server total and current URL page. If filtering or
   * deleting leaves the URL page beyond the last available page, it replaces the
   * URL page with the last valid page so the table does not sit on an empty page
   * that has results on earlier pages.
   */
  useEffect(() => {
    if (!data?.total) return;

    const totalPages = Math.max(1, Math.ceil(data.total / DEFAULT_LIMIT));
    if (page > totalPages) {
      updateSearchParams(
        { page: String(totalPages) },
        { resetPage: false, replace: true },
      );
    }
  }, [data?.total, page, updateSearchParams]);

  /**
   * Single filter update handler.
   *
   * @param key URL search param controlled by one filter input.
   * @param value Raw input/select value; blank removes the filter.
   * @sideEffect Updates URL params and resets to page 1.
   */
  function setParam(key: string, value: string) {
    updateSearchParams({ [key]: value });
  }

  /**
   * Table sort update handler.
   *
   * @param next Sort column/order emitted by TransactionListTable.
   * @sideEffect Writes sort/order to URL params and resets to page 1.
   */
  function setSort(next: TransactionListSort) {
    updateSearchParams(
      {
        sort: next.column,
        order: next.order,
      },
      { resetPage: true },
    );
  }

  /**
   * Row selection handler.
   *
   * @param id Persisted transaction id for the toggled table row.
   * @sideEffect Adds or removes that id in the current selection set.
   */
  function toggleSelect(id: string) {
    setSelectedIds((prev) => toggleSelectedId(prev, id));
  }

  /**
   * Bulk tag submit handler.
   *
   * @param action Whether tags should be added to or removed from selected rows.
   * @sideEffect Validates the tag input, records an inline error when empty, or
   * starts the bulk tag mutation for the current selection.
   */
  function handleBulkAction(action: BulkTagAction) {
    const names = parseBulkTagNames(bulkTagInput);
    if (!names.length) {
      setBulkError("Enter at least one tag");
      return;
    }
    bulkMutation.mutate({ tagNames: names, action });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Transactions</h1>

      <div className="bg-white rounded-xl border p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-gray-500 mb-1">Search</label>
          <input
            type="text"
            placeholder="Search descriptions…"
            value={q}
            onChange={(e) => setParam("q", e.target.value)}
            className="w-full border rounded-lg px-3 py-1.5 text-sm"
            data-testid="search-input"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setParam("dateFrom", e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
            data-testid="filter-date-from"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setParam("dateTo", e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
            data-testid="filter-date-to"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Min amount</label>
          <input
            type="number"
            step="0.01"
            value={amountMin}
            onChange={(e) => setParam("amountMin", e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm w-32"
            data-testid="filter-amount-min"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Max amount</label>
          <input
            type="number"
            step="0.01"
            value={amountMax}
            onChange={(e) => setParam("amountMax", e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm w-32"
            data-testid="filter-amount-max"
          />
        </div>
        <div className="min-w-48">
          <label className="block text-xs text-gray-500 mb-1">Account</label>
          <select
            value={accountId}
            onChange={(e) => setParam("accountId", e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm w-full"
            data-testid="filter-account"
          >
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setParam("type", e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
            data-testid="filter-type"
          >
            <option value="">All</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </div>
        <button
          onClick={() => {
            setSearchParams(defaultTransactionSearchParams(), {
              replace: false,
            });
          }}
          className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          Clear
        </button>
      </div>

      {amountRangeInvalid && (
        <div
          className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800"
          data-testid="amount-range-error"
        >
          Minimum amount must be less than or equal to maximum amount.
        </div>
      )}

      {selectedCount > 0 && (
        <div
          className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-center gap-3"
          data-testid="bulk-tag-bar"
        >
          <span className="text-sm text-blue-700 font-medium">
            {selectedCount} selected
          </span>
          <input
            type="text"
            placeholder="tag1, tag2, …"
            value={bulkTagInput}
            onChange={(e) => setBulkTagInput(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm flex-1 max-w-xs"
            data-testid="bulk-tag-input"
          />
          <button
            onClick={() => handleBulkAction("add")}
            disabled={bulkMutation.isPending}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            data-testid="bulk-tag-add"
          >
            Add tags
          </button>
          <button
            onClick={() => handleBulkAction("remove")}
            disabled={bulkMutation.isPending}
            className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
            data-testid="bulk-tag-remove"
          >
            Remove tags
          </button>
          <button
            onClick={() => setDeleteTarget([...selectedIds])}
            disabled={deleteMutation.isPending}
            className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
            data-testid="bulk-delete"
          >
            Delete selected
          </button>
          {bulkError && (
            <span className="text-sm text-red-600" data-testid="bulk-tag-error">
              {bulkError}
            </span>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <TransactionListTable
          loading={isLoading}
          rows={rows}
          columns={TRANSACTION_COLUMNS}
          sort={{ column: sort, order }}
          sortableColumns={TRANSACTION_SORTABLE_COLUMNS}
          onSortChange={setSort}
          selection={{
            pageSelected: allSelected,
            pageIndeterminate: selectedCount > 0 && !allSelected,
          }}
          getRowSelected={(row) => selectedIds.has(row.key)}
          isRowSelectable={() => true}
          onToggleRow={(row) => toggleSelect(row.key)}
          onTogglePage={(pageRows, nextChecked) => {
            setSelectedIds((current) =>
              updatePageSelection(current, pageRows, nextChecked),
            );
          }}
          getRowHref={(row) => row.href}
          emptyMessage="No transactions found"
          testId="transaction-row"
        />
      </div>

      <Pagination
        page={page}
        total={data?.total ?? 0}
        limit={DEFAULT_LIMIT}
        onPage={(nextPage) =>
          updateSearchParams({ page: String(nextPage) }, { resetPage: false })
        }
      />

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete ${deleteTarget.length} selected transaction${
            deleteTarget.length === 1 ? "" : "s"
          }? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => deleteMutation.mutate(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
