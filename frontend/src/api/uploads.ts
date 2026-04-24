import { post, postForm } from "./client.ts";

export const uploadFormats = [
  "generic_csv",
  "generic_json",
  "td_canada",
  "rbc_canada",
  "amex_canada",
  "cibc_canada",
] as const;

export type UploadFormat = (typeof uploadFormats)[number];

export interface UploadRow {
  rowNumber: number;
  date: string;
  description: string;
  amount: number;
  currency: string;
  account: string;
  duplicate: boolean;
  tags: string[];
}

export interface UploadCompletedResult {
  status: "completed";
  format: UploadFormat;
  summary: {
    inserted: number;
    duplicates: number;
  };
}

export interface UploadReviewResult {
  status: "needs_review";
  format: UploadFormat;
  summary: {
    inserted: 0;
    duplicates: number;
  };
  transactions: UploadRow[];
}

export type UploadResult = UploadCompletedResult | UploadReviewResult;

export interface FinalizeUploadRow {
  date: string;
  description: string;
  amount: number;
  currency: string;
  account: string;
  tags: string[];
  allowDuplicate?: boolean;
}

export interface FinalizeUploadResult {
  status: "completed";
  inserted: number;
  duplicates: number;
}

export interface UploadOptions {
  format: UploadFormat;
  accountLabel?: string;
}

export function uploadFile(
  file: File,
  options: UploadOptions,
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("format", options.format);
  if (options.accountLabel) {
    form.append("accountLabel", options.accountLabel);
  }
  return postForm<UploadResult>("/uploads", form);
}

export function finalizeUpload(
  transactions: FinalizeUploadRow[],
): Promise<FinalizeUploadResult> {
  return post<FinalizeUploadResult>("/uploads/finalize", { transactions });
}

const uploadFormatLabels: Record<UploadFormat, string> = {
  generic_csv: "Generic CSV",
  generic_json: "Generic JSON",
  td_canada: "TD Canada",
  rbc_canada: "RBC Canada",
  amex_canada: "Amex Canada",
  cibc_canada: "CIBC Canada",
};

export function getUploadFormatLabel(format: UploadFormat) {
  return uploadFormatLabels[format] || format;
}
