import { useRef, useState } from "react";
import {
  finalizeUpload,
  uploadFile,
  type FinalizeUploadRow,
  type UploadResult,
  type UploadReviewResult,
} from "../api/uploads.ts";

type ReviewSelection = Record<number, boolean>;

function initialSelection(result: UploadReviewResult): ReviewSelection {
  return Object.fromEntries(
    result.transactions.map((row) => [row.rowNumber, !row.duplicate]),
  );
}

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [selection, setSelection] = useState<ReviewSelection>({});
  const [error, setError] = useState<string | null>(null);

  function resetFileInput() {
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function clearSelection() {
    setSelection({});
  }

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    setResult(null);
    setError(null);
    clearSelection();

    try {
      const res = await uploadFile(selectedFile);
      setResult(res);
      if (res.status === "completed") {
        resetFileInput();
      } else {
        setSelection(initialSelection(res));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleFinalize() {
    if (!result || result.status !== "needs_review") return;

    setSubmitting(true);
    setError(null);

    try {
      const transactions: FinalizeUploadRow[] = result.transactions
        .filter((row) => selection[row.rowNumber])
        .map((row) => ({
          date: row.date,
          description: row.description,
          amount: row.amount,
          currency: row.currency,
          account: row.account,
          allowDuplicate: row.duplicate ? true : undefined,
        }));

      const res = await finalizeUpload(transactions);
      setResult({
        status: "completed",
        summary: {
          inserted: res.inserted,
          duplicates: res.duplicates,
        },
      });
      clearSelection();
      resetFileInput();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Finalize failed");
    } finally {
      setSubmitting(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setResult(null);
    setError(null);
    clearSelection();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0] ?? null;
    if (file) {
      setSelectedFile(file);
      setResult(null);
      setError(null);
      clearSelection();
    }
  }

  function setAllDuplicateDecisions(acceptDuplicates: boolean) {
    if (!result || result.status !== "needs_review") return;
    const next: ReviewSelection = {};
    for (const row of result.transactions) {
      next[row.rowNumber] = !row.duplicate || acceptDuplicates;
    }
    setSelection(next);
  }

  const reviewResult =
    result && result.status === "needs_review" ? result : null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Upload Transactions
      </h1>

      <div className="max-w-3xl space-y-6">
        <div className="bg-white rounded-xl border p-5 text-sm text-gray-600">
          <p className="font-semibold text-gray-800 mb-2">Supported formats</p>
          <p className="mb-2">
            Dates must be{" "}
            <code className="bg-gray-100 px-1 rounded">yyyy-mm-dd</code> and
            currency must be{" "}
            <code className="bg-gray-100 px-1 rounded">CAD</code>.
          </p>
          <p className="mb-2">
            <strong>CSV</strong> — columns:{" "}
            <code className="bg-gray-100 px-1 rounded">
              date, description, amount, currency, account
            </code>
          </p>
          <p className="mb-2">
            <strong>JSON</strong> — array of objects with the same fields.
          </p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            dragging
              ? "border-blue-400 bg-blue-50"
              : "border-gray-300 hover:border-gray-400 bg-white"
          }`}
          data-testid="file-dropzone"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.json"
            className="hidden"
            onChange={onInputChange}
            data-testid="upload-file-input"
          />
          {selectedFile ? (
            <p className="text-gray-700 text-sm font-medium">
              {selectedFile.name}
            </p>
          ) : (
            <p className="text-gray-500 text-sm">
              Drop a CSV or JSON file here, or click to select
            </p>
          )}
        </div>

        {selectedFile && (
          <button
            onClick={handleUpload}
            disabled={uploading || submitting}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            data-testid="upload-submit"
          >
            {uploading ? "Uploading…" : `Upload ${selectedFile.name}`}
          </button>
        )}

        {reviewResult && (
          <div
            className="bg-white border border-amber-200 rounded-xl p-4 text-sm"
            data-testid="upload-review"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-amber-900 mb-1">
                  Duplicate review required
                </p>
                <p className="text-amber-800">
                  {reviewResult.summary.duplicates} duplicate row
                  {reviewResult.summary.duplicates === 1 ? "" : "s"} found.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAllDuplicateDecisions(false)}
                  className="px-3 py-2 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50"
                  data-testid="skip-duplicates"
                >
                  Skip all duplicates
                </button>
                <button
                  type="button"
                  onClick={() => setAllDuplicateDecisions(true)}
                  className="px-3 py-2 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50"
                  data-testid="accept-duplicates"
                >
                  Accept all duplicates
                </button>
                <button
                  onClick={handleFinalize}
                  disabled={submitting}
                  className="px-3 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                  data-testid="upload-finalize"
                >
                  {submitting ? "Finalizing…" : "Finalize upload"}
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {reviewResult.transactions.map((row) => (
                <label
                  key={row.rowNumber}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${
                    row.duplicate
                      ? "border-amber-200 bg-amber-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selection[row.rowNumber] ?? false}
                    disabled={!row.duplicate}
                    onChange={() =>
                      setSelection((current) => ({
                        ...current,
                        [row.rowNumber]: !current[row.rowNumber],
                      }))
                    }
                    className="mt-1 h-4 w-4 rounded border-gray-300"
                    data-testid={`review-row-${row.rowNumber}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-gray-900">
                        {row.date} - {row.description}
                      </p>
                      {row.duplicate && (
                        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          Duplicate
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600">
                      {row.amount} {row.currency} - {row.account}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {result && result.status === "completed" && (
          <div
            className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm"
            data-testid="upload-result"
          >
            <p className="font-semibold text-green-800 mb-1">
              Upload successful
            </p>
            <p className="text-green-700">
              Inserted: {result.summary.inserted}
            </p>
            <p className="text-green-700">
              Duplicates: {result.summary.duplicates}
            </p>
          </div>
        )}

        {error && (
          <div
            className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700"
            data-testid="upload-error"
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
