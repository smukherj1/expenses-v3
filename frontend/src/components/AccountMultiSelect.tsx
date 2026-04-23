import { useMemo, useState } from "react";
import type { Account } from "../api/accounts.ts";

interface Props {
  accounts: Account[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

function summarizeSelection(
  accounts: Account[],
  selectedIds: string[],
): string {
  if (selectedIds.length === 0) {
    return "All accounts";
  }

  if (selectedIds.length === 1) {
    const selected = accounts.find((account) => account.id === selectedIds[0]);
    return selected?.label ?? "1 account";
  }

  return `${selectedIds.length} accounts`;
}

export default function AccountMultiSelect({
  accounts,
  selectedIds,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const visibleAccounts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return accounts;
    return accounts.filter((account) =>
      account.label.toLowerCase().includes(normalized),
    );
  }, [accounts, query]);

  const accountOrder = useMemo(
    () => new Map(accounts.map((account, index) => [account.id, index])),
    [accounts],
  );

  function normalizeSelection(ids: string[]): string[] {
    return [...new Set(ids)].sort((left, right) => {
      return (
        (accountOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (accountOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
      );
    });
  }

  function toggleAccount(id: string, checked: boolean) {
    const next = checked
      ? [...selectedIds, id]
      : selectedIds.filter((accountId) => accountId !== id);
    onChange(normalizeSelection(next));
  }

  function clearSelection() {
    onChange([]);
  }

  const summary = summarizeSelection(accounts, selectedIds);

  return (
    <div className="relative min-w-56">
      <label className="block text-xs text-gray-500 mb-1">Accounts</label>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full border rounded-lg px-3 py-1.5 text-sm text-left flex items-center justify-between gap-2 bg-white hover:bg-gray-50"
        data-testid="account-filter-trigger"
      >
        <span className="truncate">{summary}</span>
        <span className="text-xs text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div
          className="absolute left-0 right-0 mt-2 rounded-xl border bg-white shadow-lg z-20 p-3"
          data-testid="account-filter-panel"
        >
          {accounts.length > 6 ? (
            <input
              type="search"
              placeholder="Search accounts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full border rounded-lg px-3 py-1.5 text-sm mb-3"
              data-testid="account-filter-search"
            />
          ) : null}
          <div className="max-h-64 overflow-auto space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedIds.length === 0}
                onChange={clearSelection}
                className="h-4 w-4 rounded border-gray-300"
                data-testid="account-filter-clear"
              />
              <span>All accounts</span>
            </label>
            {visibleAccounts.map((account) => (
              <label
                key={account.id}
                className="flex items-center gap-2 text-sm"
                data-testid="account-filter-option"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(account.id)}
                  onChange={(e) => toggleAccount(account.id, e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                  data-account-id={account.id}
                />
                <span className="truncate">{account.label}</span>
              </label>
            ))}
            {visibleAccounts.length === 0 ? (
              <div className="text-sm text-gray-400 py-2">
                No accounts match
              </div>
            ) : null}
          </div>
          <div className="pt-3 mt-3 border-t flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={clearSelection}
              className="text-sm text-gray-500 hover:text-gray-800"
              data-testid="account-filter-clear-button"
            >
              Clear
            </button>
            <div className="text-xs text-gray-400">
              {selectedIds.length > 0
                ? `${selectedIds.length} selected`
                : "All accounts"}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
