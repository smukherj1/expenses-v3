import { useRef, useState } from "react";
import { uploadFile, type UploadResult } from "../api/uploads.ts";

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    setResult(null);
    setError(null);
    try {
      const res = await uploadFile(selectedFile);
      setResult(res);
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setResult(null);
    setError(null);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0] ?? null;
    if (file) {
      setSelectedFile(file);
      setResult(null);
      setError(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Upload Transactions
      </h1>

      <div className="max-w-2xl space-y-6">
        <div className="bg-white rounded-xl border p-5 text-sm text-gray-600">
          <p className="font-semibold text-gray-800 mb-2">Supported formats</p>
          <p className="mb-2">
            <strong>CSV</strong> — columns:{" "}
            <code className="bg-gray-100 px-1 rounded">
              date, description, amount, currency, account
            </code>
          </p>
          <p>
            <strong>JSON</strong> — array of objects with the same fields. Dates
            must be <code className="bg-gray-100 px-1 rounded">yyyy-mm-dd</code>
            . Currency must be{" "}
            <code className="bg-gray-100 px-1 rounded">CAD</code>.
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
            disabled={uploading}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            data-testid="upload-submit"
          >
            {uploading ? "Uploading…" : `Upload ${selectedFile.name}`}
          </button>
        )}

        {result && (
          <div
            className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm"
            data-testid="upload-result"
          >
            <p className="font-semibold text-green-800 mb-1">
              Upload successful
            </p>
            <p className="text-green-700">Inserted: {result.inserted}</p>
            <p className="text-green-700">
              Duplicates skipped: {result.duplicatesSkipped}
            </p>
            {result.duplicateWarnings.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-green-600">
                  {result.duplicateWarnings.length} duplicate warnings
                </summary>
                <ul className="mt-1 space-y-0.5 text-green-600">
                  {result.duplicateWarnings.map((w, i) => (
                    <li key={i}>
                      {w.date} — {w.description} — {w.amount} {w.currency} (
                      {w.account})
                    </li>
                  ))}
                </ul>
              </details>
            )}
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
