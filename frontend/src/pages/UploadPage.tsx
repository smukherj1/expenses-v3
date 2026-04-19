import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { getAccounts } from "../api/accounts.ts";
import {
  uploadFile,
  uploadFormats,
  getUploadFormatLabel,
  type UploadFormat,
  type UploadResult,
} from "../api/uploads.ts";
import { saveUploadReviewSession } from "../lib/uploadReviewStore.ts";

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [format, setFormat] = useState<UploadFormat>("generic_csv");
  const [accountMode, setAccountMode] = useState<"existing" | "custom">(
    "existing",
  );
  const [selectedAccountLabel, setSelectedAccountLabel] = useState("");
  const [customAccountLabel, setCustomAccountLabel] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: getAccounts,
  });

  const isInstitutionFormat = useMemo(
    () => format !== "generic_csv" && format !== "generic_json",
    [format],
  );

  const accountLabel =
    accountMode === "custom" ? customAccountLabel : selectedAccountLabel;
  const fileAccept = format === "generic_json" ? ".json" : ".csv";
  const uploadDisabled =
    uploading ||
    !selectedFile ||
    (isInstitutionFormat && accountLabel.trim().length === 0);

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
      const res = await uploadFile(selectedFile, {
        format,
        accountLabel: isInstitutionFormat ? accountLabel.trim() : undefined,
      });
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

  function onFormatChange(nextFormat: UploadFormat) {
    setFormat(nextFormat);
    setResult(null);
    setError(null);
    resetFileInput();
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
            Select one explicit format before choosing a file.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Format
              </span>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={format}
                onChange={(e) => onFormatChange(e.target.value as UploadFormat)}
                data-testid="upload-format-select"
              >
                {uploadFormats.map((option) => (
                  <option key={option} value={option}>
                    {getUploadFormatLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">
                File type
              </span>
              <div className="rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-600">
                {fileAccept}
              </div>
            </label>
          </div>
        </div>

        {isInstitutionFormat && (
          <div className="bg-white rounded-xl border p-5 text-sm text-gray-600 space-y-3">
            <p className="font-semibold text-gray-800">Account label</p>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={
                accountMode === "existing" ? selectedAccountLabel : "__custom__"
              }
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setAccountMode("custom");
                } else {
                  setAccountMode("existing");
                  setSelectedAccountLabel(e.target.value);
                }
              }}
              data-testid="upload-account-select"
            >
              <option value="" disabled>
                Select an existing account
              </option>
              {accounts.map((account) => (
                <option key={account.id} value={account.label}>
                  {account.label}
                </option>
              ))}
              <option value="__custom__">Custom label…</option>
            </select>
            {accountMode === "custom" && (
              <input
                type="text"
                value={customAccountLabel}
                onChange={(e) => setCustomAccountLabel(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Enter a new account label"
                data-testid="upload-account-label"
              />
            )}
          </div>
        )}

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
            accept={fileAccept}
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
            disabled={uploadDisabled}
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
              Format: {getUploadFormatLabel(result.format)}
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
