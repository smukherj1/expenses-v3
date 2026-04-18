import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { uploadFile, type UploadResult } from "../api/uploads.ts";
import { saveUploadReviewSession } from "../lib/uploadReviewStore.ts";

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetFileInput() {
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    setResult(null);
    setError(null);

    try {
      const res = await uploadFile(selectedFile);
      setResult(res);
      if (res.status === "completed") {
        resetFileInput();
      } else {
        saveUploadReviewSession({
          createdAt: new Date().toISOString(),
          sourceFileName: selectedFile.name,
          result: res,
        });
        resetFileInput();
        navigate("/upload/duplicates");
      }
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
            disabled={uploading}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            data-testid="upload-submit"
          >
            {uploading ? "Uploading…" : `Upload ${selectedFile.name}`}
          </button>
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
