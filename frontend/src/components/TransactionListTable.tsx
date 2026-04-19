import {
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { Link } from "react-router";
import type {
  SortColumn,
  TransactionListColumn,
  TransactionListRow,
  TransactionListSelection,
  TransactionListSort,
} from "../lib/transactionList.ts";
import { formatAmount, toggleSort } from "../lib/transactionList.ts";

/**
 * Controlled table for transaction-shaped rows.
 *
 * TransactionListTable is presentational only:
 * - It does not fetch data.
 * - It does not own URL params.
 * - It does not sort, filter, or paginate rows internally.
 * - It does not mutate selection state.
 * - It does not know about upload finalization or transaction bulk actions.
 *
 * Parent pages must pass rows in the exact order and page slice that should be
 * displayed. Callback methods only report user intent.
 *
 * Sorting:
 * - A column is clickable only when it appears in sortableColumns.
 * - Clicking a new sortable column calls onSortChange({ column, order: "asc" }).
 * - Clicking the active sortable column toggles order.
 * - The table does not reset pagination; parent must do that.
 * - The table does not update URL params; /transactions owns that behavior.
 *
 * Selection:
 * - Row selection is controlled by getRowSelected and onToggleRow.
 * - Disabled rows, as determined by isRowSelectable, do not trigger onToggleRow.
 * - The page checkbox only applies to currently rendered selectable rows.
 * - onTogglePage never means "select all rows matching current server filters."
 * - /transactions should key selection by persisted transaction id.
 * - /upload/duplicates should key selection by stable upload rowNumber.
 *
 * Column rendering:
 * - columns controls both presence and order.
 * - A visible column is not automatically sortable.
 * - Duplicate-only columns should be configured by the duplicate review page.
 * - Tags should only be rendered when the tags column is included.
 *
 * Row identity:
 * - row.key must be stable across filtering, sorting, and pagination.
 * - Do not use visible row index as a key or callback identifier.
 */
export interface TransactionListTableProps {
  rows: TransactionListRow[];
  columns: TransactionListColumn[];
  sort?: TransactionListSort | null;
  sortableColumns?: SortColumn[];
  onSortChange?: (next: TransactionListSort) => void;
  selection?: TransactionListSelection | null;
  getRowSelected?: (row: TransactionListRow) => boolean;
  isRowSelectable?: (row: TransactionListRow) => boolean;
  onToggleRow?: (row: TransactionListRow) => void;
  onTogglePage?: (rows: TransactionListRow[], nextChecked: boolean) => void;
  getRowHref?: (row: TransactionListRow) => string | undefined;
  getRowTone?: (
    row: TransactionListRow,
  ) => "default" | "warning" | "muted" | undefined;
  emptyMessage?: string;
  loading?: boolean;
  testId?: string;
  formatAmount?: (row: TransactionListRow) => string;
  renderTags?: (row: TransactionListRow) => ReactNode;
  renderDuplicateStatus?: (row: TransactionListRow) => ReactNode;
}

function SortButton({
  column,
  activeSort,
  onSortChange,
  children,
}: {
  column: SortColumn;
  activeSort?: TransactionListSort | null;
  onSortChange?: (next: TransactionListSort) => void;
  children: ReactNode;
}) {
  const active = activeSort?.column === column ? activeSort : null;

  return (
    <button
      type="button"
      onClick={() => onSortChange?.(toggleSort(activeSort ?? null, column))}
      className={`inline-flex items-center gap-1 text-left font-medium ${
        onSortChange ? "hover:text-gray-900" : "cursor-default"
      }`}
      data-testid={`sort-${column}`}
    >
      <span>{children}</span>
      {active ? (
        <span className="text-xs text-gray-500">
          {active.order === "asc" ? "▲" : "▼"}
        </span>
      ) : null}
    </button>
  );
}

function useIndeterminateCheckbox(
  ref: RefObject<HTMLInputElement | null>,
  indeterminate: boolean,
) {
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate, ref]);
}

export default function TransactionListTable({
  rows,
  columns,
  sort = null,
  sortableColumns = [],
  onSortChange,
  selection = null,
  getRowSelected = () => false,
  isRowSelectable = () => true,
  onToggleRow,
  onTogglePage,
  getRowHref,
  getRowTone,
  emptyMessage = "No transactions found",
  loading = false,
  testId = "transaction-table",
  formatAmount: formatAmountProp = formatAmount,
  renderTags,
  renderDuplicateStatus,
}: TransactionListTableProps) {
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const selectableRows = useMemo(
    () => rows.filter((row) => isRowSelectable(row)),
    [isRowSelectable, rows],
  );
  const selectedRows = useMemo(
    () => selectableRows.filter((row) => getRowSelected(row)),
    [getRowSelected, selectableRows],
  );
  const allSelected =
    selectableRows.length > 0 && selectedRows.length === selectableRows.length;
  const indeterminate =
    selectableRows.length > 0 &&
    selectedRows.length > 0 &&
    selectedRows.length < selectableRows.length;

  useIndeterminateCheckbox(selectAllRef, indeterminate);

  function rowClassName(row: TransactionListRow) {
    const tone = getRowTone?.(row) ?? "default";
    const base = "border-b last:border-b-0";
    const toneClass =
      tone === "warning"
        ? "bg-amber-50/70"
        : tone === "muted"
          ? "bg-gray-50"
          : "bg-white";
    return `${base} ${toneClass}`;
  }

  function togglePageSelection(nextChecked: boolean) {
    if (!onTogglePage) return;
    onTogglePage(selectableRows, nextChecked);
  }

  if (loading) {
    return (
      <div
        className="p-8 text-center text-gray-400 text-sm"
        data-testid={`${testId}-table`}
      >
        Loading…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className="p-8 text-center text-gray-400 text-sm"
        data-testid={`${testId}-table`}
      >
        {testId === "transaction-row" ? (
          <div data-testid="empty-state">{emptyMessage}</div>
        ) : null}
        {testId === "transaction-row" ? null : emptyMessage}
      </div>
    );
  }

  return (
    <table className="w-full text-sm" data-testid={`${testId}-table`}>
      <thead className="bg-gray-50 text-gray-600">
        <tr className="text-left">
          {columns.includes("select") ? (
            <th className="w-12 px-4 py-3">
              {selection && onTogglePage ? (
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => togglePageSelection(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                  data-testid={`${testId}-select-all`}
                />
              ) : null}
            </th>
          ) : null}
          {columns.map((column) => {
            if (column === "select") {
              return null;
            }
            const sortable = sortableColumns.includes(column as SortColumn);
            const cellClass = "px-4 py-3";
            const label =
              column === "date"
                ? "Date"
                : column === "description"
                  ? "Description"
                  : column === "amount"
                    ? "Amount"
                    : column === "account"
                      ? "Account"
                      : column === "tags"
                        ? "Tags"
                        : "Status";

            return (
              <th
                key={column}
                className={`${cellClass} ${column === "amount" ? "text-right" : ""}`}
              >
                {sortable && onSortChange ? (
                  <SortButton
                    column={column as SortColumn}
                    activeSort={sort}
                    onSortChange={onSortChange}
                  >
                    {label}
                  </SortButton>
                ) : (
                  <span>{label}</span>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((row) => {
          const selectable = isRowSelectable(row);
          const selected = getRowSelected(row);
          const href = getRowHref?.(row);
          const description = href ? (
            <Link to={href} className="text-blue-600 hover:underline">
              {row.description}
            </Link>
          ) : (
            row.description
          );

          return (
            <tr
              key={row.key}
              className={rowClassName(row)}
              data-testid={testId}
              data-row-key={row.key}
            >
              {columns.includes("select") ? (
                <td className="px-4 py-2.5 align-top">
                  {selection && onToggleRow ? (
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={!selectable}
                      onChange={() => selectable && onToggleRow(row)}
                      className="mt-1 h-4 w-4 rounded border-gray-300"
                      data-testid={`${testId}-${row.key}`}
                    />
                  ) : null}
                </td>
              ) : null}
              {columns.map((column) => {
                if (column === "select") {
                  return null;
                }

                if (column === "date") {
                  return (
                    <td
                      key={column}
                      className="px-4 py-2.5 align-top text-gray-600"
                    >
                      {row.date}
                    </td>
                  );
                }

                if (column === "description") {
                  return (
                    <td
                      key={column}
                      className="px-4 py-2.5 align-top text-gray-900"
                    >
                      {description}
                    </td>
                  );
                }

                if (column === "amount") {
                  return (
                    <td
                      key={column}
                      className={`px-4 py-2.5 align-top text-right font-medium tabular-nums ${
                        row.amount >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatAmountProp(row)}
                    </td>
                  );
                }

                if (column === "account") {
                  return (
                    <td
                      key={column}
                      className="px-4 py-2.5 align-top text-gray-700"
                    >
                      {row.accountLabel ?? ""}
                    </td>
                  );
                }

                if (column === "tags") {
                  return (
                    <td key={column} className="px-4 py-2.5 align-top">
                      <div className="flex flex-wrap gap-1">
                        {renderTags
                          ? renderTags(row)
                          : (row.tags ?? []).map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                              >
                                {tag}
                              </span>
                            ))}
                      </div>
                    </td>
                  );
                }

                return (
                  <td
                    key={column}
                    className="px-4 py-2.5 align-top text-gray-700"
                  >
                    {renderDuplicateStatus
                      ? renderDuplicateStatus(row)
                      : row.duplicate
                        ? "Duplicate"
                        : "Included"}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
