/**
 * E2E tests for the Financial Tracker backend API.
 * Requires the backend to be running at BACKEND_URL (default: http://localhost:3000).
 * Each test seeds and cleans up its own data.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";

const BASE_URL = process.env.BACKEND_URL ?? "http://localhost:3000";
const API = `${BASE_URL}/api`;

// ── helpers ──────────────────────────────────────────────────────────────────

async function req(method: string, path: string, body?: unknown) {
  return fetch(`${API}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function json<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const res = await req(method, path, body);
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

type CsvRow = {
  date: string;
  description: string;
  amount: string | number;
  account: string;
  tags?: string[];
};

type UploadFormat =
  | "generic_csv"
  | "generic_json"
  | "td_canada"
  | "rbc_canada"
  | "amex_canada"
  | "cibc_canada";

function readFixture(name: string): string {
  return readFileSync(new URL(`./data/${name}`, import.meta.url), "utf8");
}

function escapeCsvValue(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function sortStrings(values: readonly string[]) {
  return [...values].sort();
}

/** Build a minimal well-formed CSV for upload tests. Dates must be yyyy-mm-dd. */
function makeCsv(rows: CsvRow[]) {
  const includeTags = rows.some((row) => row.tags !== undefined);
  const header = includeTags
    ? "date,description,amount,currency,account,tags"
    : "date,description,amount,currency,account";
  const lines = rows.map((r) => {
    const base = [
      r.date,
      r.description,
      String(r.amount),
      "CAD",
      r.account,
    ].map(escapeCsvValue);
    if (!includeTags) {
      return base.join(",");
    }
    return [...base, escapeCsvValue((r.tags ?? []).join(","))].join(",");
  });
  return [header, ...lines].join("\n");
}

async function uploadCsv(
  rows: CsvRow[],
  filename = "test.csv",
  options: { format?: UploadFormat; accountLabel?: string } = {},
): Promise<Response> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([makeCsv(rows)], { type: "text/csv" }),
    filename,
  );
  form.append("format", options.format ?? "generic_csv");
  if (options.accountLabel) {
    form.append("accountLabel", options.accountLabel);
  }
  return fetch(`${API}/uploads`, { method: "POST", body: form });
}

let cleanupAccountLabels: string[] = [];
let cleanupTagNames: string[] = [];
let cleanupRuleIds: string[] = [];

function uniqueLabel(base: string): string {
  return `${base} ${crypto.randomUUID().slice(0, 8)}`;
}

function trackAccount(label: string): string {
  cleanupAccountLabels.push(label);
  return label;
}

function trackTag(name: string): string {
  cleanupTagNames.push(name);
  return name;
}

function trackRule(id: string): string {
  cleanupRuleIds.push(id);
  return id;
}

beforeEach(() => {
  cleanupAccountLabels = [];
  cleanupTagNames = [];
  cleanupRuleIds = [];
});

afterEach(async () => {
  for (const id of [...cleanupRuleIds].reverse()) {
    await req("DELETE", `/rules/${id}`);
  }
  for (const label of [...cleanupAccountLabels].reverse()) {
    await deleteAccountByLabel(label);
  }
  for (const name of [...cleanupTagNames].reverse()) {
    await deleteTagByName(name);
  }
});

async function uploadRaw(
  content: string,
  filename: string,
  format: UploadFormat,
  accountLabel?: string,
  mimeType = filename.endsWith(".json") ? "application/json" : "text/csv",
): Promise<Response> {
  const form = new FormData();
  form.append("file", new Blob([content], { type: mimeType }), filename);
  form.append("format", format);
  if (accountLabel) form.append("accountLabel", accountLabel);
  return fetch(`${API}/uploads`, { method: "POST", body: form });
}

async function uploadFixture(
  filename: string,
  format: UploadFormat,
  accountLabel: string,
): Promise<Response> {
  return uploadRaw(readFixture(filename), filename, format, accountLabel);
}

async function finalizeUpload(
  rows: Array<{
    date: string;
    description: string;
    amount: string | number;
    currency?: string;
    account: string;
    tags?: string[];
    allowDuplicate?: boolean;
  }>,
) {
  const res = await req("POST", "/uploads/finalize", {
    transactions: rows.map((row) => ({
      currency: "CAD",
      ...row,
    })),
  });
  return {
    status: res.status,
    data: (await res.json()) as unknown,
  };
}

async function getAccountId(label: string): Promise<string> {
  const { data } = await json<Array<{ id: string; label: string }>>(
    "GET",
    "/accounts",
  );
  const acct = data.find((a) => a.label === label);
  if (!acct) throw new Error(`Account not found: ${label}`);
  return acct.id;
}

async function deleteAccountByLabel(label: string) {
  const { data } = await json<Array<{ id: string; label: string }>>(
    "GET",
    "/accounts",
  );
  const acct = data.find((a) => a.label === label);
  if (acct) await req("DELETE", `/accounts/${acct.id}`);
}

async function deleteTagByName(name: string) {
  const { data } = await json<Array<{ id: string; name: string }>>(
    "GET",
    "/tags",
  );
  const tag = data.find((t) => t.name === name);
  if (tag) await req("DELETE", `/tags/${tag.id}`);
}

async function seedCsvRows(
  rows: Array<{
    date: string;
    description: string;
    amount: string | number;
    account: string;
    tags?: string[];
  }>,
  filename = `seed-${crypto.randomUUID()}.csv`,
) {
  const res = await uploadCsv(rows, filename);
  if (!res.ok) {
    throw new Error(`Seed upload failed: ${res.status} ${await res.text()}`);
  }
  return res;
}

async function getTransactionsForAccount(accountId: string) {
  const { data } = await json<{
    data: Array<{
      id: string;
      description: string;
      amount: number;
      date: string;
      accountId: string;
      createdAt?: string;
    }>;
  }>("GET", `/transactions?accountIds=${accountId}&limit=100`);
  return data.data;
}

async function getTransactionByAccountAndDescription(
  accountId: string,
  description: string,
) {
  const rows = await getTransactionsForAccount(accountId);
  const row = [...rows]
    .filter((txn) => txn.description === description)
    .sort((left, right) =>
      String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")),
    )[0];
  if (!row) {
    throw new Error(
      `Transaction not found for account ${accountId} and description ${description}`,
    );
  }
  const detail = await json<{ id: string; tags: string[] }>(
    "GET",
    `/transactions/${row.id}`,
  );
  return detail.data;
}

// ── accounts ─────────────────────────────────────────────────────────────────

describe("Accounts", () => {
  it("POST /api/accounts — not supported (returns 404)", async () => {
    const accountLabel = uniqueLabel("Accounts Test Chequing");
    const { status } = await json("POST", "/accounts", { label: accountLabel });
    expect(status).toBe(404);
  });

  it("POST /api/uploads — automatically creates account", async () => {
    const accountLabel = trackAccount(uniqueLabel("Accounts Upload Chequing"));
    const res = await uploadCsv([
      {
        date: "2025-03-01",
        description: "Grocery Store",
        amount: "-82.5",
        account: accountLabel,
      },
    ]);
    const data = (await res.json()) as {
      status: string;
      format: UploadFormat;
      summary: { inserted: number; duplicates: number };
    };
    expect(res.status).toBe(201);
    expect(data.status).toBe("completed");
    expect(data.format).toBe("generic_csv");
    expect(data.summary.inserted).toBe(1);
  });

  it("GET /api/accounts — lists auto-created accounts", async () => {
    const accountLabel = trackAccount(uniqueLabel("Accounts List Chequing"));
    await seedCsvRows([
      {
        date: "2025-03-01",
        description: "Seed",
        amount: "-1",
        account: accountLabel,
      },
    ]);
    const { status, data } = await json<Array<{ id: string; label: string }>>(
      "GET",
      "/accounts",
    );
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    const labels = data.map((a) => a.label);
    expect(labels).toContain(accountLabel);
  });

  it("DELETE /api/accounts/:id — deletes account and cascades transactions", async () => {
    const accountLabel = trackAccount(uniqueLabel("Accounts Delete Chequing"));
    await seedCsvRows([
      {
        date: "2025-03-01",
        description: "Seed",
        amount: "-1",
        account: accountLabel,
      },
    ]);
    const id = await getAccountId(accountLabel);
    const res = await req("DELETE", `/accounts/${id}`);
    expect(res.status).toBe(204);
  });

  it("DELETE /api/accounts/:id — 404 for unknown id", async () => {
    const { status, data } = await json<{ error: { code: string } }>(
      "DELETE",
      "/accounts/00000000-0000-0000-0000-000000000999",
    );
    expect(status).toBe(404);
    expect(data.error.code).toBe("NOT_FOUND");
  });
});

// ── uploads ───────────────────────────────────────────────────────────────────

describe("Uploads", () => {
  it("POST /api/uploads — accepts within upload without review", async () => {
    const accountLabel = trackAccount(uniqueLabel("Uploads Duplicate Free"));
    const txn = {
      date: "2015-10-29",
      description: "Some Test Transaction 123456",
      amount: "-123456.78",
      account: accountLabel,
    };
    const res = await uploadCsv([{ ...txn }, { ...txn }], "airlines.csv");
    const data = (await res.json()) as {
      status: string;
      format: UploadFormat;
      summary: { inserted: number; duplicates: number };
    };

    expect(res.status).toBe(201);
    expect(data.status).toBe("completed");
    expect(data.format).toBe("generic_csv");
    expect(data.summary.inserted).toBe(2);
    expect(data.summary.duplicates).toBe(0);
  });

  it("POST /api/uploads — inserts transactions and creates accounts automatically", async () => {
    const chequingLabel = trackAccount(uniqueLabel("Uploads Chequing"));
    const visaLabel = trackAccount(uniqueLabel("Uploads Visa"));
    const res = await uploadCsv(
      [
        {
          date: "2025-03-01",
          description: "Grocery Store",
          amount: "-82.5",
          account: chequingLabel,
        },
        {
          date: "2025-03-05",
          description: "Payroll Deposit",
          amount: "3200.0",
          account: chequingLabel,
        },
        {
          date: "2025-03-10",
          description: "Coffee Shop",
          amount: "-6.75",
          account: visaLabel,
        },
      ],
      "march.csv",
    );
    const data = (await res.json()) as {
      status: string;
      summary: { inserted: number; duplicates: number };
    };
    expect(res.status).toBe(201);
    expect(data.status).toBe("completed");
    expect(data.summary.inserted).toBe(3);
    expect(data.summary.duplicates).toBe(0);

    // Both accounts should now exist
    const { data: accounts } = await json<Array<{ label: string }>>(
      "GET",
      "/accounts",
    );
    const labels = accounts.map((a) => a.label);
    expect(labels).toContain(chequingLabel);
    expect(labels).toContain(visaLabel);
  });

  it("POST /api/uploads — skips duplicate rows on second upload", async () => {
    const chequingLabel = trackAccount(uniqueLabel("Uploads Duplicate Seed"));
    await seedCsvRows([
      {
        date: "2025-03-01",
        description: "Grocery Store",
        amount: "-82.5",
        account: chequingLabel,
      },
    ]);
    const res = await uploadCsv(
      [
        {
          date: "2025-03-01",
          description: "Grocery Store",
          amount: "-82.5",
          account: chequingLabel,
        },
        {
          date: "2025-03-15",
          description: "Internet Bill",
          amount: "-59.99",
          account: chequingLabel,
        },
      ],
      "march2.csv",
    );
    const data = (await res.json()) as {
      status: string;
      format: UploadFormat;
      summary: { inserted: number; duplicates: number };
      transactions: Array<{ duplicate: boolean }>;
    };
    expect(res.status).toBe(200);
    expect(data.status).toBe("needs_review");
    expect(data.format).toBe("generic_csv");
    expect(data.summary.inserted).toBe(0);
    expect(data.summary.duplicates).toBe(1);
    expect(data.transactions.map((row) => row.duplicate)).toEqual([
      true,
      false,
    ]);
  });

  it("POST /api/uploads/finalize — inserts only the selected reviewed rows", async () => {
    const chequingLabel = trackAccount(uniqueLabel("Uploads Finalize"));
    const res = await finalizeUpload([
      {
        date: "2025-03-15",
        description: "Internet Bill",
        amount: "-59.99",
        account: chequingLabel,
      },
    ]);
    const data = res.data as {
      status: string;
      inserted: number;
      duplicates: number;
    };
    expect(res.status).toBe(201);
    expect(data.status).toBe("completed");
    expect(data.inserted).toBe(1);
    expect(data.duplicates).toBe(0);
  });

  it("POST /api/uploads/finalize — allows duplicates when explicitly requested", async () => {
    const chequingLabel = trackAccount(
      uniqueLabel("Uploads Finalize Duplicate"),
    );
    await seedCsvRows([
      {
        date: "2025-03-01",
        description: "Grocery Store",
        amount: "-82.5",
        account: chequingLabel,
      },
    ]);
    const res = await finalizeUpload([
      {
        date: "2025-03-01",
        description: "Grocery Store",
        amount: "-82.5",
        account: chequingLabel,
        allowDuplicate: true,
      },
      {
        date: "2025-03-20",
        description: "Ride Share",
        amount: "-18.0",
        account: chequingLabel,
      },
    ]);
    const data = res.data as {
      status: string;
      inserted: number;
      duplicates: number;
    };
    expect(res.status).toBe(201);
    expect(data.status).toBe("completed");
    expect(data.inserted).toBe(2);
    expect(data.duplicates).toBe(1);
  });

  it("POST /api/uploads — merging: reuses existing accounts, creates only new ones", async () => {
    const existingLabel = trackAccount(uniqueLabel("Uploads Merge Existing"));
    const newLabel = trackAccount(uniqueLabel("Uploads Merge New"));
    await seedCsvRows([
      {
        date: "2025-04-01",
        description: "Seed Existing",
        amount: "-1",
        account: existingLabel,
      },
    ]);
    const res = await uploadCsv(
      [
        {
          date: "2025-04-01",
          description: "Existing Account Txn",
          amount: "-20.0",
          account: existingLabel,
        },
        {
          date: "2025-04-01",
          description: "New Account Txn",
          amount: "500.0",
          account: newLabel,
        },
      ],
      "mixed.csv",
    );
    const data = (await res.json()) as {
      status: string;
      format: UploadFormat;
      summary: { inserted: number; duplicates: number };
    };
    expect(data.status).toBe("completed");
    expect(data.format).toBe("generic_csv");
    expect(data.summary.inserted).toBe(2);

    // Only the two test labels should be present.
    const { data: accounts } = await json<Array<{ label: string }>>(
      "GET",
      "/accounts",
    );
    const testAccounts = accounts.filter((a) =>
      [existingLabel, newLabel].includes(a.label),
    );
    expect(testAccounts.length).toBe(2);
  });

  it("POST /api/uploads — rejects non-CAD currency", async () => {
    const someAccountLabel = trackAccount(uniqueLabel("Uploads Non CAD"));
    const csv = `date,description,amount,currency,account\n2025-03-01,Something,-10.00,USD,${someAccountLabel}`;
    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "usd.csv");
    form.append("format", "generic_csv");
    const res = await fetch(`${API}/uploads`, { method: "POST", body: form });
    const data = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(422);
    expect(data.error.code).toBe("UNSUPPORTED_CURRENCY");
  });

  it("POST /api/uploads — rejects CSV with wrong date format (yyyy/mm/dd)", async () => {
    const someAccountLabel = trackAccount(uniqueLabel("Uploads Bad Csv Date"));
    const res = await uploadCsv(
      [
        {
          date: "2025/03/01", // wrong format — must be yyyy-mm-dd
          description: "Something",
          amount: "-10.0",
          account: someAccountLabel,
        },
      ],
      "bad-date.csv",
    );
    const data = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /api/uploads — rejects JSON with wrong date format (yyyy/mm/dd)", async () => {
    const someAccountLabel = trackAccount(uniqueLabel("Uploads Bad Json Date"));
    const jsonBody = JSON.stringify([
      {
        date: "2025/03/01", // wrong format — must be yyyy-mm-dd
        description: "Something",
        amount: -10.0,
        currency: "CAD",
        account: someAccountLabel,
      },
    ]);
    const form = new FormData();
    form.append(
      "file",
      new Blob([jsonBody], { type: "application/json" }),
      "bad-date.json",
    );
    form.append("format", "generic_json");
    const res = await fetch(`${API}/uploads`, { method: "POST", body: form });
    const data = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /api/uploads — accepts valid JSON upload", async () => {
    const chequingLabel = trackAccount(uniqueLabel("Uploads Json"));
    const jsonBody = JSON.stringify([
      {
        date: "2025-04-02",
        description: "JSON Upload Test",
        amount: "-15.0",
        currency: "CAD",
        account: chequingLabel,
      },
    ]);
    const form = new FormData();
    form.append(
      "file",
      new Blob([jsonBody], { type: "application/json" }),
      "upload.json",
    );
    form.append("format", "generic_json");
    const res = await fetch(`${API}/uploads`, { method: "POST", body: form });
    const data = (await res.json()) as {
      status: string;
      format: UploadFormat;
      summary: { inserted: number; duplicates: number };
    };
    expect(res.status).toBe(201);
    expect(data.status).toBe("completed");
    expect(data.format).toBe("generic_json");
    expect(data.summary.inserted).toBe(1);
  });

  it("POST /api/uploads — preserves tags on generic CSV uploads", async () => {
    const accountLabel = trackAccount(uniqueLabel("Uploads Tagged CSV"));
    const tagNames = ["groceries", "food", "groceries"];
    const description = `Tagged CSV ${crypto.randomUUID().slice(0, 8)}`;

    const ruleTagName = trackTag(uniqueLabel("csv-rule-food"));
    const ruleTag = await json<{ id: string }>("POST", "/tags", {
      name: ruleTagName,
    });
    expect(ruleTag.status).toBe(201);
    await json("POST", "/rules", {
      tagId: ruleTag.data.id,
      conditions: [
        {
          matchField: "description",
          matchType: "contains",
          matchValue: description,
        },
      ],
    });

    const res = await uploadCsv([
      {
        date: "2025-04-10",
        description,
        amount: "-18.91",
        account: accountLabel,
        tags: tagNames,
      },
    ]);
    const data = (await res.json()) as {
      status: string;
      summary: { inserted: number; duplicates: number };
    };

    expect(res.status).toBe(201);
    expect(data.status).toBe("completed");
    expect(data.summary.inserted).toBe(1);

    const accountId = await getAccountId(accountLabel);
    const detail = await getTransactionByAccountAndDescription(
      accountId,
      description,
    );
    expect([...detail.tags].sort()).toEqual(
      ["groceries", "food", ruleTagName].sort(),
    );
  });

  it("POST /api/uploads — preserves tags on generic JSON uploads", async () => {
    const accountLabel = trackAccount(uniqueLabel("Uploads Tagged JSON"));
    const description = `Tagged JSON ${crypto.randomUUID().slice(0, 8)}`;
    const jsonBody = JSON.stringify([
      {
        date: "2025-04-12",
        description,
        amount: "-12.34",
        currency: "CAD",
        account: accountLabel,
        tags: ["travel", "backup", "travel"],
      },
    ]);
    const form = new FormData();
    form.append(
      "file",
      new Blob([jsonBody], { type: "application/json" }),
      "tagged.json",
    );
    form.append("format", "generic_json");
    const res = await fetch(`${API}/uploads`, { method: "POST", body: form });
    const data = (await res.json()) as {
      status: string;
      summary: { inserted: number; duplicates: number };
    };

    expect(res.status).toBe(201);
    expect(data.status).toBe("completed");
    expect(data.summary.inserted).toBe(1);

    const accountId = await getAccountId(accountLabel);
    const detail = await getTransactionByAccountAndDescription(
      accountId,
      description,
    );
    expect([...detail.tags].sort()).toEqual(["travel", "backup"].sort());
  });

  it("POST /api/uploads — returns tags in duplicate review and finalize preserves them", async () => {
    const accountLabel = trackAccount(uniqueLabel("Uploads Tagged Review"));
    const description = `Tagged Review ${crypto.randomUUID().slice(0, 8)}`;
    const uploadedTags = ["personal", "backup"];

    await seedCsvRows([
      {
        date: "2025-04-11",
        description,
        amount: "-7.25",
        account: accountLabel,
      },
    ]);

    const reviewRes = await uploadCsv([
      {
        date: "2025-04-11",
        description,
        amount: "-7.25",
        account: accountLabel,
        tags: uploadedTags,
      },
      {
        date: "2025-04-12",
        description: "Non Duplicate",
        amount: "-2.5",
        account: accountLabel,
        tags: ["notes"],
      },
    ]);
    const reviewData = (await reviewRes.json()) as {
      status: string;
      transactions: Array<{ duplicate: boolean; tags: string[] }>;
    };

    expect(reviewRes.status).toBe(200);
    expect(reviewData.status).toBe("needs_review");
    expect(sortStrings(reviewData.transactions[0]?.tags ?? [])).toEqual(
      sortStrings(uploadedTags),
    );

    const finalizeRes = await finalizeUpload([
      {
        date: "2025-04-11",
        description,
        amount: "-7.25",
        account: accountLabel,
        tags: uploadedTags,
        allowDuplicate: true,
      },
      {
        date: "2025-04-12",
        description: "Non Duplicate",
        amount: "-2.5",
        account: accountLabel,
        tags: ["notes"],
      },
    ]);
    const finalizeData = finalizeRes.data as {
      status: string;
      inserted: number;
      duplicates: number;
    };

    expect(finalizeRes.status).toBe(201);
    expect(finalizeData.status).toBe("completed");
    expect(finalizeData.inserted).toBe(2);
    expect(finalizeData.duplicates).toBe(1);

    const accountId = await getAccountId(accountLabel);
    const detail = await getTransactionByAccountAndDescription(
      accountId,
      description,
    );
    expect(sortStrings(detail.tags)).toEqual(sortStrings(uploadedTags));
  });

  it("POST /api/uploads — uploads TD Canada fixture", async () => {
    const tdLabel = trackAccount(uniqueLabel("Uploads TD"));
    const res = await uploadFixture("td.csv", "td_canada", tdLabel);
    const data = (await res.json()) as {
      status: string;
      format: UploadFormat;
      summary: { inserted: number; duplicates: number };
    };
    expect(res.status).toBe(201);
    expect(data.status).toBe("completed");
    expect(data.format).toBe("td_canada");
    expect(data.summary.inserted).toBe(6);
    expect(data.summary.duplicates).toBe(0);
  });

  it("POST /api/uploads — uploads RBC Canada fixture", async () => {
    const rbcLabel = trackAccount(uniqueLabel("Uploads RBC"));
    const res = await uploadFixture("rbc.csv", "rbc_canada", rbcLabel);
    const data = (await res.json()) as {
      status: string;
      format: UploadFormat;
      summary: { inserted: number; duplicates: number };
    };
    expect(res.status).toBe(201);
    expect(data.status).toBe("completed");
    expect(data.format).toBe("rbc_canada");
    expect(data.summary.inserted).toBe(9);
    expect(data.summary.duplicates).toBe(0);
  });

  it("POST /api/uploads — uploads Amex Canada fixture", async () => {
    const amexLabel = trackAccount(uniqueLabel("Uploads Amex"));
    const res = await uploadFixture("amex.csv", "amex_canada", amexLabel);
    const data = (await res.json()) as {
      status: string;
      format: UploadFormat;
      summary: { inserted: number; duplicates: number };
    };
    expect(res.status).toBe(201);
    expect(data.status).toBe("completed");
    expect(data.format).toBe("amex_canada");
    expect(data.summary.inserted).toBe(7);
    expect(data.summary.duplicates).toBe(0);
  });

  it("POST /api/uploads — uploads CIBC fixture", async () => {
    const cibcLabel = trackAccount(uniqueLabel("Uploads CIBC"));
    const res = await uploadFixture("cibc.csv", "cibc_canada", cibcLabel);
    const data = (await res.json()) as {
      status: string;
      format: UploadFormat;
      summary: { inserted: number; duplicates: number };
    };
    expect(res.status).toBe(201);
    expect(data.status).toBe("completed");
    expect(data.format).toBe("cibc_canada");
    expect(data.summary.inserted).toBe(8);
    expect(data.summary.duplicates).toBe(0);
  });

  it("POST /api/uploads — rejects missing accountLabel for institution formats", async () => {
    const res = await uploadRaw(readFixture("td.csv"), "td.csv", "td_canada");
    const data = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /api/uploads — rejects missing format", async () => {
    const form = new FormData();
    form.append(
      "file",
      new Blob([readFixture("td.csv")], { type: "text/csv" }),
      "td.csv",
    );
    const res = await fetch(`${API}/uploads`, { method: "POST", body: form });
    const data = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /api/uploads — rejects wrong file extension for selected format", async () => {
    const res = await uploadRaw(
      readFixture("generic.json"),
      "wrong.json",
      "generic_csv",
    );
    const data = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /api/uploads — duplicate review response includes format", async () => {
    const chequingLabel = trackAccount(uniqueLabel("Uploads Review Format"));
    await seedCsvRows([
      {
        date: "2025-03-01",
        description: "Grocery Store",
        amount: "-82.5",
        account: chequingLabel,
      },
      {
        date: "2025-03-15",
        description: "Internet Bill",
        amount: "-59.99",
        account: chequingLabel,
      },
    ]);
    const res = await uploadCsv(
      [
        {
          date: "2025-03-01",
          description: "Grocery Store",
          amount: "-82.5",
          account: chequingLabel,
        },
        {
          date: "2025-03-15",
          description: "Internet Bill",
          amount: "-59.99",
          account: chequingLabel,
        },
      ],
      "march3.csv",
    );
    const data = (await res.json()) as {
      status: string;
      format: UploadFormat;
      summary: { inserted: number; duplicates: number };
      transactions: Array<{ duplicate: boolean }>;
    };
    expect(res.status).toBe(200);
    expect(data.status).toBe("needs_review");
    expect(data.format).toBe("generic_csv");
    expect(data.summary.duplicates).toBe(2);
  });
});

// ── transactions ──────────────────────────────────────────────────────────────

describe("Transactions", () => {
  let accountId: string;
  let accountLabel: string;
  let transactionId: string;

  beforeEach(async () => {
    accountLabel = trackAccount(uniqueLabel("Transactions Test"));
    await seedCsvRows([
      {
        date: "2025-03-01",
        description: "Grocery Store",
        amount: "-82.5",
        account: accountLabel,
      },
      {
        date: "2025-03-05",
        description: "Payroll Deposit",
        amount: "3200.0",
        account: accountLabel,
      },
      {
        date: "2025-03-10",
        description: "Coffee Shop",
        amount: "-6.75",
        account: accountLabel,
      },
    ]);
    accountId = await getAccountId(accountLabel);
    const rows = await getTransactionsForAccount(accountId);
    transactionId = rows[0]!.id;
  });

  it("GET /api/transactions — defaults to date ascending", async () => {
    const { status, data } = await json<{
      data: Array<{ id: string; date: string }>;
      total: number;
      page: number;
      limit: number;
    }>("GET", `/transactions?accountIds=${accountId}`);

    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(typeof data.total).toBe("number");
    expect(data.page).toBe(1);
    expect(data.limit).toBe(50);
    expect(data.data.map((row) => row.date)).toEqual([
      "2025-03-01",
      "2025-03-05",
      "2025-03-10",
    ]);
    transactionId = data.data[0]!.id;
  });

  it("GET /api/transactions — sorts by amount, description, and account", async () => {
    const sortToken = `Sort Account ${crypto.randomUUID().slice(0, 8)}`;
    const accountLabelLow = trackAccount(
      uniqueLabel("0 Transactions Sort Low"),
    );
    const accountLabelHigh = trackAccount(
      uniqueLabel("Z Transactions Sort High"),
    );
    await seedCsvRows([
      {
        date: "2025-03-02",
        description: `${sortToken} Low Store`,
        amount: "-10.0",
        account: accountLabelLow,
      },
      {
        date: "2025-03-03",
        description: `${sortToken} High Store`,
        amount: "-11.0",
        account: accountLabelHigh,
      },
    ]);

    const amountAsc = await json<{ data: Array<{ amount: number }> }>(
      "GET",
      `/transactions?accountIds=${accountId}&sort=amount&order=asc`,
    );
    expect(amountAsc.status).toBe(200);
    expect(amountAsc.data.data.map((row) => row.amount)).toEqual([
      -82.5, -6.75, 3200,
    ]);

    const descriptionAsc = await json<{ data: Array<{ description: string }> }>(
      "GET",
      `/transactions?accountIds=${accountId}&sort=description&order=asc`,
    );
    expect(descriptionAsc.status).toBe(200);
    expect(descriptionAsc.data.data.map((row) => row.description)).toEqual([
      "Coffee Shop",
      "Grocery Store",
      "Payroll Deposit",
    ]);

    const accountAsc = await json<{
      data: Array<{ accountLabel: string }>;
    }>("GET", `/transactions?accountIds=${accountId}&sort=account&order=asc`);
    expect(accountAsc.status).toBe(200);
    expect(accountAsc.data.data.map((row) => row.accountLabel)).toEqual(
      Array(accountAsc.data.data.length).fill(accountLabel),
    );

    const combinedAccounts = await json<{
      data: Array<{ accountLabel: string }>;
    }>(
      "GET",
      `/transactions?q=${encodeURIComponent(sortToken)}&sort=account&order=asc&limit=10`,
    );
    expect(combinedAccounts.status).toBe(200);
    expect(combinedAccounts.data.data.map((row) => row.accountLabel)).toEqual([
      accountLabelLow,
      accountLabelHigh,
    ]);
    expect(combinedAccounts.data.data[0]!.accountLabel).toBe(accountLabelLow);
    expect(
      combinedAccounts.data.data[combinedAccounts.data.data.length - 1]!
        .accountLabel,
    ).toBe(accountLabelHigh);
  });

  it("GET /api/transactions — filters by amount range", async () => {
    const bounded = await json<{ data: Array<{ amount: number }> }>(
      "GET",
      `/transactions?accountIds=${accountId}&amountMin=-20&amountMax=0`,
    );
    expect(bounded.status).toBe(200);
    expect(bounded.data.data.map((row) => row.amount)).toEqual([-6.75]);

    const minOnly = await json<{ data: Array<{ amount: number }> }>(
      "GET",
      `/transactions?accountIds=${accountId}&amountMin=0`,
    );
    expect(minOnly.status).toBe(200);
    expect(minOnly.data.data.map((row) => row.amount)).toEqual([3200]);

    const maxOnly = await json<{ data: Array<{ amount: number }> }>(
      "GET",
      `/transactions?accountIds=${accountId}&amountMax=-20`,
    );
    expect(maxOnly.status).toBe(200);
    expect(maxOnly.data.data.map((row) => row.amount)).toEqual([-82.5]);
  });

  it("GET /api/transactions — filters by accountIds", async () => {
    const { status, data } = await json<{ data: Array<{ accountId: string }> }>(
      "GET",
      `/transactions?accountIds=${accountId}`,
    );
    expect(status).toBe(200);
    for (const txn of data.data) {
      expect(txn.accountId).toBe(accountId);
    }
  });

  it("GET /api/transactions — filters by multiple accountIds", async () => {
    const otherAccountLabel = trackAccount(
      uniqueLabel("Transactions Filter Secondary"),
    );
    await seedCsvRows([
      {
        date: "2025-03-04",
        description: "Secondary Grocery",
        amount: "-14.25",
        account: otherAccountLabel,
      },
      {
        date: "2025-03-06",
        description: "Secondary Salary",
        amount: "1250.0",
        account: otherAccountLabel,
      },
    ]);
    const otherAccountId = await getAccountId(otherAccountLabel);

    const combined = await json<{
      data: Array<{ accountId: string }>;
      total: number;
    }>("GET", `/transactions?accountIds=${accountId},${otherAccountId}`);
    expect(combined.status).toBe(200);
    expect(combined.data.total).toBe(5);
    expect(combined.data.data).toHaveLength(5);
    expect(new Set(combined.data.data.map((txn) => txn.accountId))).toEqual(
      new Set([accountId, otherAccountId]),
    );
  });

  it("GET /api/transactions — filters by a single accountIds value", async () => {
    const singleAccountIds = await json<{
      data: Array<{ accountId: string }>;
    }>("GET", `/transactions?accountIds=${accountId}`);
    expect(singleAccountIds.status).toBe(200);
    expect(singleAccountIds.data.data).toHaveLength(3);
    for (const txn of singleAccountIds.data.data) {
      expect(txn.accountId).toBe(accountId);
    }
  });

  it("GET /api/transactions — rejects invalid accountIds uuid", async () => {
    const { status, data } = await json<{ error: { code: string } }>(
      "GET",
      "/transactions?accountIds=not-a-uuid",
    );
    expect(status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /api/transactions — filters by date range", async () => {
    const { status, data } = await json<{ data: Array<{ date: string }> }>(
      "GET",
      `/transactions?accountIds=${accountId}&dateFrom=2025-03-01&dateTo=2025-03-31`,
    );
    expect(status).toBe(200);
    for (const txn of data.data) {
      expect(txn.date >= "2025-03-01").toBe(true);
      expect(txn.date <= "2025-03-31").toBe(true);
    }
  });

  it("GET /api/transactions — filters by type=expense", async () => {
    const { status, data } = await json<{ data: Array<{ amount: number }> }>(
      "GET",
      `/transactions?accountIds=${accountId}&type=expense`,
    );
    expect(status).toBe(200);
    for (const txn of data.data) {
      expect(txn.amount).toBeLessThan(0);
    }
  });

  it("GET /api/transactions — filters by type=income", async () => {
    const { status, data } = await json<{ data: Array<{ amount: number }> }>(
      "GET",
      `/transactions?accountIds=${accountId}&type=income`,
    );
    expect(status).toBe(200);
    for (const txn of data.data) {
      expect(txn.amount).toBeGreaterThan(0);
    }
  });

  it("GET /api/transactions — full-text search via q param", async () => {
    const { status, data } = await json<{
      data: Array<{ description: string }>;
      // Also filter by account ID to only fetch transactions uploaded in this test.
    }>("GET", `/transactions?q=Grocery&accountIds=${accountId}`);
    expect(status).toBe(200);
    expect(data.data.length).toBeGreaterThan(0);
    for (const txn of data.data) {
      expect(txn.description.toLowerCase()).toContain("grocery");
    }
  });

  it("GET /api/transactions — rejects invalid limit", async () => {
    const { status, data } = await json<{ error: { code: string } }>(
      "GET",
      "/transactions?limit=999",
    );
    expect(status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /api/transactions — keeps pagination stable with repeated sort values", async () => {
    const stableAccountLabel = trackAccount(uniqueLabel("Transactions Stable"));
    const stableRows = Array.from({ length: 30 }, (_, index) => ({
      date: "2025-04-01",
      description: `Stable Row ${String(index + 1).padStart(2, "0")}`,
      amount: -1,
      account: stableAccountLabel,
    }));
    await seedCsvRows(stableRows);

    const first = await json<{ data: Array<{ id: string }> }>(
      "GET",
      `/transactions?sort=date&order=asc&limit=10`,
    );
    const second = await json<{ data: Array<{ id: string }> }>(
      "GET",
      `/transactions?sort=date&order=asc&limit=10&page=2`,
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.data.data.map((row) => row.id)).not.toEqual(
      second.data.data.map((row) => row.id),
    );
    const overlap = first.data.data.filter((row) =>
      second.data.data.some((other) => other.id === row.id),
    );
    expect(overlap).toHaveLength(0);
  });

  it("GET /api/transactions/:id — returns single transaction with tags", async () => {
    const { status, data } = await json<{
      id: string;
      description: string;
      amount: number;
      tags: string[];
    }>("GET", `/transactions/${transactionId}`);

    expect(status).toBe(200);
    expect(data.id).toBe(transactionId);
    expect(Array.isArray(data.tags)).toBe(true);
  });

  it("GET /api/transactions/:id — 404 for unknown id", async () => {
    const { status, data } = await json<{ error: { code: string } }>(
      "GET",
      "/transactions/00000000-0000-0000-0000-000000000999",
    );
    expect(status).toBe(404);
    expect(data.error.code).toBe("NOT_FOUND");
  });

  it("PATCH /api/transactions/:id — updates description", async () => {
    const { status, data } = await json<{ id: string; description: string }>(
      "PATCH",
      `/transactions/${transactionId}`,
      { description: "Updated Description" },
    );
    expect(status).toBe(200);
    expect(data.description).toBe("Updated Description");
  });
});

// ── tags ──────────────────────────────────────────────────────────────────────

describe("Tags", () => {
  it("POST /api/tags — creates a tag", async () => {
    const tagName = trackTag(uniqueLabel("groceries"));
    const { status, data } = await json<{ id: string; name: string }>(
      "POST",
      "/tags",
      { name: tagName },
    );
    expect(status).toBe(201);
    expect(data.id).toBeTruthy();
    expect(data.name).toBe(tagName);
  });

  it("POST /api/tags — rejects duplicate name", async () => {
    const tagName = trackTag(uniqueLabel("groceries"));
    await json<{ id: string; name: string }>("POST", "/tags", {
      name: tagName,
    });
    const { status, data } = await json<{ error: { code: string } }>(
      "POST",
      "/tags",
      { name: tagName },
    );
    expect(status).toBe(409);
    expect(data.error.code).toBe("CONFLICT");
  });

  it("POST /api/tags — rejects empty name", async () => {
    const { status, data } = await json<{ error: { code: string } }>(
      "POST",
      "/tags",
      { name: "" },
    );
    expect(status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /api/tags — lists tags including the created one", async () => {
    const tagName = trackTag(uniqueLabel("groceries"));
    await json<{ id: string; name: string }>("POST", "/tags", {
      name: tagName,
    });
    const { status, data } = await json<Array<{ id: string; name: string }>>(
      "GET",
      "/tags",
    );
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    const names = data.map((t) => t.name);
    expect(names).toContain(tagName);
  });
});

// ── bulk-tag ──────────────────────────────────────────────────────────────────

describe("Transactions — bulk tag", () => {
  let transactionId: string;
  let tagName: string;

  beforeEach(async () => {
    const accountLabel = trackAccount(uniqueLabel("Bulk Tag Test"));
    tagName = trackTag(uniqueLabel("bulk-test-groceries"));
    await seedCsvRows([
      {
        date: "2025-04-01",
        description: "Grocery Store",
        amount: "-50.0",
        account: accountLabel,
      },
    ]);
    const accountId = await getAccountId(accountLabel);
    const rows = await getTransactionsForAccount(accountId);
    transactionId = rows[0]!.id;
    const tag = await json<{ id: string }>("POST", "/tags", { name: tagName });
    expect(tag.data.id).toBeTruthy();
  });

  it("POST /api/transactions/bulk-tag — adds tags", async () => {
    const { status, data } = await json<{ updated: number }>(
      "POST",
      "/transactions/bulk-tag",
      {
        transactionIds: [transactionId],
        tagNames: [tagName],
        action: "add",
      },
    );
    expect(status).toBe(200);
    expect(data.updated).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/transactions/:id — has tag after bulk-tag", async () => {
    await json("POST", "/transactions/bulk-tag", {
      transactionIds: [transactionId],
      tagNames: [tagName],
      action: "add",
    });
    const { data } = await json<{ tags: string[] }>(
      "GET",
      `/transactions/${transactionId}`,
    );
    expect(data.tags).toContain(tagName);
  });

  it("POST /api/transactions/bulk-tag — removes tags", async () => {
    await json("POST", "/transactions/bulk-tag", {
      transactionIds: [transactionId],
      tagNames: [tagName],
      action: "add",
    });
    const { status, data } = await json<{ updated: number }>(
      "POST",
      "/transactions/bulk-tag",
      {
        transactionIds: [transactionId],
        tagNames: [tagName],
        action: "remove",
      },
    );
    expect(status).toBe(200);
    expect(data.updated).toBeGreaterThanOrEqual(0);
  });

  it("POST /api/transactions/bulk-tag — creates unknown tags on add", async () => {
    const unknownTag = trackTag(uniqueLabel("new-auto-created-tag"));
    const { status } = await json("POST", "/transactions/bulk-tag", {
      transactionIds: [transactionId],
      tagNames: [unknownTag],
      action: "add",
    });
    expect(status).toBe(200);
  });

  it("POST /api/transactions/bulk-tag — rejects empty transactionIds", async () => {
    const { status, data } = await json<{ error: { code: string } }>(
      "POST",
      "/transactions/bulk-tag",
      { transactionIds: [], tagNames: [tagName], action: "add" },
    );
    expect(status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /api/transactions/bulk-tag — rejects invalid action", async () => {
    const { status, data } = await json<{ error: { code: string } }>(
      "POST",
      "/transactions/bulk-tag",
      {
        transactionIds: [transactionId],
        tagNames: [tagName],
        action: "replace",
      },
    );
    expect(status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });
});

// ── bulk-delete ──────────────────────────────────────────────────────────────

describe("Transactions — bulk delete", () => {
  let accountId: string;
  let transactionIds: string[] = [];

  beforeEach(async () => {
    const accountLabel = trackAccount(uniqueLabel("Bulk Delete Test"));
    await seedCsvRows([
      {
        date: "2025-05-01",
        description: "Delete Me 1",
        amount: "-10.0",
        account: accountLabel,
      },
      {
        date: "2025-05-02",
        description: "Delete Me 2",
        amount: "-20.0",
        account: accountLabel,
      },
    ]);
    accountId = await getAccountId(accountLabel);
    const rows = await getTransactionsForAccount(accountId);
    transactionIds = rows.map((t) => t.id);
  });

  it("POST /api/transactions/bulk-delete — deletes multiple transactions", async () => {
    const { status, data } = await json<{ deleted: number }>(
      "POST",
      "/transactions/bulk-delete",
      { transactionIds },
    );
    expect(status).toBe(200);
    expect(data.deleted).toBe(transactionIds.length);
  });

  it("GET /api/transactions — no longer returns deleted rows", async () => {
    const { status } = await json<{ deleted: number }>(
      "POST",
      "/transactions/bulk-delete",
      { transactionIds },
    );
    expect(status).toBe(200);

    const { data } = await json<{ data: Array<{ id: string }> }>(
      "GET",
      `/transactions?accountIds=${accountId}`,
    );
    expect(data.data).toHaveLength(0);
  });

  it("POST /api/transactions/bulk-delete — rejects missing ids without deleting anything", async () => {
    const accountLabel2 = trackAccount(uniqueLabel("Bulk Delete Safety"));
    await seedCsvRows([
      {
        date: "2025-05-03",
        description: "Keep Me",
        amount: "-30.0",
        account: accountLabel2,
      },
    ]);
    const safeAccountId = await getAccountId(accountLabel2);
    const { data: txResult } = await json<{ data: Array<{ id: string }> }>(
      "GET",
      `/transactions?accountIds=${safeAccountId}`,
    );
    const keepId = txResult.data[0]!.id;
    const beforeCount = txResult.data.length;

    const { status, data } = await json<{ error: { code: string } }>(
      "POST",
      "/transactions/bulk-delete",
      { transactionIds: [keepId, "11111111-1111-4111-8111-111111111111"] },
    );

    expect(status).toBe(404);
    expect(data.error.code).toBe("NOT_FOUND");

    const after = await json<{ data: Array<{ id: string }> }>(
      "GET",
      `/transactions?accountIds=${safeAccountId}`,
    );
    expect(after.data.data).toHaveLength(beforeCount);
  });
});

// ── auto-tag rules ────────────────────────────────────────────────────────────

describe("Auto-tag rules", () => {
  let tagId: string;
  beforeEach(async () => {
    const accountLabel = trackAccount(uniqueLabel("Rules Test"));
    await seedCsvRows([
      {
        date: "2025-04-01",
        description: "Grocery Store",
        amount: "-50.0",
        account: accountLabel,
      },
      {
        date: "2025-04-02",
        description: "Coffee Shop",
        amount: "-5.0",
        account: accountLabel,
      },
    ]);
    const tagName = trackTag(uniqueLabel("rules-test-groceries"));
    const tag = await json<{ id: string }>("POST", "/tags", { name: tagName });
    tagId = tag.data.id;
  });

  it("POST /api/rules — creates a rule", async () => {
    const { status, data } = await json<{ id: string }>("POST", "/rules", {
      tagId,
      conditions: [
        {
          matchField: "description",
          matchType: "contains",
          matchValue: "Grocery",
        },
      ],
    });
    expect(status).toBe(201);
    expect(data.id).toBeTruthy();
    trackRule(data.id);
  });

  it("POST /api/rules — rejects rule with no conditions", async () => {
    const { status, data } = await json<{ error: { code: string } }>(
      "POST",
      "/rules",
      { tagId, conditions: [] },
    );
    expect(status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /api/rules — rejects invalid matchField", async () => {
    const { status, data } = await json<{ error: { code: string } }>(
      "POST",
      "/rules",
      {
        tagId,
        conditions: [
          { matchField: "memo", matchType: "contains", matchValue: "Grocery" },
        ],
      },
    );
    expect(status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /api/rules — lists rules including the created one", async () => {
    const created = await json<{ id: string }>("POST", "/rules", {
      tagId,
      conditions: [
        {
          matchField: "description",
          matchType: "contains",
          matchValue: "Grocery",
        },
      ],
    });
    trackRule(created.data.id);

    const { status, data } = await json<Array<{ id: string }>>("GET", "/rules");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.map((r) => r.id)).toContain(created.data.id);
  });

  it("PUT /api/rules/:id — updates a rule", async () => {
    const created = await json<{ id: string }>("POST", "/rules", {
      tagId,
      conditions: [
        {
          matchField: "description",
          matchType: "contains",
          matchValue: "Grocery",
        },
      ],
    });
    trackRule(created.data.id);

    const { status, data } = await json<{ id: string }>(
      "PUT",
      `/rules/${created.data.id}`,
      {
        tagId,
        conditions: [
          {
            matchField: "description",
            matchType: "contains",
            matchValue: "Grocery",
          },
          { matchField: "amount", matchType: "lt", matchValue: "0" },
        ],
      },
    );
    expect(status).toBe(200);
    expect(data.id).toBe(created.data.id);
  });

  it("POST /api/rules/:id/apply — applies rule retroactively", async () => {
    const created = await json<{ id: string }>("POST", "/rules", {
      tagId,
      conditions: [
        {
          matchField: "description",
          matchType: "contains",
          matchValue: "Grocery",
        },
      ],
    });
    trackRule(created.data.id);

    const { status, data } = await json<{ matched: number; tagged: number }>(
      "POST",
      `/rules/${created.data.id}/apply`,
    );
    expect(status).toBe(200);
    expect(typeof data.matched).toBe("number");
    expect(typeof data.tagged).toBe("number");
    expect(data.matched).toBeGreaterThanOrEqual(data.tagged);
  });

  it("POST /api/rules/apply-all — applies all rules", async () => {
    const created = await json<{ id: string }>("POST", "/rules", {
      tagId,
      conditions: [
        {
          matchField: "description",
          matchType: "contains",
          matchValue: "Grocery",
        },
      ],
    });
    trackRule(created.data.id);

    const { status, data } = await json<{ matched: number; tagged: number }>(
      "POST",
      "/rules/apply-all",
    );
    expect(status).toBe(200);
    expect(typeof data.matched).toBe("number");
    expect(typeof data.tagged).toBe("number");
  });

  it("DELETE /api/rules/:id — deletes a rule", async () => {
    const created = await json<{ id: string }>("POST", "/rules", {
      tagId,
      conditions: [
        {
          matchField: "description",
          matchType: "contains",
          matchValue: "Grocery",
        },
      ],
    });
    trackRule(created.data.id);

    const res = await req("DELETE", `/rules/${created.data.id}`);
    expect(res.status).toBe(204);

    const { data } = await json<Array<{ id: string }>>("GET", "/rules");
    expect(data.map((r) => r.id)).not.toContain(created.data.id);
  });
});

// ── analytics ─────────────────────────────────────────────────────────────────

describe("Analytics", () => {
  let tagName: string;

  beforeEach(async () => {
    const accountLabel = trackAccount(uniqueLabel("Analytics Test"));
    await seedCsvRows([
      {
        date: "2025-03-01",
        description: "Grocery Store",
        amount: "-82.5",
        account: accountLabel,
      },
      {
        date: "2025-03-05",
        description: "Payroll Deposit",
        amount: "3200.0",
        account: accountLabel,
      },
      {
        date: "2025-03-10",
        description: "Coffee Shop",
        amount: "-6.75",
        account: accountLabel,
      },
    ]);
    const accountId = await getAccountId(accountLabel);

    tagName = trackTag(uniqueLabel("analytics-groceries"));
    const tag = await json<{ id: string }>("POST", "/tags", { name: tagName });
    expect(tag.data.id).toBeTruthy();

    const rows = await getTransactionsForAccount(accountId);
    const groceryIds = rows
      .filter((t) => t.description.includes("Grocery"))
      .map((t) => t.id);

    if (groceryIds.length > 0) {
      await json("POST", "/transactions/bulk-tag", {
        transactionIds: groceryIds,
        tagNames: [tagName],
        action: "add",
      });
    }
  });

  it("GET /api/analytics/monthly-summary — returns monthly income/expense rows", async () => {
    const { status, data } = await json<
      Array<{ month: number; income: number; expenses: number }>
    >("GET", "/analytics/monthly-summary?year=2025");

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    for (const row of data) {
      expect(row.month).toBeGreaterThanOrEqual(1);
      expect(row.month).toBeLessThanOrEqual(12);
      expect(typeof row.income).toBe("number");
      expect(typeof row.expenses).toBe("number");
    }
  });

  it("GET /api/analytics/monthly-summary — requires year param", async () => {
    const { status, data } = await json<{ error: { code: string } }>(
      "GET",
      "/analytics/monthly-summary",
    );
    expect(status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /api/analytics/category-breakdown — returns tag totals for a month", async () => {
    const { status, data } = await json<Array<{ tag: string; total: number }>>(
      "GET",
      "/analytics/category-breakdown?year=2025&month=3",
    );
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    const row = data.find((entry) => entry.tag === tagName);
    expect(row).toBeTruthy();
    expect(row!.total).toBeGreaterThan(0);
  });

  it("GET /api/analytics/trend — returns monthly amounts for a tag", async () => {
    const { status, data } = await json<
      Array<{ month: string; amount: number }>
    >("GET", `/analytics/trend?tag=${tagName}&months=6`);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(6);
    for (const row of data) {
      expect(typeof row.month).toBe("string");
      expect(typeof row.amount).toBe("number");
    }
  });

  it("GET /api/analytics/trend — requires tag param", async () => {
    const { status, data } = await json<{ error: { code: string } }>(
      "GET",
      "/analytics/trend?months=6",
    );
    expect(status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /api/analytics/top-transactions — returns top N expenses", async () => {
    const { status, data } = await json<
      Array<{ id: string; amount: number; description: string }>
    >("GET", "/analytics/top-transactions?n=5&type=expense");

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < data.length; i++) {
      expect(Math.abs(data[i - 1]!.amount)).toBeGreaterThanOrEqual(
        Math.abs(data[i]!.amount),
      );
    }
  });

  it("GET /api/analytics/top-transactions — returns top N income", async () => {
    const { status, data } = await json<Array<{ amount: number }>>(
      "GET",
      "/analytics/top-transactions?n=3&type=income",
    );
    expect(status).toBe(200);
    for (const row of data) {
      expect(row.amount).toBeGreaterThan(0);
    }
  });
});

// ── error shape ───────────────────────────────────────────────────────────────

describe("Error response shape", () => {
  it("404 responses include error.code = NOT_FOUND", async () => {
    const { status, data } = await json<{
      error: { code: string; message: string };
    }>("GET", "/transactions/00000000-0000-0000-0000-000000000000");
    expect(status).toBe(404);
    expect(data.error.code).toBe("NOT_FOUND");
    expect(typeof data.error.message).toBe("string");
  });

  it("unknown routes return 404", async () => {
    const res = await req("GET", "/does-not-exist");
    expect(res.status).toBe(404);
  });
});
