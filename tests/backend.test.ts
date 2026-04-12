/**
 * E2E tests for the Financial Tracker backend API.
 * Requires the backend to be running at BACKEND_URL (default: http://localhost:3000).
 * Each describe block is self-contained: beforeAll creates required data,
 * afterAll tears it down.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

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
  amount: string;
  account: string;
};

/** Build a minimal well-formed CSV for upload tests. Dates must be yyyy-mm-dd. */
function makeCsv(rows: CsvRow[]) {
  const header = "date,description,amount,currency,account";
  const lines = rows.map(
    (r) => `${r.date},${r.description},${r.amount},CAD,${r.account}`,
  );
  return [header, ...lines].join("\n");
}

async function uploadCsv(
  rows: CsvRow[],
  filename = "test.csv",
): Promise<Response> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([makeCsv(rows)], { type: "text/csv" }),
    filename,
  );
  return fetch(`${API}/uploads`, { method: "POST", body: form });
}

async function uploadCsvOk(
  rows: CsvRow[],
  filename = "test.csv",
): Promise<{ inserted: number; duplicatesSkipped: number }> {
  const res = await uploadCsv(rows, filename);
  return res.json();
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

// ── accounts ─────────────────────────────────────────────────────────────────

describe("Accounts", () => {
  const accountLabel = "Accounts Test — Chequing";

  afterAll(async () => {
    await deleteAccountByLabel(accountLabel);
  });

  it("POST /api/accounts — not supported (returns 404)", async () => {
    const { status } = await json("POST", "/accounts", { label: accountLabel });
    expect(status).toBe(404);
  });

  it("POST /api/uploads — automatically creates account", async () => {
    const data = await uploadCsvOk([
      {
        date: "2025-03-01",
        description: "Grocery Store",
        amount: "-82.5",
        account: accountLabel,
      },
    ]);
    expect(data.inserted).toBe(1);
  });

  it("GET /api/accounts — lists auto-created accounts", async () => {
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
  const chequingLabel = "Uploads Test — Chequing";
  const visaLabel = "Uploads Test — Visa";
  const savingsLabel = "Uploads Test — Savings";
  const someAccountLabel = "Some Account";

  afterAll(async () => {
    for (const label of [
      chequingLabel,
      visaLabel,
      savingsLabel,
      someAccountLabel,
    ]) {
      await deleteAccountByLabel(label);
    }
  });

  it("POST /api/uploads — inserts transactions and creates accounts automatically", async () => {
    const data = await uploadCsvOk(
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
    expect(data.inserted).toBe(3);
    expect(data.duplicatesSkipped).toBe(0);

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
    const data = await uploadCsvOk(
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
    expect(data.inserted).toBe(1); // only the new one
    expect(data.duplicatesSkipped).toBe(1);
  });

  it("POST /api/uploads — merging: reuses existing accounts, creates only new ones", async () => {
    // chequingLabel and visaLabel already exist; savingsLabel does not
    const data = await uploadCsvOk(
      [
        {
          date: "2025-04-01",
          description: "Existing Account Txn",
          amount: "-20.0",
          account: chequingLabel,
        },
        {
          date: "2025-04-01",
          description: "New Account Txn",
          amount: "500.0",
          account: savingsLabel,
        },
      ],
      "mixed.csv",
    );
    expect(data.inserted).toBe(2);

    // Exactly 3 test accounts — no duplicate account created for chequingLabel
    const { data: accounts } = await json<Array<{ label: string }>>(
      "GET",
      "/accounts",
    );
    const testAccounts = accounts.filter((a) =>
      [chequingLabel, visaLabel, savingsLabel].includes(a.label),
    );
    expect(testAccounts.length).toBe(3);
  });

  it("POST /api/uploads — rejects non-CAD currency", async () => {
    const csv = `date,description,amount,currency,account\n2025-03-01,Something,-10.00,USD,${someAccountLabel}`;
    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "usd.csv");
    const res = await fetch(`${API}/uploads`, { method: "POST", body: form });
    const data = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(422);
    expect(data.error.code).toBe("UNSUPPORTED_CURRENCY");
  });

  it("POST /api/uploads — rejects CSV with wrong date format (yyyy/mm/dd)", async () => {
    const res = await uploadCsv(
      [
        {
          date: "2025/03/01", // wrong format — must be yyyy-mm-dd
          description: "Something",
          amount: "-10.0",
          account: "Some Account",
        },
      ],
      "bad-date.csv",
    );
    const data = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /api/uploads — rejects JSON with wrong date format (yyyy/mm/dd)", async () => {
    const jsonBody = JSON.stringify([
      {
        date: "2025/03/01", // wrong format — must be yyyy-mm-dd
        description: "Something",
        amount: -10.0,
        currency: "CAD",
        account: "Some Account",
      },
    ]);
    const form = new FormData();
    form.append(
      "file",
      new Blob([jsonBody], { type: "application/json" }),
      "bad-date.json",
    );
    const res = await fetch(`${API}/uploads`, { method: "POST", body: form });
    const data = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /api/uploads — accepts valid JSON upload", async () => {
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
    const res = await fetch(`${API}/uploads`, { method: "POST", body: form });
    const data = (await res.json()) as { inserted: number };
    expect(res.status).toBe(201);
    expect(data.inserted).toBe(1);
  });
});

// ── transactions ──────────────────────────────────────────────────────────────

describe("Transactions", () => {
  const accountLabel = "Transactions Test";
  let accountId: string;
  let transactionId: string;

  beforeAll(async () => {
    await uploadCsvOk([
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
  });

  afterAll(async () => {
    if (accountId) await req("DELETE", `/accounts/${accountId}`);
  });

  it("GET /api/transactions — returns paginated list", async () => {
    const { status, data } = await json<{
      data: Array<{ id: string }>;
      total: number;
      page: number;
      limit: number;
    }>("GET", "/transactions");

    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(typeof data.total).toBe("number");
    expect(data.page).toBe(1);
    expect(data.limit).toBe(50);
    transactionId = data.data[0]!.id;
  });

  it("GET /api/transactions — filters by accountId", async () => {
    const { status, data } = await json<{ data: Array<{ accountId: string }> }>(
      "GET",
      `/transactions?accountId=${accountId}`,
    );
    expect(status).toBe(200);
    for (const txn of data.data) {
      expect(txn.accountId).toBe(accountId);
    }
  });

  it("GET /api/transactions — filters by date range", async () => {
    const { status, data } = await json<{ data: Array<{ date: string }> }>(
      "GET",
      "/transactions?dateFrom=2025-03-01&dateTo=2025-03-31",
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
      "/transactions?type=expense",
    );
    expect(status).toBe(200);
    for (const txn of data.data) {
      expect(txn.amount).toBeLessThan(0);
    }
  });

  it("GET /api/transactions — filters by type=income", async () => {
    const { status, data } = await json<{ data: Array<{ amount: number }> }>(
      "GET",
      "/transactions?type=income",
    );
    expect(status).toBe(200);
    for (const txn of data.data) {
      expect(txn.amount).toBeGreaterThan(0);
    }
  });

  it("GET /api/transactions — full-text search via q param", async () => {
    const { status, data } = await json<{
      data: Array<{ description: string }>;
    }>("GET", "/transactions?q=Grocery");
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
  let tagId: string;

  afterAll(async () => {
    if (tagId) await req("DELETE", `/tags/${tagId}`);
  });

  it("POST /api/tags — creates a tag", async () => {
    const { status, data } = await json<{ id: string; name: string }>(
      "POST",
      "/tags",
      { name: "groceries" },
    );
    expect(status).toBe(201);
    expect(data.id).toBeTruthy();
    expect(data.name).toBe("groceries");
    tagId = data.id;
  });

  it("POST /api/tags — rejects duplicate name", async () => {
    const { status, data } = await json<{ error: { code: string } }>(
      "POST",
      "/tags",
      { name: "groceries" },
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
    const { status, data } = await json<Array<{ id: string; name: string }>>(
      "GET",
      "/tags",
    );
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    const names = data.map((t) => t.name);
    expect(names).toContain("groceries");
  });
});

// ── bulk-tag ──────────────────────────────────────────────────────────────────

describe("Transactions — bulk tag", () => {
  const accountLabel = "Bulk Tag Test";
  let accountId: string;
  let tagId: string;
  let transactionId: string;
  const tagName = "bulk-test-groceries";

  beforeAll(async () => {
    await uploadCsvOk([
      {
        date: "2025-04-01",
        description: "Grocery Store",
        amount: "-50.0",
        account: accountLabel,
      },
    ]);
    accountId = await getAccountId(accountLabel);

    const { data: txResult } = await json<{ data: Array<{ id: string }> }>(
      "GET",
      `/transactions?accountId=${accountId}`,
    );
    transactionId = txResult.data[0]!.id;

    const tag = await json<{ id: string }>("POST", "/tags", { name: tagName });
    tagId = tag.data.id;
  });

  afterAll(async () => {
    // Clean up any auto-created tags from the "creates unknown tags" test
    const { data: tagsData } = await json<Array<{ id: string; name: string }>>(
      "GET",
      "/tags",
    );
    const autoTag = tagsData.find((t) => t.name === "new-auto-created-tag");
    if (autoTag) await req("DELETE", `/tags/${autoTag.id}`);

    if (tagId) await req("DELETE", `/tags/${tagId}`);
    if (accountId) await req("DELETE", `/accounts/${accountId}`);
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
    const { data } = await json<{ tags: string[] }>(
      "GET",
      `/transactions/${transactionId}`,
    );
    expect(data.tags).toContain(tagName);
  });

  it("POST /api/transactions/bulk-tag — removes tags", async () => {
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
    const { status } = await json("POST", "/transactions/bulk-tag", {
      transactionIds: [transactionId],
      tagNames: ["new-auto-created-tag"],
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

// ── auto-tag rules ────────────────────────────────────────────────────────────

describe("Auto-tag rules", () => {
  const accountLabel = "Rules Test";
  let accountId: string;
  let tagId: string;
  let ruleId: string;

  beforeAll(async () => {
    await uploadCsvOk([
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
    accountId = await getAccountId(accountLabel);

    const tag = await json<{ id: string }>("POST", "/tags", {
      name: "rules-test-groceries",
    });
    tagId = tag.data.id;
  });

  afterAll(async () => {
    if (ruleId) await req("DELETE", `/rules/${ruleId}`); // no-op if already deleted by test
    if (tagId) await req("DELETE", `/tags/${tagId}`);
    if (accountId) await req("DELETE", `/accounts/${accountId}`);
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
    ruleId = data.id;
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
    const { status, data } = await json<Array<{ id: string }>>("GET", "/rules");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.map((r) => r.id)).toContain(ruleId);
  });

  it("PUT /api/rules/:id — updates a rule", async () => {
    const { status, data } = await json<{ id: string }>(
      "PUT",
      `/rules/${ruleId}`,
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
    expect(data.id).toBe(ruleId);
  });

  it("POST /api/rules/:id/apply — applies rule retroactively", async () => {
    const { status, data } = await json<{ matched: number; tagged: number }>(
      "POST",
      `/rules/${ruleId}/apply`,
    );
    expect(status).toBe(200);
    expect(typeof data.matched).toBe("number");
    expect(typeof data.tagged).toBe("number");
    expect(data.matched).toBeGreaterThanOrEqual(data.tagged);
  });

  it("POST /api/rules/apply-all — applies all rules", async () => {
    const { status, data } = await json<{ matched: number; tagged: number }>(
      "POST",
      "/rules/apply-all",
    );
    expect(status).toBe(200);
    expect(typeof data.matched).toBe("number");
  });

  it("DELETE /api/rules/:id — deletes a rule", async () => {
    const res = await req("DELETE", `/rules/${ruleId}`);
    expect(res.status).toBe(204);
  });

  it("GET /api/rules — deleted rule no longer appears", async () => {
    const { data } = await json<Array<{ id: string }>>("GET", "/rules");
    expect(data.map((r) => r.id)).not.toContain(ruleId);
  });
});

// ── analytics ─────────────────────────────────────────────────────────────────

describe("Analytics", () => {
  const accountLabel = "Analytics Test";
  let accountId: string;
  let tagId: string;
  const tagName = "analytics-groceries";

  beforeAll(async () => {
    await uploadCsvOk([
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

    const tag = await json<{ id: string }>("POST", "/tags", { name: tagName });
    tagId = tag.data.id;

    const { data: txResult } = await json<{
      data: Array<{ id: string; description: string }>;
    }>("GET", `/transactions?accountId=${accountId}`);
    const groceryIds = txResult.data
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

  afterAll(async () => {
    if (tagId) await req("DELETE", `/tags/${tagId}`);
    if (accountId) await req("DELETE", `/accounts/${accountId}`);
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
    for (const row of data) {
      expect(typeof row.tag).toBe("string");
      expect(row.total).toBeGreaterThan(0);
    }
  });

  it("GET /api/analytics/trend — returns monthly amounts for a tag", async () => {
    const { status, data } = await json<
      Array<{ month: string; amount: number }>
    >("GET", `/analytics/trend?tag=${tagName}&months=6`);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(6);
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
    // should be sorted by absolute amount descending
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
