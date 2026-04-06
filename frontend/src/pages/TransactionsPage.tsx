import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import {
  listTransactions,
  bulkTag,
  type ListParams,
} from "../api/transactions.ts";
import { useQuery as useTagsQuery } from "@tanstack/react-query";
import { getTags } from "../api/tags.ts";
import Pagination from "../components/Pagination.tsx";
import TagBadge from "../components/TagBadge.tsx";

export default function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();

  const q = searchParams.get("q") ?? "";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const type = (searchParams.get("type") as ListParams["type"]) ?? undefined;
  const page = Number(searchParams.get("page") ?? "1");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);

  const params: ListParams = {
    q: q || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    type,
    page,
    limit: 50,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", params],
    queryFn: () => listTransactions(params),
  });

  const { data: tags = [] } = useTagsQuery({
    queryKey: ["tags"],
    queryFn: getTags,
    staleTime: 5 * 60_000,
  });

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

  function setParam(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const rows = data?.data ?? [];
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
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

  const rows = data?.data ?? [];
  const allSelected = rows.length > 0 && selectedIds.size === rows.length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Transactions</h1>

      {/* Filters */}
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
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select
            value={type ?? ""}
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
          onClick={() => setSearchParams({})}
          className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          Clear
        </button>
      </div>

      {/* Bulk tag bar */}
      {selectedIds.size > 0 && (
        <div
          className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-center gap-3"
          data-testid="bulk-tag-bar"
        >
          <span className="text-sm text-blue-700 font-medium">
            {selectedIds.size} selected
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
          {bulkError && (
            <span className="text-sm text-red-600" data-testid="bulk-tag-error">
              {bulkError}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div
            className="p-8 text-center text-gray-400 text-sm"
            data-testid="empty-state"
          >
            No transactions found
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    data-testid="select-all"
                  />
                </th>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">
                  Description
                </th>
                <th className="px-4 py-3 text-right text-gray-600 font-medium">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">
                  Tags
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((txn) => (
                <tr
                  key={txn.id}
                  className="hover:bg-gray-50"
                  data-testid="transaction-row"
                >
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(txn.id)}
                      onChange={() => toggleSelect(txn.id)}
                      data-testid={`select-${txn.id}`}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{txn.date}</td>
                  <td className="px-4 py-2.5">
                    <Link
                      to={`/transactions/${txn.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {txn.description}
                    </Link>
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-medium tabular-nums ${
                      txn.amount >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {txn.amount >= 0 ? "+" : ""}
                    {txn.amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {tags
                        .filter((t) =>
                          (
                            txn as unknown as { tags?: string[] }
                          ).tags?.includes(t.name),
                        )
                        .map((t) => (
                          <TagBadge key={t.id} name={t.name} />
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination
        page={page}
        total={data?.total ?? 0}
        limit={50}
        onPage={(p) => setParam("page", String(p))}
      />
    </div>
  );
}
