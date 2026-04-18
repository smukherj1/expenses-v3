import type { UploadReviewResult } from "../api/uploads.ts";

const STORAGE_KEY = "expenses-v3:upload-review";

export interface UploadReviewSession {
  createdAt: string;
  sourceFileName: string;
  result: UploadReviewResult;
}

let memorySession: UploadReviewSession | null = null;

function readSessionStorage(): UploadReviewSession | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UploadReviewSession;
  } catch {
    return null;
  }
}

function writeSessionStorage(session: UploadReviewSession) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Keep the in-memory copy even if browser storage is unavailable or full.
  }
}

function clearSessionStorage() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures on cleanup.
  }
}

export function saveUploadReviewSession(session: UploadReviewSession): void {
  memorySession = session;
  writeSessionStorage(session);
}

export function loadUploadReviewSession(): UploadReviewSession | null {
  if (memorySession) {
    return memorySession;
  }

  const session = readSessionStorage();
  if (session) {
    memorySession = session;
  }
  return session;
}

export function clearUploadReviewSession(): void {
  memorySession = null;
  clearSessionStorage();
}
