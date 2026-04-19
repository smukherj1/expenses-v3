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
  type TransactionListSort,
} from "../lib/transactionList.ts";

type SelectionMap = Record<number, boolean>;

const DEFAULT_SORT: TransactionListSort = { column: "date", order: "asc" };

function initialSelection(rows: UploadRow[]): SelectionMap {
  return Object.fromEntries(rows.map((row) => [row.rowNumber, !row.duplicate]));
}

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
      allowDuplicate: row.duplicate ? true : undefined,
    }));
}

export default function DuplicateReviewPage() {
  const navigate = useNavigate();
  const [session] = useState<UploadReviewSession | null>(() =>
    loadUploadReviewSession(),
  );
  const [selection, setSelection] = useState<SelectionMap>(() =>
    initialSelection(session?.result.transactions ?? []),
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<TransactionListSort>(DEFAULT_SORT);
  const [duplicateVisibility, setDuplicateVisibility] = useState<
    "all" | "duplicates" | "nonDuplicates"
  >("all");
  const [submitting, setSubmitting] = useState(false);
  const [finalResult, setFinalResult] = useState<FinalizeUploadResult | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => session?.result.transactions ?? [], [session]);
  const totalRows = rows.length;
  const duplicateCount = session?.result.summary.duplicates ?? 0;

  const filteredRows = useMemo(
    () =>
      filterReviewRows(
        rows.map((row) => ({
          key: String(row.rowNumber),
          date: row.date,
          description: row.description,
          amount: row.amount,
          currency: row.currency,
          accountLabel: row.account,
          duplicate: row.duplicate,
          included: !row.duplicate,
        })),
        duplicateVisibility,
      ),
    [duplicateVisibility, rows],
  );

  const sortedRows = useMemo(
    () => sortTransactionRows(filteredRows, sort),
    [filteredRows, sort],
  );

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * pageSize;
  const visibleRows = sortedRows.slice(startIndex, startIndex + pageSize);
  const visibleSelectableRows = visibleRows.filter((row) => row.duplicate);

  const selectedDuplicateCount = useMemo(
    () =>
      rows.filter((row) => row.duplicate && selection[row.rowNumber]).length,
    [rows, selection],
  );

  const includedCount = useMemo(
    () => rows.filter((row) => selection[row.rowNumber]).length,
    [rows, selection],
  );

  const duplicateFilterLabel =
    duplicateVisibility === "duplicates"
      ? "Duplicates only"
      : duplicateVisibility === "nonDuplicates"
        ? "Non-duplicates only"
        : "All rows";

  function updateSelection(rowNumbers: number[], accepted: boolean) {
    setSelection((current) => {
      const next = { ...current };
      for (const rowNumber of rowNumbers) {
        next[rowNumber] = accepted;
      }
      return next;
    });
  }

  function setAllDuplicates(accepted: boolean) {
    updateSelection(
      rows.filter((row) => row.duplicate).map((row) => row.rowNumber),
      accepted,
    );
  }

  function setSelectedDuplicates(accepted: boolean) {
    updateSelection(
      rows
        .filter((row) => row.duplicate && selection[row.rowNumber])
        .map((row) => row.rowNumber),
      accepted,
    );
  }

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
          {sortedRows.length} filtered rows ({duplicateFilterLabel})
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
              setDuplicateVisibility(
                e.target.value as "all" | "duplicates" | "nonDuplicates",
              );
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
          columns={[
            "select",
            "date",
            "description",
            "amount",
            "account",
            "duplicateStatus",
          ]}
          sort={sort}
          sortableColumns={[
            "date",
            "description",
            "amount",
            "account",
            "duplicateStatus",
          ]}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          selection={{
            pageSelected:
              visibleSelectableRows.filter((row) => selection[Number(row.key)])
                .length > 0,
            pageIndeterminate:
              visibleSelectableRows.filter((row) => selection[Number(row.key)])
                .length > 0 &&
              visibleSelectableRows.filter((row) => selection[Number(row.key)])
                .length < visibleSelectableRows.length,
          }}
          getRowSelected={(row) => selection[Number(row.key)] ?? false}
          isRowSelectable={(row) => row.duplicate === true}
          onToggleRow={(row) =>
            updateSelection(
              [Number(row.key)],
              !(selection[Number(row.key)] ?? false),
            )
          }
          onTogglePage={(pageRows, nextChecked) => {
            updateSelection(
              pageRows
                .filter((row) => row.duplicate)
                .map((row) => Number(row.key)),
              nextChecked,
            );
          }}
          getRowTone={(row) => (row.duplicate ? "warning" : "muted")}
          renderDuplicateStatus={(row) =>
            row.duplicate ? "Duplicate" : "Included"
          }
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
