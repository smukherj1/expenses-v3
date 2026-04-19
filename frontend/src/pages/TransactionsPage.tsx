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

function normalizeAmount(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();

  useEffect(() => {
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
    if (changed) {
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const q = searchParams.get("q") ?? "";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const amountMin = searchParams.get("amountMin") ?? "";
  const amountMax = searchParams.get("amountMax") ?? "";
  const accountId = searchParams.get("accountId") ?? "";
  const type = (searchParams.get("type") as ListParams["type"]) ?? "";
  const tags = searchParams.get("tags") ?? "";
  const sort =
    (searchParams.get("sort") as TransactionSortColumn) ?? DEFAULT_SORT.column;
  const order =
    (searchParams.get("order") as TransactionListSort["order"]) ??
    DEFAULT_SORT.order;
  const page = Number(searchParams.get("page") ?? "1");

  const amountMinValue = normalizeAmount(amountMin);
  const amountMaxValue = normalizeAmount(amountMax);
  const amountRangeInvalid =
    amountMinValue !== undefined &&
    amountMaxValue !== undefined &&
    amountMinValue > amountMaxValue;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null);

  const params: ListParams = {
    q: q || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    amountMin: amountMinValue,
    amountMax: amountMaxValue,
    accountId: accountId || undefined,
    type: type || undefined,
    tags: tags || undefined,
    sort,
    order,
    page,
    limit: DEFAULT_LIMIT,
  };

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
    () =>
      (data?.data ?? []).map((txn) => ({
        key: txn.id,
        date: txn.date,
        description: txn.description,
        amount: txn.amount,
        currency: txn.currency,
        accountLabel: txn.accountLabel,
        href: `/transactions/${txn.id}`,
      })),
    [data?.data],
  );

  const selectedCount = selectedIds.size;
  const allSelected =
    rows.length > 0 && rows.every((row) => selectedIds.has(row.key));

  const columns: TransactionListColumn[] = [
    "select",
    "date",
    "description",
    "amount",
    "account",
    "tags",
  ];

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
      const deletedCount = deletedIds.length;
      const shouldGoPrevPage =
        page > 1 && rows.length > 0 && deletedCount >= rows.length;

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

  const updateSearchParams = useCallback(
    (
      updates: Record<string, string | undefined>,
      options?: { resetPage?: boolean; replace?: boolean },
    ) => {
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
      setSearchParams(next, { replace: options?.replace ?? false });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    if (!data?.total) return;

    const totalPages = Math.max(1, Math.ceil(data.total / DEFAULT_LIMIT));
    if (page > totalPages) {
      updateSearchParams(
        { page: String(totalPages) },
        { resetPage: false, replace: true },
      );
    }
  }, [data?.total, page, searchParams, setSearchParams, updateSearchParams]);

  function setParam(key: string, value: string) {
    updateSearchParams({ [key]: value });
  }

  function setSort(next: TransactionListSort) {
    updateSearchParams(
      {
        sort: next.column,
        order: next.order,
      },
      { resetPage: true },
    );
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkAction(action: "add" | "remove") {
    const names = bulkTagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
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
            setSearchParams(
              {
                sort: DEFAULT_SORT.column,
                order: DEFAULT_SORT.order,
                page: "1",
                limit: String(DEFAULT_LIMIT),
              },
              { replace: false },
            );
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
          columns={columns}
          sort={{ column: sort, order }}
          sortableColumns={["date", "description", "amount", "account"]}
          onSortChange={setSort}
          selection={{
            pageSelected: allSelected,
            pageIndeterminate: selectedCount > 0 && !allSelected,
          }}
          getRowSelected={(row) => selectedIds.has(row.key)}
          isRowSelectable={() => true}
          onToggleRow={(row) => toggleSelect(row.key)}
          onTogglePage={(pageRows, nextChecked) => {
            setSelectedIds((current) => {
              const next = new Set(current);
              for (const row of pageRows) {
                if (nextChecked) next.add(row.key);
                else next.delete(row.key);
              }
              return next;
            });
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
