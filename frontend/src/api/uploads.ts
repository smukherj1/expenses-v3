import { postForm } from "./client.ts";

export interface DuplicateWarning {
  date: string;
  description: string;
  amount: number;
  currency: string;
  account: string;
  accountId: string;
}

export interface UploadResult {
  inserted: number;
  duplicatesSkipped: number;
  duplicateWarnings: DuplicateWarning[];
}

export function uploadFile(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  return postForm<UploadResult>("/uploads", form);
}
