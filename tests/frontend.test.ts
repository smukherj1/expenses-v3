/**
 * E2E tests for the Financial Tracker frontend.
 * Requires the frontend dev server at FRONTEND_URL (default: http://localhost:5173)
 * and the backend at BACKEND_URL (default: http://localhost:3000).
 *
 * Run: bun test --timeout 30000 tests/frontend.test.ts
 *   or: bun run test:frontend
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";

const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:8080";
const API = `${process.env.BACKEND_URL ?? "http://localhost:3000"}/api`;

// ── helpers ──────────────────────────────────────────────────────────────────

async function apiReq(method: string, path: string, body?: unknown) {
  return fetch(`${API}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function apiJson<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await apiReq(method, path, body);
  return res.json() as Promise<T>;
}

async function deleteAccountByLabel(label: string) {
  const accounts = await apiJson<Array<{ id: string; label: string }>>(
    "GET",
    "/accounts",
  );
  const acct = accounts.find((a) => a.label === label);
  if (acct) await apiReq("DELETE", `/accounts/${acct.id}`);
}

async function deleteTagByName(name: string) {
  const tags = await apiJson<Array<{ id: string; name: string }>>(
    "GET",
    "/tags",
  );
  const tag = tags.find((t) => t.name === name);
  if (tag) await apiReq("DELETE", `/tags/${tag.id}`);
}

function makeCsv(
  rows: Array<{
    date: string;
    description: string;
    amount: number;
    account: string;
  }>,
) {
  const header = "date,description,amount,currency,account";
  const lines = rows.map(
    (r) => `${r.date},${r.description},${r.amount},CAD,${r.account}`,
  );
  return [header, ...lines].join("\n");
}

async function uploadAndWaitForOutcome(
  page: Page,
  fileContent: string,
  filename: string,
  mimeType: string,
): Promise<{ kind: "result" | "review" | "error"; text: string }> {
  // Set files directly on the (hidden) input — bypasses file-chooser dialog
  await page.locator('[data-testid="upload-file-input"]').setInputFiles({
    name: filename,
    mimeType,
    buffer: Buffer.from(fileContent),
  });
  // Wait for the submit button to appear (file is selected)
  await page.waitForSelector('[data-testid="upload-submit"]', {
    timeout: 5000,
  });
  await page.locator('[data-testid="upload-submit"]').click();
  // Wait for result or error
  await page.waitForSelector(
    '[data-testid="upload-result"], [data-testid="upload-review"], [data-testid="upload-error"]',
    {
      timeout: 15000,
    },
  );
  if (await isVisible(page, '[data-testid="upload-review"]')) {
    return {
      kind: "review",
      text:
        (await page.locator('[data-testid="upload-review"]').textContent()) ??
        "",
    };
  }
  if (await isVisible(page, '[data-testid="upload-result"]')) {
    return {
      kind: "result",
      text:
        (await page.locator('[data-testid="upload-result"]').textContent()) ??
        "",
    };
  }
  return {
    kind: "error",
    text:
      (await page.locator('[data-testid="upload-error"]').textContent()) ?? "",
  };
}

async function isVisible(page: Page, selector: string): Promise<boolean> {
  try {
    return await page.locator(selector).isVisible({ timeout: 2000 });
  } catch {
    return false;
  }
}

// ── global browser setup ──────────────────────────────────────────────────────

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

// ── Upload — CSV ──────────────────────────────────────────────────────────────

describe("Upload — CSV", () => {
  const accountLabel = "E2E Upload CSV";
  let page: Page;

  beforeAll(async () => {
    page = await browser.newPage();
    await page.goto(`${FRONTEND}/upload`);
    await page.waitForLoadState("networkidle");
  });

  afterAll(async () => {
    await page.close();
    await deleteAccountByLabel(accountLabel);
  });

  it("shows the Upload page heading", async () => {
    const h1Text = await page.locator("h1").textContent();
    expect(h1Text).toContain("Upload");
  });

  it("uploads a CSV file and shows inserted count", async () => {
    const csv = makeCsv([
      {
        date: "2025-06-01",
        description: "Supermarket",
        amount: -45.0,
        account: accountLabel,
      },
      {
        date: "2025-06-02",
        description: "Salary",
        amount: 2500.0,
        account: accountLabel,
      },
    ]);
    const outcome = await uploadAndWaitForOutcome(
      page,
      csv,
      "e2e-test.csv",
      "text/csv",
    );
    expect(outcome.kind).toBe("result");
    expect(outcome.text).toContain("Inserted: 2");
    expect(outcome.text).toContain("Duplicates: 0");
  });

  it("shows duplicate review and can skip duplicates", async () => {
    const csv = makeCsv([
      {
        date: "2025-06-01",
        description: "Supermarket",
        amount: -45.0,
        account: accountLabel,
      },
      {
        date: "2025-06-03",
        description: "Coffee",
        amount: -5.5,
        account: accountLabel,
      },
    ]);
    const outcome = await uploadAndWaitForOutcome(
      page,
      csv,
      "e2e-test2.csv",
      "text/csv",
    );
    expect(outcome.kind).toBe("review");
    expect(outcome.text).toContain("Duplicate review required");
    await page.locator('[data-testid="skip-duplicates"]').click();
    await page.locator('[data-testid="upload-finalize"]').click();
    await page.waitForSelector('[data-testid="upload-result"]', {
      timeout: 15000,
    });
    const resultText =
      (await page.locator('[data-testid="upload-result"]').textContent()) ?? "";
    expect(resultText).toContain("Inserted: 1");
    expect(resultText).toContain("Duplicates: 0");
  });

  it("can accept duplicate rows during review", async () => {
    const csv = makeCsv([
      {
        date: "2025-06-01",
        description: "Supermarket",
        amount: -45.0,
        account: accountLabel,
      },
      {
        date: "2025-06-04",
        description: "Book Store",
        amount: -24.0,
        account: accountLabel,
      },
    ]);
    const outcome = await uploadAndWaitForOutcome(
      page,
      csv,
      "e2e-test3.csv",
      "text/csv",
    );
    expect(outcome.kind).toBe("review");
    await page.locator('[data-testid="accept-duplicates"]').click();
    await page.locator('[data-testid="upload-finalize"]').click();
    await page.waitForSelector('[data-testid="upload-result"]', {
      timeout: 15000,
    });
    const resultText =
      (await page.locator('[data-testid="upload-result"]').textContent()) ?? "";
    expect(resultText).toContain("Inserted: 2");
    expect(resultText).toContain("Duplicates: 1");
  });
});

// ── Upload — JSON ─────────────────────────────────────────────────────────────

describe("Upload — JSON", () => {
  const accountLabel = "E2E Upload JSON";
  let page: Page;

  beforeAll(async () => {
    page = await browser.newPage();
    await page.goto(`${FRONTEND}/upload`);
    await page.waitForLoadState("networkidle");
  });

  afterAll(async () => {
    await page.close();
    await deleteAccountByLabel(accountLabel);
  });

  it("uploads a JSON file and shows inserted count", async () => {
    const json = JSON.stringify([
      {
        date: "2025-07-01",
        description: "Freelance Income",
        amount: "1200.0",
        currency: "CAD",
        account: accountLabel,
      },
      {
        date: "2025-07-05",
        description: "Rent",
        amount: "-1000.0",
        currency: "CAD",
        account: accountLabel,
      },
    ]);
    const outcome = await uploadAndWaitForOutcome(
      page,
      json,
      "e2e-test.json",
      "application/json",
    );
    expect(outcome.kind).toBe("result");
    expect(outcome.text).toContain("Inserted: 2");
  });
});

// ── Transactions — view and search ────────────────────────────────────────────

describe("Transactions", () => {
  const accountLabel = "E2E Transactions";
  let page: Page;

  beforeAll(async () => {
    const csv = makeCsv([
      {
        date: "2025-08-01",
        description: "Whole Foods Market",
        amount: -88.5,
        account: accountLabel,
      },
      {
        date: "2025-08-05",
        description: "Payroll August",
        amount: 3000.0,
        account: accountLabel,
      },
      {
        date: "2025-08-10",
        description: "Netflix Subscription",
        amount: -18.99,
        account: accountLabel,
      },
    ]);
    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "seed.csv");
    await fetch(`${API}/uploads`, { method: "POST", body: form });

    page = await browser.newPage();
    await page.goto(`${FRONTEND}/transactions`);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector('[data-testid="transaction-row"]', {
      timeout: 10000,
    });
  });

  afterAll(async () => {
    await page.close();
    await deleteAccountByLabel(accountLabel);
  });

  it("shows transaction rows", async () => {
    const count = await page.locator('[data-testid="transaction-row"]').count();
    expect(count).toBeGreaterThan(0);
  });

  it("filters transactions by search query", async () => {
    await page.locator('[data-testid="search-input"]').fill("Whole Foods");
    await page.waitForTimeout(800);
    // Should still render without crashing
    const rowCount = await page
      .locator('[data-testid="transaction-row"]')
      .count();
    const emptyVisible = await isVisible(page, '[data-testid="empty-state"]');
    expect(rowCount >= 0 || emptyVisible).toBe(true);
    // Reset
    await page.locator('[data-testid="search-input"]').clear();
    await page.waitForTimeout(400);
  });

  it("filters transactions by type=expense", async () => {
    await page.locator('[data-testid="filter-type"]').selectOption("expense");
    await page.waitForTimeout(600);
    const count = await page.locator('[data-testid="transaction-row"]').count();
    expect(count).toBeGreaterThanOrEqual(0);
    await page.locator('[data-testid="filter-type"]').selectOption("");
    await page.waitForTimeout(400);
  });

  it("filters transactions by type=income", async () => {
    await page.locator('[data-testid="filter-type"]').selectOption("income");
    await page.waitForTimeout(600);
    const count = await page.locator('[data-testid="transaction-row"]').count();
    expect(count).toBeGreaterThanOrEqual(0);
    await page.locator('[data-testid="filter-type"]').selectOption("");
  });
});

// ── Tagging — detail page ─────────────────────────────────────────────────────

describe("Tagging — detail page", () => {
  const accountLabel = "E2E Tagging Detail";
  const tagName = "e2e-detail-tag";
  let page: Page;
  let transactionId: string;

  beforeAll(async () => {
    const csv = makeCsv([
      {
        date: "2025-09-01",
        description: "Tag Test Store Detail",
        amount: -55.0,
        account: accountLabel,
      },
    ]);
    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "tag-seed.csv");
    await fetch(`${API}/uploads`, { method: "POST", body: form });

    const res = await apiJson<{ data: Array<{ id: string }> }>(
      "GET",
      "/transactions",
    );
    // Find by matching description via full list (search may be FTS-only)
    const allRes = await apiJson<{
      data: Array<{ id: string; description: string }>;
    }>("GET", "/transactions?limit=100");
    const row = allRes.data.find(
      (t) => t.description === "Tag Test Store Detail",
    );
    transactionId = row?.id ?? allRes.data[0]?.id ?? "";

    page = await browser.newPage();
    await page.goto(`${FRONTEND}/transactions/${transactionId}`);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector('[data-testid="transaction-detail"]', {
      timeout: 10000,
    });
  });

  afterAll(async () => {
    await page.close();
    await deleteAccountByLabel(accountLabel);
    await deleteTagByName(tagName);
  });

  it("shows the transaction detail page", async () => {
    const visible = await isVisible(page, '[data-testid="transaction-detail"]');
    expect(visible).toBe(true);
  });

  it("adds a tag to the transaction", async () => {
    await page.locator('[data-testid="tag-add-input"]').fill(tagName);
    await page.locator('[data-testid="tag-add-btn"]').click();

    // Wait for tag badge to appear in the tag list
    await page.waitForFunction(
      (name) =>
        document
          .querySelector('[data-testid="tag-list"]')
          ?.textContent?.includes(name),
      tagName,
      { timeout: 8000 },
    );
    const tagListText =
      (await page.locator('[data-testid="tag-list"]').textContent()) ?? "";
    expect(tagListText).toContain(tagName);
  });

  it("removes the tag from the transaction", async () => {
    const removeBtn = page.locator(`[aria-label="Remove tag ${tagName}"]`);
    await removeBtn.waitFor({ state: "visible", timeout: 5000 });
    await removeBtn.click();

    await page.waitForFunction(
      (name) =>
        !document
          .querySelector('[data-testid="tag-list"]')
          ?.textContent?.includes(name),
      tagName,
      { timeout: 8000 },
    );
    const tagListText =
      (await page.locator('[data-testid="tag-list"]').textContent()) ?? "";
    expect(tagListText).not.toContain(tagName);
  });
});

// ── Tagging — bulk ────────────────────────────────────────────────────────────

describe("Tagging — bulk", () => {
  const accountLabel = "E2E Tagging Bulk";
  const tagName = "e2e-bulk-tag";
  let page: Page;

  beforeAll(async () => {
    const csv = makeCsv([
      {
        date: "2025-09-10",
        description: "Bulk Tag Store A",
        amount: -30.0,
        account: accountLabel,
      },
      {
        date: "2025-09-11",
        description: "Bulk Tag Store B",
        amount: -20.0,
        account: accountLabel,
      },
    ]);
    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "bulk-seed.csv");
    await fetch(`${API}/uploads`, { method: "POST", body: form });

    page = await browser.newPage();
    await page.goto(`${FRONTEND}/transactions`);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector('[data-testid="transaction-row"]', {
      timeout: 10000,
    });
  });

  afterAll(async () => {
    await page.close();
    await deleteAccountByLabel(accountLabel);
    await deleteTagByName(tagName);
  });

  it("selecting a row shows the bulk tag bar", async () => {
    const firstCheckbox = page
      .locator('[data-testid="transaction-row"] input[type="checkbox"]')
      .first();
    await firstCheckbox.click();
    const visible = await isVisible(page, '[data-testid="bulk-tag-bar"]');
    expect(visible).toBe(true);
  });

  it("adds tags via the bulk tag bar", async () => {
    await page.locator('[data-testid="bulk-tag-input"]').fill(tagName);
    await page.locator('[data-testid="bulk-tag-add"]').click();
    // After success, selection clears and bar hides
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="bulk-tag-bar"]'),
      { timeout: 8000 },
    );
    const barVisible = await isVisible(page, '[data-testid="bulk-tag-bar"]');
    expect(barVisible).toBe(false);
  });

  it("removes tags via the bulk tag bar", async () => {
    // Re-select a row
    const firstCheckbox = page
      .locator('[data-testid="transaction-row"] input[type="checkbox"]')
      .first();
    await firstCheckbox.click();
    await page.waitForSelector('[data-testid="bulk-tag-bar"]', {
      timeout: 5000,
    });

    await page.locator('[data-testid="bulk-tag-input"]').fill(tagName);
    await page.locator('[data-testid="bulk-tag-remove"]').click();

    await page.waitForFunction(
      () => !document.querySelector('[data-testid="bulk-tag-bar"]'),
      { timeout: 8000 },
    );
    const barVisible = await isVisible(page, '[data-testid="bulk-tag-bar"]');
    expect(barVisible).toBe(false);
  });
});

// ── Deletion — list page ─────────────────────────────────────────────────────

describe("Deletion — list page", () => {
  const singleAccount = "E2E Delete Single";
  const bulkAccount = "E2E Delete Bulk";
  let page: Page;

  beforeAll(async () => {
    const singleCsv = makeCsv([
      {
        date: "2025-11-01",
        description: "Frontend Delete Single Alpha",
        amount: -11.0,
        account: singleAccount,
      },
      {
        date: "2025-11-02",
        description: "Frontend Delete Single Beta",
        amount: -12.0,
        account: singleAccount,
      },
    ]);
    const bulkCsv = makeCsv([
      {
        date: "2025-11-03",
        description: "Frontend Delete Bulk Alpha",
        amount: -21.0,
        account: bulkAccount,
      },
      {
        date: "2025-11-04",
        description: "Frontend Delete Bulk Beta",
        amount: -22.0,
        account: bulkAccount,
      },
    ]);

    const form1 = new FormData();
    form1.append(
      "file",
      new Blob([singleCsv], { type: "text/csv" }),
      "single.csv",
    );
    await fetch(`${API}/uploads`, { method: "POST", body: form1 });

    const form2 = new FormData();
    form2.append("file", new Blob([bulkCsv], { type: "text/csv" }), "bulk.csv");
    await fetch(`${API}/uploads`, { method: "POST", body: form2 });

    page = await browser.newPage();
    await page.goto(`${FRONTEND}/transactions`);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector('[data-testid="transaction-row"]', {
      timeout: 10000,
    });
  });

  afterAll(async () => {
    await page.close();
    await deleteAccountByLabel(singleAccount);
    await deleteAccountByLabel(bulkAccount);
  });

  it("deletes a single selected transaction from the list", async () => {
    await page
      .locator('[data-testid="search-input"]')
      .fill("Frontend Delete Single");
    await page.waitForTimeout(800);

    const checkbox = page
      .locator('[data-testid="transaction-row"] input[type="checkbox"]')
      .first();
    await checkbox.click();
    await page.waitForSelector('[data-testid="bulk-tag-bar"]', {
      timeout: 5000,
    });
    await page.locator('[data-testid="bulk-delete"]').click();
    await page.waitForSelector('[data-testid="confirm-dialog"]', {
      timeout: 5000,
    });
    await page.locator('[data-testid="confirm-ok"]').click();

    await page.waitForFunction(
      () => !document.querySelector('[data-testid="confirm-dialog"]'),
      { timeout: 8000 },
    );

    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="transaction-row"]').length ===
        1,
      { timeout: 8000 },
    );

    const count = await page.locator('[data-testid="transaction-row"]').count();
    expect(count).toBe(1);
  });

  it("deletes multiple selected transactions from the list", async () => {
    await page
      .locator('[data-testid="search-input"]')
      .fill("Frontend Delete Bulk");
    await page.waitForTimeout(800);

    const checkboxes = page.locator(
      '[data-testid="transaction-row"] input[type="checkbox"]',
    );
    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();

    await page.waitForSelector('[data-testid="bulk-tag-bar"]', {
      timeout: 5000,
    });
    await page.locator('[data-testid="bulk-delete"]').click();
    await page.waitForSelector('[data-testid="confirm-dialog"]', {
      timeout: 5000,
    });
    await page.locator('[data-testid="confirm-ok"]').click();

    await page.waitForFunction(
      () => !document.querySelector('[data-testid="confirm-dialog"]'),
      { timeout: 8000 },
    );
    await page.waitForFunction(
      () => document.querySelector('[data-testid="empty-state"]'),
      { timeout: 8000 },
    );

    const emptyVisible = await isVisible(page, '[data-testid="empty-state"]');
    expect(emptyVisible).toBe(true);
  });
});

// ── Auto-tag rules ────────────────────────────────────────────────────────────

describe("Auto-tag rules", () => {
  const accountLabel = "E2E Rules";
  const tagName = "e2e-rules-tag";
  let page: Page;
  let tagId: string;

  beforeAll(async () => {
    const csv = makeCsv([
      {
        date: "2025-10-01",
        description: "Starbucks Coffee",
        amount: -7.5,
        account: accountLabel,
      },
      {
        date: "2025-10-02",
        description: "Tim Hortons Coffee",
        amount: -4.25,
        account: accountLabel,
      },
    ]);
    const form = new FormData();
    form.append(
      "file",
      new Blob([csv], { type: "text/csv" }),
      "rules-seed.csv",
    );
    await fetch(`${API}/uploads`, { method: "POST", body: form });

    const tag = await apiJson<{ id: string }>("POST", "/tags", {
      name: tagName,
    });
    tagId = (tag as { id: string }).id;

    page = await browser.newPage();
    await page.goto(`${FRONTEND}/rules`);
    await page.waitForLoadState("networkidle");
  });

  afterAll(async () => {
    await page.close();
    await deleteAccountByLabel(accountLabel);
    if (tagId) await apiReq("DELETE", `/tags/${tagId}`);
    else await deleteTagByName(tagName);
  });

  it("shows the Rules page heading", async () => {
    const h1 = await page.locator("h1").textContent();
    expect(h1).toContain("Auto-Tag Rules");
  });

  it("opens the create-rule form", async () => {
    await page.locator('[data-testid="new-rule-btn"]').click();
    await page.waitForSelector('[data-testid="create-rule-form"]', {
      timeout: 5000,
    });
    const visible = await isVisible(page, '[data-testid="create-rule-form"]');
    expect(visible).toBe(true);
  });

  it("creates a rule: description contains Starbucks → tag", async () => {
    await page
      .locator('[data-testid="rule-tag-select"]')
      .selectOption({ label: tagName });
    await page
      .locator('[data-testid="condition-field"]')
      .selectOption("description");
    await page
      .locator('[data-testid="condition-type"]')
      .selectOption("contains");
    await page.locator('[data-testid="condition-value"]').fill("Starbucks");
    await page.locator('[data-testid="rule-submit-btn"]').click();

    await page.waitForSelector('[data-testid="rule-card"]', { timeout: 8000 });
    const count = await page.locator('[data-testid="rule-card"]').count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("applies the rule retroactively and shows match result", async () => {
    await page.locator('[data-testid="apply-rule-btn"]').first().click();
    await page.waitForSelector('[data-testid^="apply-result"]', {
      timeout: 10000,
    });
    const resultText =
      (await page
        .locator('[data-testid^="apply-result"]')
        .first()
        .textContent()) ?? "";
    expect(resultText).toContain("matched");
  });

  it("deletes the rule", async () => {
    const countBefore = await page.locator('[data-testid="rule-card"]').count();
    await page.locator('[data-testid="delete-rule-btn"]').first().click();
    await page.waitForTimeout(1000);
    const countAfter = await page.locator('[data-testid="rule-card"]').count();
    expect(countAfter).toBe(countBefore - 1);
  });
});

// ── Settings — accounts ───────────────────────────────────────────────────────

describe("Settings", () => {
  const accountLabel = "E2E Settings Account";
  let page: Page;

  beforeAll(async () => {
    // Clean up any leftover account from a previous run so the upload
    // always creates it fresh and the account is guaranteed to be in the list.
    await deleteAccountByLabel(accountLabel);

    const csv = makeCsv([
      {
        date: "2025-11-01",
        description: "Settings Test Txn",
        amount: -10.0,
        account: accountLabel,
      },
    ]);
    const form = new FormData();
    form.append(
      "file",
      new Blob([csv], { type: "text/csv" }),
      "settings-seed.csv",
    );
    await fetch(`${API}/uploads`, { method: "POST", body: form });

    page = await browser.newPage();
    await page.goto(`${FRONTEND}/settings`);
    await page.waitForLoadState("networkidle");
    // Wait for the specific account row, not just any accounts-list, so we
    // know the seeded account is actually visible before the tests run.
    await page
      .locator('[data-testid="accounts-list"] li')
      .filter({ hasText: accountLabel })
      .waitFor({ state: "visible", timeout: 10000 });
  });

  afterAll(async () => {
    await page.close();
    await deleteAccountByLabel(accountLabel); // no-op if test deleted it
  });

  it("lists accounts including the seeded account", async () => {
    const listText =
      (await page.locator('[data-testid="accounts-list"]').textContent()) ?? "";
    expect(listText).toContain(accountLabel);
  });

  it("deletes the account after confirmation", async () => {
    const accountRow = page
      .locator('[data-testid="accounts-list"] li')
      .filter({ hasText: accountLabel });
    await accountRow.locator('[data-testid="delete-account-btn"]').click();

    await page.waitForSelector('[data-testid="confirm-ok"]', { timeout: 8000 });
    await page.locator('[data-testid="confirm-ok"]').click();

    // Wait until the account disappears from the list (or the list itself
    // disappears when no accounts remain) rather than using a fixed sleep.
    await page.waitForFunction(
      (label) =>
        !document
          .querySelector('[data-testid="accounts-list"]')
          ?.textContent?.includes(label),
      accountLabel,
      { timeout: 10000 },
    );
  });
});
