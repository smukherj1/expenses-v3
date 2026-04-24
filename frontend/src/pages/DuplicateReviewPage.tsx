import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import Pagination from "../components/Pagination.tsx";
import TransactionListTable from "../components/TransactionListTable.tsx";
import {
  finalizeUpload,
  type FinalizeUploadRow,
  type FinalizeUploadResult,
  type UploadRow,
} from "../api/uploads.ts";
import {
  clearUploadReviewSession,
  loadUploadReviewSession,
  type UploadReviewSession,
} from "../lib/uploadReviewStore.ts";
import {
  filterReviewRows,
  formatAmount,
  sortTransactionRows,
  type TransactionListColumn,
  type TransactionListRow,
  type TransactionListSelection,
  type TransactionListSort,
} from "../lib/transactionList.ts";

type SelectionMap = Record<number, boolean>;
type DuplicateVisibility = "all" | "duplicates" | "nonDuplicates";

const DEFAULT_SORT: TransactionListSort = { column: "date", order: "asc" };
const DEFAULT_PAGE_SIZE = 20;
const REVIEW_COLUMNS: TransactionListColumn[] = [
  "select",
  "date",
  "description",
  "amount",
  "account",
  "duplicateStatus",
];
const REVIEW_SORTABLE_COLUMNS: TransactionListSort["column"][] = [
  "date",
  "description",
  "amount",
  "account",
  "duplicateStatus",
];

/**
 * Builds the initial duplicate-decision map for the review UI.
 *
 * @param rows Parsed upload rows returned by the backend review response.
 * @returns A row-number keyed map where non-duplicates start included and
 * duplicates start skipped until the user accepts them.
 */
function initialSelection(rows: UploadRow[]): SelectionMap {
  return Object.fromEntries(rows.map((row) => [row.rowNumber, !row.duplicate]));
}

/**
 * Converts upload rows into the shared table row shape.
 *
 * @param rows Parsed upload rows from the review session.
 * @returns TransactionListTable-compatible rows keyed by stable upload
 * rowNumber values so sorting, filtering, and paging do not lose decisions.
 */
function buildReviewRows(rows: UploadRow[]): TransactionListRow[] {
  return rows.map((row) => ({
    key: String(row.rowNumber),
    date: row.date,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    accountLabel: row.account,
    tags: row.tags ?? [],
    duplicate: row.duplicate,
    included: !row.duplicate,
  }));
}

/**
 * Converts selected review rows into the finalize API payload.
 *
 * @param rows Parsed upload rows from the review session.
 * @param selection Row-number keyed decisions where true means include.
 * @returns Normalized rows for POST /api/uploads/finalize; accepted duplicates
 * carry allowDuplicate so the backend inserts them intentionally.
 */
function buildFinalizeRows(
  rows: UploadRow[],
  selection: SelectionMap,
): FinalizeUploadRow[] {
  return rows
    .filter((row) => selection[row.rowNumber])
    .map((row) => ({
      date: row.date,
      description: row.description,
      amount: row.amount,
      currency: row.currency,
      account: row.account,
      tags: row.tags ?? [],
      allowDuplicate: row.duplicate ? true : undefined,
    }));
}

/**
 * Applies a bulk decision to a selection map without mutating the old map.
 *
 * @param current Current row-number keyed include/skip decisions.
 * @param rowNumbers Upload row numbers that should receive the new decision.
 * @param accepted True includes the rows, false skips them.
 * @returns A new selection map suitable for React state updates.
 */
function applySelectionUpdate(
  current: SelectionMap,
  rowNumbers: number[],
  accepted: boolean,
): SelectionMap {
  const next = { ...current };
  for (const rowNumber of rowNumbers) {
    next[rowNumber] = accepted;
  }
  return next;
}

/**
 * Finds every duplicate row in the upload payload.
 *
 * @param rows Parsed upload rows from the review session.
 * @returns Stable upload row numbers for all rows marked duplicate.
 */
function duplicateRowNumbers(rows: UploadRow[]): number[] {
  return rows.filter((row) => row.duplicate).map((row) => row.rowNumber);
}

/**
 * Finds duplicate rows currently accepted by the user.
 *
 * @param rows Parsed upload rows from the review session.
 * @param selection Current row-number keyed include/skip decisions.
 * @returns Stable upload row numbers for duplicate rows selected for inclusion.
 */
function selectedDuplicateRowNumbers(
  rows: UploadRow[],
  selection: SelectionMap,
): number[] {
  return rows
    .filter((row) => row.duplicate && selection[row.rowNumber])
    .map((row) => row.rowNumber);
}

/**
 * Counts accepted duplicate rows for the summary and selected action buttons.
 *
 * @param rows Parsed upload rows from the review session.
 * @param selection Current row-number keyed include/skip decisions.
 * @returns Number of duplicate rows currently accepted.
 */
function countSelectedDuplicates(
  rows: UploadRow[],
  selection: SelectionMap,
): number {
  return selectedDuplicateRowNumbers(rows, selection).length;
}

/**
 * Counts all rows that will be sent during finalization.
 *
 * @param rows Parsed upload rows from the review session.
 * @param selection Current row-number keyed include/skip decisions.
 * @returns Number of upload rows currently accepted.
 */
function countIncludedRows(rows: UploadRow[], selection: SelectionMap): number {
  return rows.filter((row) => selection[row.rowNumber]).length;
}

/**
 * Produces a human-readable duplicate visibility label for the summary text.
 *
 * @param duplicateVisibility Current review visibility filter.
 * @returns Label matching the active filter.
 */
function duplicateFilterLabel(
  duplicateVisibility: DuplicateVisibility,
): string {
  if (duplicateVisibility === "duplicates") return "Duplicates only";
  if (duplicateVisibility === "nonDuplicates") return "Non-duplicates only";
  return "All rows";
}

/**
 * Slices sorted review rows to the current client-side page.
 *
 * @param rows Filtered and sorted table rows.
 * @param page Requested one-based page number.
 * @param pageSize Number of rows to show per page.
 * @returns Safe page metadata and the rows visible on that page.
 */
function paginateRows(
  rows: TransactionListRow[],
  page: number,
  pageSize: number,
): {
  pageCount: number;
  safePage: number;
  visibleRows: TransactionListRow[];
} {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * pageSize;

  return {
    pageCount,
    safePage,
    visibleRows: rows.slice(startIndex, startIndex + pageSize),
  };
}

/**
 * Calculates select-all checkbox state for the currently visible duplicate rows.
 *
 * @param visibleRows Current paginated table rows.
 * @param selection Current row-number keyed include/skip decisions.
 * @returns Controlled checkbox state consumed by TransactionListTable.
 */
function buildReviewSelectionState(
  visibleRows: TransactionListRow[],
  selection: SelectionMap,
): TransactionListSelection {
  const selectableRows = visibleRows.filter(isDuplicateRow);
  const selectedCount = selectableRows.filter(
    (row) => selection[Number(row.key)],
  ).length;

  return {
    pageSelected: selectedCount > 0,
    pageIndeterminate:
      selectedCount > 0 && selectedCount < selectableRows.length,
  };
}

/**
 * Parses a shared table row key back to the upload row number.
 *
 * @param row TransactionListTable row keyed by upload row number.
 * @returns Numeric upload row number used in the selection map.
 */
function rowNumberFromTableRow(row: TransactionListRow): number {
  return Number(row.key);
}

/**
 * Reports whether a review row can be manually toggled.
 *
 * @param row TransactionListTable row for the duplicate review table.
 * @returns True for duplicate rows; non-duplicates are always included.
 */
function isDuplicateRow(row: TransactionListRow): boolean {
  return row.duplicate === true;
}

/**
 * Chooses the row background tone for duplicate review rows.
 *
 * @param row TransactionListTable row for the duplicate review table.
 * @returns Warning tone for duplicates and muted tone for fixed inclusions.
 */
function reviewRowTone(row: TransactionListRow): "warning" | "muted" {
  return row.duplicate ? "warning" : "muted";
}

/**
 * Renders the duplicate-status cell text for the review table.
 *
 * @param row TransactionListTable row for the duplicate review table.
 * @returns "Duplicate" for duplicate rows and "Included" for fixed rows.
 */
function renderDuplicateStatus(row: TransactionListRow): string {
  return row.duplicate ? "Duplicate" : "Included";
}

/**
 * Duplicate upload review page.
 *
 * The page owns the local review-session snapshot, client-side filtering,
 * sorting, pagination, duplicate include/skip decisions, and finalization.
 */
export default function DuplicateReviewPage() {
  const navigate = useNavigate();

  // Upload review flow: loaded once from local storage after /upload stores a
  // needs_review response. It is intentionally not updated in-place; cancel and
  // finalize clear the persisted session and leave this render path.
  const [session] = useState<UploadReviewSession | null>(() =>
    loadUploadReviewSession(),
  );

  // Duplicate decision flow: row-number keyed include/skip choices. Initial
  // state includes non-duplicates and skips duplicates; checkbox actions update
  // it per row, current page, selected duplicates, or all duplicates.
  const [selection, setSelection] = useState<SelectionMap>(() =>
    initialSelection(session?.result.transactions ?? []),
  );

  // Review pagination flow: current client-side page. It changes from
  // Pagination and resets to page 1 when sort, visibility, or page size changes.
  const [page, setPage] = useState(1);

  // Review pagination flow: rows per client-side page. It changes from the page
  // size select and resets the current page because the old page may not exist.
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Review sorting flow: current in-memory table sort. It changes from table
  // header clicks and resets pagination to keep the newly sorted list visible.
  const [sort, setSort] = useState<TransactionListSort>(DEFAULT_SORT);

  // Review filtering flow: controls whether all rows, only duplicates, or only
  // non-duplicates are shown. It changes from the visibility select and resets
  // pagination because the filtered row count changes.
  const [duplicateVisibility, setDuplicateVisibility] =
    useState<DuplicateVisibility>("all");

  // Finalize flow: disables the finalize button while POST /finalize is
  // running. It is set before the request and cleared in finally.
  const [submitting, setSubmitting] = useState(false);

  // Finalize flow: stores the successful finalize response. Once set, the page
  // switches to the completion summary and no longer renders the review table.
  const [finalResult, setFinalResult] = useState<FinalizeUploadResult | null>(
    null,
  );

  // Finalize flow: holds the latest finalize error message. It is cleared before
  // retrying and set from the caught API error if the request fails.
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => session?.result.transactions ?? [], [session]);
  const totalRows = rows.length;
  const duplicateCount = session?.result.summary.duplicates ?? 0;

  const filteredRows = useMemo(
    () => filterReviewRows(buildReviewRows(rows), duplicateVisibility),
    [duplicateVisibility, rows],
  );

  const sortedRows = useMemo(
    () => sortTransactionRows(filteredRows, sort),
    [filteredRows, sort],
  );

  const { safePage, visibleRows } = paginateRows(sortedRows, page, pageSize);
  const reviewSelection = buildReviewSelectionState(visibleRows, selection);

  const selectedDuplicateCount = useMemo(
    () => countSelectedDuplicates(rows, selection),
    [rows, selection],
  );

  const includedCount = useMemo(
    () => countIncludedRows(rows, selection),
    [rows, selection],
  );

  /**
   * Review decision handler.
   *
   * @param rowNumbers Stable upload row numbers to update.
   * @param accepted True includes the rows in finalization; false skips them.
   * @sideEffect Updates the duplicate decision map used by checkboxes, counts,
   * and the finalization payload.
   */
  function updateSelection(rowNumbers: number[], accepted: boolean) {
    setSelection((current) =>
      applySelectionUpdate(current, rowNumbers, accepted),
    );
  }

  /**
   * Bulk duplicate decision handler.
   *
   * @param accepted True accepts every duplicate; false skips every duplicate.
   * @sideEffect Updates the selection state for all duplicate rows in the review
   * session while leaving non-duplicates included.
   */
  function setAllDuplicates(accepted: boolean) {
    updateSelection(duplicateRowNumbers(rows), accepted);
  }

  /**
   * Selected duplicate decision handler.
   *
   * @param accepted True keeps currently accepted duplicates; false removes
   * them from the finalization payload.
   * @sideEffect Updates only duplicate rows that are currently selected in the
   * review decision map.
   */
  function setSelectedDuplicates(accepted: boolean) {
    updateSelection(selectedDuplicateRowNumbers(rows, selection), accepted);
  }

  /**
   * Finalize submission handler.
   *
   * @sideEffect Builds the selected row payload, posts it to finalizeUpload,
   * clears the persisted review session on success, renders the success summary,
   * and records an error message if the request fails.
   */
  async function handleFinalize() {
    if (!session) return;

    setSubmitting(true);
    setError(null);

    try {
      const transactions = buildFinalizeRows(rows, selection);
      const result = await finalizeUpload(transactions);
      clearUploadReviewSession();
      setFinalResult(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Finalize failed");
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Review cancel handler.
   *
   * @sideEffect Clears the persisted upload review session and navigates back to
   * the upload page so the user can start over.
   */
  function handleCancel() {
    clearUploadReviewSession();
    navigate("/upload");
  }

  if (finalResult) {
    return (
      <div className="max-w-3xl space-y-4" data-testid="duplicate-review-page">
        <h1 className="text-2xl font-bold text-gray-900">
          Duplicate Review Complete
        </h1>
        <div
          className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm"
          data-testid="duplicate-review-summary"
        >
          <p className="font-semibold text-green-800 mb-1">Upload successful</p>
          <p className="text-green-700">Inserted: {finalResult.inserted}</p>
          <p className="text-green-700">Duplicates: {finalResult.duplicates}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/upload"
            className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            Back to upload
          </Link>
          <Link
            to="/transactions"
            className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            View transactions
          </Link>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-2xl space-y-4" data-testid="duplicate-review-page">
        <h1 className="text-2xl font-bold text-gray-900">Duplicate Review</h1>
        <div
          className="bg-white border rounded-xl p-5 text-sm text-gray-600"
          data-testid="duplicate-review-empty"
        >
          <p className="font-semibold text-gray-900 mb-2">
            No upload is waiting for review.
          </p>
          <p className="mb-4">Start a new upload to review duplicate rows.</p>
          <Link
            to="/upload"
            className="inline-flex px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            Go to upload
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="duplicate-review-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Duplicate Review</h1>
          <p className="text-sm text-gray-600 mt-1">
            {session.sourceFileName} · {session.result.format} · {totalRows}{" "}
            rows · {duplicateCount} duplicates
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAllDuplicates(false)}
            className="px-3 py-2 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50"
            data-testid="duplicate-review-skip-all"
          >
            Skip all duplicates
          </button>
          <button
            type="button"
            onClick={() => setAllDuplicates(true)}
            className="px-3 py-2 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50"
            data-testid="duplicate-review-accept-all"
          >
            Accept all duplicates
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            data-testid="duplicate-review-cancel"
          >
            Cancel
          </button>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-4 text-sm flex flex-wrap items-center gap-4">
        <span className="text-gray-700" data-testid="duplicate-review-count">
          {includedCount} included, {selectedDuplicateCount} duplicate
          {selectedDuplicateCount === 1 ? "" : "s"} selected, showing{" "}
          {sortedRows.length} filtered rows (
          {duplicateFilterLabel(duplicateVisibility)})
        </span>
        <div className="flex items-center gap-2">
          <label
            className="text-gray-500"
            htmlFor="duplicate-review-visibility"
          >
            Visibility
          </label>
          <select
            id="duplicate-review-visibility"
            value={duplicateVisibility}
            onChange={(e) => {
              setDuplicateVisibility(e.target.value as DuplicateVisibility);
              setPage(1);
            }}
            className="border rounded-lg px-2 py-1"
            data-testid="duplicate-review-visibility"
          >
            <option value="all">All rows</option>
            <option value="duplicates">Duplicates only</option>
            <option value="nonDuplicates">Non-duplicates only</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-gray-500" htmlFor="duplicate-review-page-size">
            Rows per page
          </label>
          <select
            id="duplicate-review-page-size"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="border rounded-lg px-2 py-1"
            data-testid="duplicate-review-page-size"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedDuplicates(true)}
            disabled={selectedDuplicateCount === 0}
            className="px-3 py-2 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            data-testid="duplicate-review-accept-selected"
          >
            Accept selected
          </button>
          <button
            type="button"
            onClick={() => setSelectedDuplicates(false)}
            disabled={selectedDuplicateCount === 0}
            className="px-3 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
            data-testid="duplicate-review-skip-selected"
          >
            Skip selected
          </button>
          <button
            type="button"
            onClick={handleFinalize}
            disabled={submitting}
            className="px-3 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
            data-testid="duplicate-review-finalize"
          >
            {submitting ? "Finalizing…" : "Finalize upload"}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700"
          data-testid="duplicate-review-error"
        >
          {error}
        </div>
      )}

      <div className="bg-white border rounded-xl overflow-hidden">
        <TransactionListTable
          rows={visibleRows}
          columns={REVIEW_COLUMNS}
          sort={sort}
          sortableColumns={REVIEW_SORTABLE_COLUMNS}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          selection={reviewSelection}
          getRowSelected={(row) =>
            selection[rowNumberFromTableRow(row)] ?? false
          }
          isRowSelectable={isDuplicateRow}
          onToggleRow={(row) =>
            updateSelection(
              [rowNumberFromTableRow(row)],
              !(selection[rowNumberFromTableRow(row)] ?? false),
            )
          }
          onTogglePage={(pageRows, nextChecked) => {
            updateSelection(
              pageRows
                .filter(isDuplicateRow)
                .map((row) => rowNumberFromTableRow(row)),
              nextChecked,
            );
          }}
          getRowTone={reviewRowTone}
          renderDuplicateStatus={renderDuplicateStatus}
          emptyMessage="No review rows match the current filter"
          testId="duplicate-review-row"
          formatAmount={formatAmount}
        />
      </div>

      <Pagination
        page={safePage}
        total={sortedRows.length}
        limit={pageSize}
        onPage={(nextPage) => setPage(nextPage)}
      />
    </div>
  );
}
