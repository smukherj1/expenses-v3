/**
 * E2E tests for the Financial Tracker backend API.
 * Requires the backend to be running at BACKEND_URL (default: http://localhost:3000).
 * These tests are stateful and run sequentially — each describe block may depend on
 * state created by earlier blocks.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

const BASE_URL = process.env.BACKEND_URL ?? "http://localhost:3000";
const API = `${BASE_URL}/api`;

// IDs shared across test sections, populated as resources are created.
let accountId: string;
let secondAccountId: string;
let uploadId: string;
let transactionId: string;
let tagId: string;
let ruleId: string;

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

/** Build a minimal well-formed CSV for upload tests. */
function makeCsv(
  rows: { date: string; description: string; amount: number }[],
) {
  const header = "date,description,amount,currency";
  const lines = rows.map((r) => `${r.date},${r.description},${r.amount},CAD`);
  return [header, ...lines].join("\n");
}

// ── accounts ─────────────────────────────────────────────────────────────────

describe("Accounts", () => {
  it("POST /api/accounts — creates an account", async () => {
    const { status, data } = await json<{ id: string; label: string }>(
      "POST",
      "/accounts",
      { label: "TD Chequing" },
    );
    expect(status).toBe(201);
    expect(data.id).toBeTruthy();
    expect(data.label).toBe("TD Chequing");
    accountId = data.id;
  });

  it("POST /api/accounts — creates a second account", async () => {
    const { status, data } = await json<{ id: string; label: string }>(
      "POST",
      "/accounts",
      { label: "Visa Card" },
    );
    expect(status).toBe(201);
    secondAccountId = data.id;
  });

  it("POST /api/accounts — rejects duplicate label", async () => {
    const { status, data } = await json<{ error: { code: string } }>(
      "POST",
      "/accounts",
      { label: "TD Chequing" },
    );
    expect(status).toBe(409);
    expect(data.error.code).toBe("CONFLICT");
  });

  it("POST /api/accounts — rejects missing label", async () => {
    const { status, data } = await json<{ error: { code: string } }>(
      "POST",
      "/accounts",
      {},
    );
    expect(status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /api/accounts — lists accounts including created ones", async () => {
    const { status, data } = await json<Array<{ id: string; label: string }>>(
      "GET",
      "/accounts",
    );
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    const labels = data.map((a) => a.label);
    expect(labels).toContain("TD Chequing");
    expect(labels).toContain("Visa Card");
  });
});

// ── uploads ───────────────────────────────────────────────────────────────────

describe("Uploads", () => {
  it("POST /api/accounts/:id/upload — uploads a CSV file", async () => {
    const csv = makeCsv([
      { date: "2025-03-01", description: "Grocery Store", amount: -82.5 },
      { date: "2025-03-05", description: "Payroll Deposit", amount: 3200.0 },
      { date: "2025-03-10", description: "Coffee Shop", amount: -6.75 },
    ]);

    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "march.csv");

    const res = await fetch(`${API}/accounts/${accountId}/upload`, {
      method: "POST",
      body: form,
    });
    const data = (await res.json()) as {
      uploadId: string;
      inserted: number;
      duplicatesSkipped: number;
    };

    expect(res.status).toBe(201);
    expect(data.uploadId).toBeTruthy();
    expect(data.inserted).toBe(3);
    expect(data.duplicatesSkipped).toBe(0);
    uploadId = data.uploadId;
  });

  it("POST /api/accounts/:id/upload — skips duplicate rows on second upload", async () => {
    const csv = makeCsv([
      { date: "2025-03-01", description: "Grocery Store", amount: -82.5 },
      { date: "2025-03-15", description: "Internet Bill", amount: -59.99 },
    ]);

    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "march2.csv");

    const res = await fetch(`${API}/accounts/${accountId}/upload`, {
      method: "POST",
      body: form,
    });
    const data = (await res.json()) as {
      inserted: number;
      duplicatesSkipped: number;
    };

    expect(res.status).toBe(201);
    expect(data.inserted).toBe(1); // only the new one
    expect(data.duplicatesSkipped).toBe(1);
  });

  it("POST /api/accounts/:id/upload — rejects non-CAD currency", async () => {
    const csv =
      "date,description,amount,currency\n2025-03-01,Something,-10.00,USD";
    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "usd.csv");

    const res = await fetch(`${API}/accounts/${accountId}/upload`, {
      method: "POST",
      body: form,
    });
    const data = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(422);
    expect(data.error.code).toBe("UNSUPPORTED_CURRENCY");
  });

  it("POST /api/accounts/:id/upload — rejects upload for unknown account", async () => {
    const csv = makeCsv([
      { date: "2025-03-01", description: "Test", amount: -1 },
    ]);
    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "test.csv");

    const res = await fetch(
      `${API}/accounts/00000000-0000-0000-0000-000000000999/upload`,
      { method: "POST", body: form },
    );
    expect(res.status).toBe(404);
  });

  it("GET /api/uploads — lists uploads", async () => {
    const { status, data } = await json<
      Array<{ id: string; filename: string }>
    >("GET", "/uploads");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    const ids = data.map((u) => u.id);
    expect(ids).toContain(uploadId);
  });

  it("GET /api/uploads — filters by accountId", async () => {
    const { status, data } = await json<Array<{ id: string }>>(
      "GET",
      `/uploads?accountId=${secondAccountId}`,
    );
    expect(status).toBe(200);
    const ids = data.map((u) => u.id);
    expect(ids).not.toContain(uploadId);
  });
});

// ── transactions ──────────────────────────────────────────────────────────────

describe("Transactions", () => {
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
  it("POST /api/transactions/bulk-tag — adds tags", async () => {
    const { status, data } = await json<{ updated: number }>(
      "POST",
      "/transactions/bulk-tag",
      {
        transactionIds: [transactionId],
        tagNames: ["groceries"],
        action: "add",
      },
    );
    expect(status).toBe(200);
    expect(data.updated).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/transactions/:id — has groceries tag after bulk-tag", async () => {
    const { data } = await json<{ tags: string[] }>(
      "GET",
      `/transactions/${transactionId}`,
    );
    expect(data.tags).toContain("groceries");
  });

  it("POST /api/transactions/bulk-tag — removes tags", async () => {
    const { status, data } = await json<{ updated: number }>(
      "POST",
      "/transactions/bulk-tag",
      {
        transactionIds: [transactionId],
        tagNames: ["groceries"],
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
      { transactionIds: [], tagNames: ["groceries"], action: "add" },
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
        tagNames: ["groceries"],
        action: "replace",
      },
    );
    expect(status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });
});

// ── auto-tag rules ────────────────────────────────────────────────────────────

describe("Auto-tag rules", () => {
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
    >("GET", "/analytics/trend?tag=groceries&months=6");

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

// ── cleanup ───────────────────────────────────────────────────────────────────

describe("Cleanup", () => {
  it("DELETE /api/tags/:id — deletes the groceries tag", async () => {
    const res = await req("DELETE", `/tags/${tagId}`);
    expect(res.status).toBe(204);
  });

  it("DELETE /api/uploads/:id — deletes the upload and cascades transactions", async () => {
    const res = await req("DELETE", `/uploads/${uploadId}`);
    expect(res.status).toBe(204);
  });

  it("DELETE /api/accounts/:id — deletes first account and cascades", async () => {
    const res = await req("DELETE", `/accounts/${accountId}`);
    expect(res.status).toBe(204);
  });

  it("DELETE /api/accounts/:id — deletes second account", async () => {
    const res = await req("DELETE", `/accounts/${secondAccountId}`);
    expect(res.status).toBe(204);
  });

  it("GET /api/accounts — deleted accounts no longer appear", async () => {
    const { data } = await json<Array<{ id: string }>>("GET", "/accounts");
    const ids = data.map((a) => a.id);
    expect(ids).not.toContain(accountId);
    expect(ids).not.toContain(secondAccountId);
  });
});
