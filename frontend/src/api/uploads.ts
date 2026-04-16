import { post, postForm } from "./client.ts";

export interface UploadRow {
  rowNumber: number;
  date: string;
  description: string;
  amount: number;
  currency: string;
  account: string;
  duplicate: boolean;
}

export interface UploadCompletedResult {
  status: "completed";
  summary: {
    inserted: number;
    duplicates: number;
  };
}

export interface UploadReviewResult {
  status: "needs_review";
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
  allowDuplicate?: boolean;
}

export interface FinalizeUploadResult {
  status: "completed";
  inserted: number;
  duplicates: number;
}

export function uploadFile(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  return postForm<UploadResult>("/uploads", form);
}

export function finalizeUpload(
  transactions: FinalizeUploadRow[],
): Promise<FinalizeUploadResult> {
  return post<FinalizeUploadResult>("/uploads/finalize", { transactions });
}
