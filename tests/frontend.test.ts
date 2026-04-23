/**
 * E2E tests for the Financial Tracker frontend.
 * Requires the frontend dev server at FRONTEND_URL (default: http://localhost:5173)
 * and the backend at BACKEND_URL (default: http://localhost:3000).
 *
 * Run: bun test --timeout 30000 tests/frontend.test.ts
 *   or: bun run test:frontend
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from "bun:test";
import { readFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";

const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:8080";
const API = `${process.env.BACKEND_URL ?? "http://localhost:3000"}/api`;

type UploadFormat =
  | "generic_csv"
  | "generic_json"
  | "td_canada"
  | "rbc_canada"
  | "amex_canada"
  | "cibc_canada";

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

async function deleteRuleById(id: string) {
  await apiReq("DELETE", `/rules/${id}`);
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
    await deleteRuleById(id);
  }
  for (const label of [...cleanupAccountLabels].reverse()) {
    await deleteAccountByLabel(label);
  }
  for (const name of [...cleanupTagNames].reverse()) {
    await deleteTagByName(name);
  }
});

function readFixture(name: string): string {
  return readFileSync(new URL(`./data/${name}`, import.meta.url), "utf8");
}

function makeCsv(
  rows: Array<{
    date: string;
    description: string;
    amount: number | string;
    account: string;
  }>,
) {
  const header = "date,description,amount,currency,account";
  const lines = rows.map(
    (r) => `${r.date},${r.description},${String(r.amount)},CAD,${r.account}`,
  );
  return [header, ...lines].join("\n");
}

async function seedCsvRows(
  rows: Array<{
    date: string;
    description: string;
    amount: number | string;
    account: string;
  }>,
  filename = `seed-${crypto.randomUUID()}.csv`,
) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([makeCsv(rows)], { type: "text/csv" }),
    filename,
  );
  form.append("format", "generic_csv");
  const res = await fetch(`${API}/uploads`, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`Seed upload failed: ${res.status} ${await res.text()}`);
  }
  return res;
}

async function getTransactionsForAccount(accountId: string) {
  const data = await apiJson<{
    data: Array<{
      id: string;
      description: string;
      amount: number;
      date: string;
      accountId: string;
    }>;
  }>("GET", `/transactions?accountId=${accountId}&limit=100`);
  return data.data;
}

async function getAccountIdByLabel(label: string): Promise<string> {
  const accounts = await apiJson<Array<{ id: string; label: string }>>(
    "GET",
    "/accounts",
  );
  const account = accounts.find((entry) => entry.label === label);
  if (!account) {
    throw new Error(`Missing account: ${label}`);
  }
  return account.id;
}

async function uploadAndWaitForOutcome(
  page: Page,
  options: {
    fileContent: string;
    filename: string;
    mimeType: string;
    format: UploadFormat;
    accountLabel?: string;
  },
): Promise<{ kind: "result" | "review" | "error"; text: string }> {
  await page
    .locator('[data-testid="upload-format-select"]')
    .selectOption(options.format);
  if (options.accountLabel) {
    await page.waitForSelector('[data-testid="upload-account-select"]', {
      timeout: 5000,
    });
    const accountSelect = page.locator('[data-testid="upload-account-select"]');
    try {
      await page.waitForFunction(
        (label) =>
          Array.from(
            document.querySelectorAll(
              '[data-testid="upload-account-select"] option',
            ),
          ).some((option) => option.textContent === label),
        options.accountLabel,
        { timeout: 2000 },
      );
      await accountSelect.selectOption({ label: options.accountLabel });
    } catch {
      await accountSelect.selectOption("__custom__");
      await page
        .locator('[data-testid="upload-account-label"]')
        .fill(options.accountLabel);
    }
  }
  // Set files directly on the (hidden) input — bypasses file-chooser dialog
  await page.locator('[data-testid="upload-file-input"]').setInputFiles({
    name: options.filename,
    mimeType: options.mimeType,
    buffer: Buffer.from(options.fileContent),
  });
  // Wait for the submit button to appear (file is selected)
  await page.waitForSelector('[data-testid="upload-submit"]', {
    timeout: 5000,
  });
  await page.locator('[data-testid="upload-submit"]').click();
  // Wait for result or error
  await page.waitForSelector(
    '[data-testid="duplicate-review-page"], [data-testid="upload-result"], [data-testid="upload-error"]',
    {
      timeout: 15000,
    },
  );
  if (await isVisible(page, '[data-testid="duplicate-review-page"]')) {
    return {
      kind: "review",
      text:
        (await page
          .locator('[data-testid="duplicate-review-page"]')
          .textContent()) ?? "",
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

async function selectTransactionAccountFilters(
  page: Page,
  labels: string | string[],
) {
  const selectedLabels = Array.isArray(labels) ? labels : [labels];
  const selectedAccountIds = await Promise.all(
    selectedLabels.map((label) => getAccountIdByLabel(label)),
  );

  const panel = page.locator('[data-testid="account-filter-panel"]');
  if (!(await panel.isVisible().catch(() => false))) {
    await page.locator('[data-testid="account-filter-trigger"]').click();
  }
  await panel.waitFor({ state: "visible", timeout: 5000 });

  await page.locator('[data-testid="account-filter-clear-button"]').click();
  await page.waitForFunction(
    () => new URL(window.location.href).searchParams.get("accountIds") === null,
    { timeout: 5000 },
  );
  for (const accountId of selectedAccountIds) {
    await page.waitForFunction(
      (id) => {
        const input = document.querySelector(`[data-account-id="${id}"]`);
        return input instanceof HTMLInputElement && input.checked === false;
      },
      accountId,
      { timeout: 5000 },
    );
  }

  for (const accountId of selectedAccountIds) {
    const checkbox = page.locator(`[data-account-id="${accountId}"]`);
    await checkbox.click();
    await page.waitForFunction(
      (id) => {
        const input = document.querySelector(`[data-account-id="${id}"]`);
        return input instanceof HTMLInputElement && input.checked;
      },
      accountId,
      { timeout: 5000 },
    );
  }

  await page.waitForFunction(
    (accountLabels) => {
      const url = new URL(window.location.href);
      const accountIds = url.searchParams.get("accountIds");
      if (!accountIds) return false;
      const rows = Array.from(
        document.querySelectorAll('[data-testid="transaction-row"]'),
      );
      return (
        rows.length > 0 &&
        rows.every((row) =>
          (accountLabels as string[]).some((label) =>
            row.textContent?.includes(label),
          ),
        )
      );
    },
    selectedLabels,
    { timeout: 5000 },
  );
  if (await panel.isVisible().catch(() => false)) {
    await page.locator('[data-testid="account-filter-trigger"]').click();
    await panel.waitFor({ state: "hidden", timeout: 5000 });
  }
}

async function clearTransactionAccountFilters(page: Page) {
  const panel = page.locator('[data-testid="account-filter-panel"]');
  if (!(await panel.isVisible().catch(() => false))) {
    await page.locator('[data-testid="account-filter-trigger"]').click();
  }
  await panel.waitFor({ state: "visible", timeout: 5000 });
  await page.locator('[data-testid="account-filter-clear-button"]').click();
  await page.waitForFunction(
    () => new URL(window.location.href).searchParams.get("accountIds") === null,
    { timeout: 5000 },
  );
  if (await panel.isVisible().catch(() => false)) {
    await page.locator('[data-testid="account-filter-trigger"]').click();
    await panel.waitFor({ state: "hidden", timeout: 5000 });
  }
}

async function searchTransactions(page: Page, query: string) {
  await page.locator('[data-testid="search-input"]').fill(query);
  await page.waitForFunction(
    (value) => {
      const rows = Array.from(
        document.querySelectorAll('[data-testid="transaction-row"]'),
      );
      return (
        rows.length > 0 && rows.every((row) => row.textContent?.includes(value))
      );
    },
    query,
    { timeout: 5000 },
  );
}

// ── global browser setup ──────────────────────────────────────────────────────

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

// ── Upload ───────────────────────────────────────────────────────────────────

describe("Upload", () => {
  let page: Page;
  beforeEach(async () => {
    page = await browser.newPage();
    await page.goto(`${FRONTEND}/upload`);
    await page.waitForSelector('[data-testid="upload-format-select"]', {
      timeout: 10000,
    });
  });

  afterEach(async () => {
    await page.close();
  });

  it("shows the Upload page heading", async () => {
    const h1Text = await page.locator("h1").textContent();
    expect(h1Text).toContain("Upload");
  });

  it("uploads a CSV file and shows inserted count", async () => {
    const csvAccountLabel = trackAccount(uniqueLabel("E2E Upload CSV"));
    const csv = makeCsv([
      {
        date: "2025-06-01",
        description: "Supermarket",
        amount: -45.0,
        account: csvAccountLabel,
      },
      {
        date: "2025-06-02",
        description: "Salary",
        amount: 2500.0,
        account: csvAccountLabel,
      },
    ]);
    const outcome = await uploadAndWaitForOutcome(page, {
      fileContent: csv,
      filename: "e2e-test.csv",
      mimeType: "text/csv",
      format: "generic_csv",
    });
    expect(outcome.kind).toBe("result");
    expect(outcome.text).toContain("Inserted: 2");
    expect(outcome.text).toContain("Duplicates: 0");
  });

  it("shows duplicate review and can skip duplicates", async () => {
    const csvAccountLabel = trackAccount(uniqueLabel("E2E Upload Duplicate"));
    await seedCsvRows([
      {
        date: "2025-06-01",
        description: "Supermarket",
        amount: -45.0,
        account: csvAccountLabel,
      },
    ]);
    const csv = makeCsv([
      {
        date: "2025-06-01",
        description: "Supermarket",
        amount: -45.0,
        account: csvAccountLabel,
      },
      {
        date: "2025-06-03",
        description: "Coffee",
        amount: -5.5,
        account: csvAccountLabel,
      },
    ]);
    const outcome = await uploadAndWaitForOutcome(page, {
      fileContent: csv,
      filename: "e2e-test2.csv",
      mimeType: "text/csv",
      format: "generic_csv",
    });
    expect(outcome.kind).toBe("review");
    expect(outcome.text).toContain("Duplicate Review");
    expect(outcome.text).toContain("generic_csv");
    expect(page.url()).toContain("/upload/duplicates");
    await page.locator('[data-testid="duplicate-review-skip-all"]').click();
    await page.locator('[data-testid="duplicate-review-finalize"]').click();
    await page.waitForSelector('[data-testid="duplicate-review-summary"]', {
      timeout: 15000,
    });
    const resultText =
      (await page
        .locator('[data-testid="duplicate-review-summary"]')
        .textContent()) ?? "";
    expect(resultText).toContain("Inserted: 1");
    expect(resultText).toContain("Duplicates: 0");
  });

  it("can accept duplicate rows during review", async () => {
    const csvAccountLabel = trackAccount(
      uniqueLabel("E2E Upload Accept Duplicate"),
    );
    await seedCsvRows([
      {
        date: "2025-06-01",
        description: "Supermarket",
        amount: -45.0,
        account: csvAccountLabel,
      },
    ]);
    const csv = makeCsv([
      {
        date: "2025-06-01",
        description: "Supermarket",
        amount: -45.0,
        account: csvAccountLabel,
      },
      {
        date: "2025-06-04",
        description: "Book Store",
        amount: -24.0,
        account: csvAccountLabel,
      },
    ]);
    const outcome = await uploadAndWaitForOutcome(page, {
      fileContent: csv,
      filename: "e2e-test3.csv",
      mimeType: "text/csv",
      format: "generic_csv",
    });
    expect(outcome.kind).toBe("review");
    await page.locator('[data-testid="duplicate-review-accept-all"]').click();
    await page.locator('[data-testid="duplicate-review-finalize"]').click();
    await page.waitForSelector('[data-testid="duplicate-review-summary"]', {
      timeout: 15000,
    });
    const resultText =
      (await page
        .locator('[data-testid="duplicate-review-summary"]')
        .textContent()) ?? "";
    expect(resultText).toContain("Inserted: 2");
    expect(resultText).toContain("Duplicates: 1");
  });

  it("paginates duplicate review rows on the client", async () => {
    const csvAccountLabel = trackAccount(
      uniqueLabel("E2E Upload Review Pages"),
    );
    await seedCsvRows([
      {
        date: "2025-08-24",
        description: "Supermarket",
        amount: -45.0,
        account: csvAccountLabel,
      },
    ]);
    const rows = Array.from({ length: 24 }, (_, index) => ({
      date: `2025-08-${String(index + 1).padStart(2, "0")}`,
      description:
        index === 23 ? "Supermarket" : `Review Row ${String(index + 1)}`,
      amount: index === 23 ? -45.0 : -(index + 1),
      account: csvAccountLabel,
    })).map((row, index) =>
      index === 23 ? { ...row, date: "2025-08-24" } : row,
    );
    const csv = makeCsv(rows);

    const outcome = await uploadAndWaitForOutcome(page, {
      fileContent: csv,
      filename: "e2e-review-pages.csv",
      mimeType: "text/csv",
      format: "generic_csv",
    });

    expect(outcome.kind).toBe("review");
    expect(
      await page.locator('[data-testid="duplicate-review-row"]').count(),
    ).toBe(20);
    await page.locator('[data-testid="pagination-next"]').click();
    await page.waitForSelector('[data-testid="duplicate-review-row-24"]', {
      timeout: 8000,
    });
    expect(
      await page.locator('[data-testid="duplicate-review-row"]').count(),
    ).toBe(4);
    await page.locator('[data-testid="duplicate-review-row-24"]').check();
    await page.locator('[data-testid="duplicate-review-finalize"]').click();
    await page.waitForSelector('[data-testid="duplicate-review-summary"]', {
      timeout: 15000,
    });
    const resultText =
      (await page
        .locator('[data-testid="duplicate-review-summary"]')
        .textContent()) ?? "";
    expect(resultText).toContain("Inserted: 24");
    expect(resultText).toContain("Duplicates: 1");
  });

  it("filters and sorts duplicate review rows on the client", async () => {
    const csvAccountLabel = trackAccount(
      uniqueLabel("E2E Upload Review Filter"),
    );
    await seedCsvRows([
      {
        date: "2025-06-01",
        description: "Seed Match",
        amount: -10.0,
        account: csvAccountLabel,
      },
    ]);
    const csv = makeCsv([
      {
        date: "2025-06-03",
        description: "Zulu Row",
        amount: -30.0,
        account: csvAccountLabel,
      },
      {
        date: "2025-06-02",
        description: "Alpha Row",
        amount: -20.0,
        account: csvAccountLabel,
      },
      {
        date: "2025-06-01",
        description: "Seed Match",
        amount: -10.0,
        account: csvAccountLabel,
      },
    ]);

    const outcome = await uploadAndWaitForOutcome(page, {
      fileContent: csv,
      filename: "e2e-review-filter.csv",
      mimeType: "text/csv",
      format: "generic_csv",
    });

    expect(outcome.kind).toBe("review");
    await page.locator('[data-testid="sort-description"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="duplicate-review-row"]')
          ?.textContent?.includes("Alpha Row"),
      { timeout: 5000 },
    );
    let rows = await page
      .locator('[data-testid="duplicate-review-row"]')
      .allTextContents();
    expect(rows[0]).toContain("Alpha Row");

    await page
      .locator('[data-testid="duplicate-review-visibility"]')
      .selectOption("duplicates");
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="duplicate-review-row"]')
          .length === 1,
      { timeout: 5000 },
    );
    rows = await page
      .locator('[data-testid="duplicate-review-row"]')
      .allTextContents();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("Seed Match");

    await page.locator('[data-testid="duplicate-review-row-3"]').check();
    await page
      .locator('[data-testid="duplicate-review-visibility"]')
      .selectOption("nonDuplicates");
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="duplicate-review-row"]')
          .length === 2,
      { timeout: 5000 },
    );
    await page
      .locator('[data-testid="duplicate-review-visibility"]')
      .selectOption("all");
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="duplicate-review-row"]')
          .length === 3,
      { timeout: 5000 },
    );
    expect(
      await page.locator('[data-testid="duplicate-review-row-3"]').isChecked(),
    ).toBe(true);
  });

  it("uploads a JSON file and shows inserted count", async () => {
    const jsonAccountLabel = trackAccount(uniqueLabel("E2E Upload JSON"));
    const json = JSON.stringify([
      {
        date: "2025-07-01",
        description: "Freelance Income",
        amount: "1200.0",
        currency: "CAD",
        account: jsonAccountLabel,
      },
      {
        date: "2025-07-05",
        description: "Rent",
        amount: "-1000.0",
        currency: "CAD",
        account: jsonAccountLabel,
      },
    ]);
    const outcome = await uploadAndWaitForOutcome(page, {
      fileContent: json,
      filename: "e2e-test.json",
      mimeType: "application/json",
      format: "generic_json",
    });
    expect(outcome.kind).toBe("result");
    expect(outcome.text).toContain("Inserted: 2");
  });

  it("uploads TD Canada with an existing account label", async () => {
    const existingInstitutionLabel = trackAccount(
      uniqueLabel("E2E Upload Existing"),
    );
    await seedCsvRows([
      {
        date: "2025-05-01",
        description: "Seed Existing Account",
        amount: -1.0,
        account: existingInstitutionLabel,
      },
    ]);
    await page.reload();
    await page.waitForSelector('[data-testid="upload-format-select"]', {
      timeout: 10000,
    });

    const outcome = await uploadAndWaitForOutcome(page, {
      fileContent: readFixture("td.csv"),
      filename: "td.csv",
      mimeType: "text/csv",
      format: "td_canada",
      accountLabel: existingInstitutionLabel,
    });
    expect(outcome.kind).toBe("result");
    expect(outcome.text).toContain("Inserted: 6");
  });

  it("disables submit until an institution account label is provided", async () => {
    await page
      .locator('[data-testid="upload-format-select"]')
      .selectOption("td_canada");
    await page.locator('[data-testid="upload-file-input"]').setInputFiles({
      name: "td.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(readFixture("td.csv")),
    });
    await page.waitForSelector('[data-testid="upload-submit"]', {
      timeout: 5000,
    });
    expect(
      await page.locator('[data-testid="upload-submit"]').isDisabled(),
    ).toBe(true);
  });

  it("uploads Amex Canada with a custom account label and creates the account", async () => {
    const customInstitutionLabel = trackAccount(
      uniqueLabel("E2E Upload Custom"),
    );
    const outcome = await uploadAndWaitForOutcome(page, {
      fileContent: readFixture("amex.csv"),
      filename: "amex.csv",
      mimeType: "text/csv",
      format: "amex_canada",
      accountLabel: customInstitutionLabel,
    });
    expect(outcome.kind).toBe("result");
    expect(outcome.text).toContain("Inserted: 7");

    const accounts = await apiJson<Array<{ label: string }>>(
      "GET",
      "/accounts",
    );
    expect(accounts.map((account) => account.label)).toContain(
      customInstitutionLabel,
    );
  });

  it("uploads an institution fixture through duplicate review", async () => {
    const reviewInstitutionLabel = trackAccount(
      uniqueLabel("E2E Upload Review"),
    );
    const seed = await uploadAndWaitForOutcome(page, {
      fileContent: readFixture("rbc.csv"),
      filename: "rbc-seed.csv",
      mimeType: "text/csv",
      format: "rbc_canada",
      accountLabel: reviewInstitutionLabel,
    });
    expect(seed.kind).toBe("result");
    await page.goto(`${FRONTEND}/upload`);
    await page.waitForSelector('[data-testid="upload-format-select"]', {
      timeout: 10000,
    });

    const outcome = await uploadAndWaitForOutcome(page, {
      fileContent: readFixture("rbc.csv"),
      filename: "rbc-review.csv",
      mimeType: "text/csv",
      format: "rbc_canada",
      accountLabel: reviewInstitutionLabel,
    });
    expect(outcome.kind).toBe("review");
    expect(outcome.text).toContain("rbc_canada");
    await page.locator('[data-testid="duplicate-review-accept-all"]').click();
    await page.locator('[data-testid="duplicate-review-finalize"]').click();
    await page.waitForSelector('[data-testid="duplicate-review-summary"]', {
      timeout: 15000,
    });
    const resultText =
      (await page
        .locator('[data-testid="duplicate-review-summary"]')
        .textContent()) ?? "";
    expect(resultText).toContain("Inserted: 9");
  });
});

// ── Transactions — view and search ────────────────────────────────────────────

describe("Transactions", () => {
  let page: Page;
  let accountLabel: string;
  let accountId: string;
  let secondaryAccountLabel: string;
  let secondaryAccountId: string;
  let searchLabel: string;

  beforeEach(async () => {
    page = await browser.newPage();
    accountLabel = trackAccount(uniqueLabel("E2E Transactions"));
    secondaryAccountLabel = trackAccount(uniqueLabel("0 E2E Transactions B"));
    searchLabel = `Whole Foods ${crypto.randomUUID().slice(0, 8)}`;
    await seedCsvRows([
      {
        date: "2025-08-01",
        description: searchLabel,
        amount: -88.5,
        account: accountLabel,
      },
      {
        date: "2025-08-05",
        description: `Payroll August ${searchLabel}`,
        amount: 3000.0,
        account: accountLabel,
      },
      {
        date: "2025-08-10",
        description: `Netflix ${searchLabel}`,
        amount: -18.99,
        account: accountLabel,
      },
      {
        date: "2025-08-03",
        description: `Airport Shuttle ${searchLabel}`,
        amount: -12.34,
        account: secondaryAccountLabel,
      },
    ]);
    accountId = await getAccountIdByLabel(accountLabel);
    secondaryAccountId = await getAccountIdByLabel(secondaryAccountLabel);
    const params = new URLSearchParams({
      accountIds: `${accountId},${secondaryAccountId}`,
    });
    await page.goto(`${FRONTEND}/transactions?${params.toString()}`);
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="transaction-row"]').length ===
        4,
      { timeout: 10000 },
    );
  });

  afterEach(async () => {
    await page.close();
  });

  it("shows transaction rows", async () => {
    await selectTransactionAccountFilters(page, accountLabel);
    const count = await page.locator('[data-testid="transaction-row"]').count();
    expect(count).toBeGreaterThan(0);
  });

  it("defaults to oldest-first ordering", async () => {
    await selectTransactionAccountFilters(page, accountLabel);
    const rows = await page
      .locator('[data-testid="transaction-row"]')
      .allTextContents();
    expect(rows[0]).toContain("2025-08-01");
    expect(rows[rows.length - 1]).toContain("2025-08-10");
  });

  it("sorts by amount, description, and account", async () => {
    await searchTransactions(page, searchLabel);
    await page.locator('[data-testid="sort-amount"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="transaction-row"]')
          ?.textContent?.includes("-88.50"),
      { timeout: 5000 },
    );
    let rows = await page
      .locator('[data-testid="transaction-row"]')
      .allTextContents();
    expect(rows[0]).toContain("-88.50");

    await page.locator('[data-testid="sort-description"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="transaction-row"]')
          ?.textContent?.includes("Airport Shuttle"),
      { timeout: 5000 },
    );
    rows = await page
      .locator('[data-testid="transaction-row"]')
      .allTextContents();
    expect(rows[0]).toContain("Airport Shuttle");

    await page.locator('[data-testid="sort-account"]').click();
    await page.waitForFunction(
      (label) =>
        document
          .querySelector('[data-testid="transaction-row"]')
          ?.textContent?.includes(label),
      secondaryAccountLabel,
      { timeout: 5000 },
    );
    rows = await page
      .locator('[data-testid="transaction-row"]')
      .allTextContents();
    expect(rows[0]).toContain(secondaryAccountLabel);
    expect(rows[rows.length - 1]).toContain(accountLabel);
  });

  it("filters transactions by search query", async () => {
    await searchTransactions(page, searchLabel);
    const rows = await page
      .locator('[data-testid="transaction-row"]')
      .allTextContents();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toContain(searchLabel);
    }
  });

  it("filters transactions by type=expense", async () => {
    await selectTransactionAccountFilters(page, accountLabel);
    await page.locator('[data-testid="filter-type"]').selectOption("expense");
    await page.waitForFunction(
      () =>
        Array.from(
          document.querySelectorAll('[data-testid="transaction-row"]'),
        ).every((row) => row.textContent?.includes("-")),
      { timeout: 5000 },
    );
    const rows = await page
      .locator('[data-testid="transaction-row"]')
      .allTextContents();
    expect(rows.length).toBeGreaterThan(0);
  });

  it("filters transactions by type=income", async () => {
    await selectTransactionAccountFilters(page, accountLabel);
    await page.locator('[data-testid="filter-type"]').selectOption("income");
    await page.waitForFunction(
      () =>
        Array.from(
          document.querySelectorAll('[data-testid="transaction-row"]'),
        ).every((row) => row.textContent?.includes("3000")),
      { timeout: 5000 },
    );
    const rows = await page
      .locator('[data-testid="transaction-row"]')
      .allTextContents();
    expect(rows.length).toBeGreaterThan(0);
  });

  it("filters transactions by amount range and account", async () => {
    await selectTransactionAccountFilters(page, secondaryAccountLabel);
    await page.locator('[data-testid="filter-amount-min"]').fill("-20");
    await page.locator('[data-testid="filter-amount-max"]').fill("0");
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="transaction-row"]').length ===
        1,
      { timeout: 5000 },
    );
    const rows = await page
      .locator('[data-testid="transaction-row"]')
      .allTextContents();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("Airport Shuttle");
  });

  it("filters transactions by multiple accounts and clears back to all accounts", async () => {
    await selectTransactionAccountFilters(page, [
      accountLabel,
      secondaryAccountLabel,
    ]);
    const url = new URL(page.url());
    expect(url.searchParams.get("accountIds")).toBeTruthy();
    expect(url.searchParams.get("accountId")).toBeNull();

    const rows = await page
      .locator('[data-testid="transaction-row"]')
      .allTextContents();
    expect(rows).toHaveLength(4);
    expect(rows.some((row) => row.includes(accountLabel))).toBe(true);
    expect(rows.some((row) => row.includes(secondaryAccountLabel))).toBe(true);

    await searchTransactions(page, searchLabel);
    await clearTransactionAccountFilters(page);
    const clearedRows = await page
      .locator('[data-testid="transaction-row"]')
      .allTextContents();
    expect(clearedRows).toHaveLength(4);
  });

  it("updates URL params when sorting and resets page", async () => {
    const params = new URLSearchParams({
      accountIds: `${accountId},${secondaryAccountId}`,
      page: "2",
    });
    await page.goto(`${FRONTEND}/transactions?${params.toString()}`);
    await page.waitForSelector('[data-testid="transaction-row"]', {
      timeout: 10000,
    });
    await page.locator('[data-testid="sort-date"]').click();
    await page.waitForFunction(
      () => new URL(window.location.href).searchParams.get("order") === "desc",
      { timeout: 5000 },
    );
    const url = new URL(page.url());
    expect(url.searchParams.get("sort")).toBe("date");
    expect(url.searchParams.get("order")).toBe("desc");
    expect(url.searchParams.get("page")).toBe("1");
  });

  it("supports first and last pagination controls", async () => {
    const paginationRows = Array.from({ length: 52 }, (_, index) => ({
      date: "2025-08-12",
      description: `Pagination Row ${String(index + 1).padStart(2, "0")}`,
      amount: -1.0,
      account: accountLabel,
    }));
    await seedCsvRows(paginationRows);

    const params = new URLSearchParams({
      accountIds: accountId,
      page: "2",
    });
    await page.goto(`${FRONTEND}/transactions?${params.toString()}`);
    await page.waitForSelector('[data-testid="pagination"]', {
      timeout: 10000,
    });

    await page.locator('[data-testid="pagination-first"]').click();
    await page.waitForFunction(
      () => new URL(window.location.href).searchParams.get("page") === "1",
      { timeout: 5000 },
    );
    let url = new URL(page.url());
    expect(url.searchParams.get("page")).toBe("1");

    await page.waitForFunction(
      () => {
        const button = document.querySelector(
          '[data-testid="pagination-last"]',
        );
        return button instanceof HTMLButtonElement && button.disabled === false;
      },
      { timeout: 5000 },
    );
    await page.locator('[data-testid="pagination-last"]').evaluate((el) => {
      (el as HTMLButtonElement).click();
    });
    await page.waitForFunction(
      () => new URL(window.location.href).searchParams.get("page") === "2",
      { timeout: 5000 },
    );
    url = new URL(page.url());
    expect(url.searchParams.get("page")).toBe("2");

    const firstDisabled = await page
      .locator('[data-testid="pagination-first"]')
      .isDisabled();
    const prevDisabled = await page
      .locator('[data-testid="pagination-prev"]')
      .isDisabled();
    const nextDisabled = await page
      .locator('[data-testid="pagination-next"]')
      .isDisabled();
    const lastDisabled = await page
      .locator('[data-testid="pagination-last"]')
      .isDisabled();
    expect(firstDisabled).toBe(false);
    expect(prevDisabled).toBe(false);
    expect(nextDisabled).toBe(true);
    expect(lastDisabled).toBe(true);
  });
});

// ── Tagging — detail page ─────────────────────────────────────────────────────

describe("Tagging — detail page", () => {
  let page: Page;
  let transactionId: string;
  let tagName: string;

  beforeEach(async () => {
    page = await browser.newPage();
    const accountLabel = trackAccount(uniqueLabel("E2E Tagging Detail"));
    tagName = trackTag(uniqueLabel("e2e-detail-tag"));
    await seedCsvRows([
      {
        date: "2025-09-01",
        description: "Tag Test Store Detail",
        amount: -55.0,
        account: accountLabel,
      },
    ]);
    const accounts = await apiJson<Array<{ id: string; label: string }>>(
      "GET",
      "/accounts",
    );
    const account = accounts.find((a) => a.label === accountLabel);
    if (!account) {
      throw new Error(`Missing account: ${accountLabel}`);
    }
    const rows = await getTransactionsForAccount(account.id);
    transactionId = rows[0]!.id;
    await page.goto(`${FRONTEND}/transactions/${transactionId}`);
    await page.waitForSelector('[data-testid="transaction-detail"]', {
      timeout: 10000,
    });
  });

  afterEach(async () => {
    await page.close();
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
    await apiReq("POST", "/transactions/bulk-tag", {
      transactionIds: [transactionId],
      tagNames: [tagName],
      action: "add",
    });
    await page.reload();
    await page.waitForSelector(`[aria-label="Remove tag ${tagName}"]`, {
      timeout: 10000,
    });

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
  let page: Page;
  let tagName: string;
  let firstTransactionId: string;

  beforeEach(async () => {
    page = await browser.newPage();
    const accountLabel = trackAccount(uniqueLabel("E2E Tagging Bulk"));
    tagName = trackTag(uniqueLabel("e2e-bulk-tag"));
    await seedCsvRows([
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
    const accounts = await apiJson<Array<{ id: string; label: string }>>(
      "GET",
      "/accounts",
    );
    const account = accounts.find((a) => a.label === accountLabel);
    if (!account) {
      throw new Error(`Missing account: ${accountLabel}`);
    }
    const rows = await getTransactionsForAccount(account.id);
    firstTransactionId = rows[0]!.id;
    await apiJson("POST", "/tags", { name: tagName });
    await page.goto(`${FRONTEND}/transactions`);
    await page.waitForSelector('[data-testid="transaction-row"]', {
      timeout: 10000,
    });
    await selectTransactionAccountFilters(page, accountLabel);
  });

  afterEach(async () => {
    await page.close();
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
    const firstCheckbox = page
      .locator('[data-testid="transaction-row"] input[type="checkbox"]')
      .first();
    await firstCheckbox.click();
    await page.waitForSelector('[data-testid="bulk-tag-bar"]', {
      timeout: 5000,
    });
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
    await apiReq("POST", "/transactions/bulk-tag", {
      transactionIds: [firstTransactionId],
      tagNames: [tagName],
      action: "add",
    });

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
  let page: Page;

  beforeEach(async () => {
    page = await browser.newPage();
  });

  afterEach(async () => {
    await page.close();
  });

  it("deletes a single selected transaction from the list", async () => {
    const singleAccount = trackAccount(uniqueLabel("E2E Delete Single"));
    await seedCsvRows([
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
    await page.goto(`${FRONTEND}/transactions`);
    await page.waitForSelector('[data-testid="transaction-row"]', {
      timeout: 10000,
    });
    await selectTransactionAccountFilters(page, singleAccount);

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
    const bulkAccount = trackAccount(uniqueLabel("E2E Delete Bulk"));
    await seedCsvRows([
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
    await page.goto(`${FRONTEND}/transactions`);
    await page.waitForSelector('[data-testid="transaction-row"]', {
      timeout: 10000,
    });
    await selectTransactionAccountFilters(page, bulkAccount);

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
  let page: Page;
  let tagName: string;
  let tagId: string;

  beforeEach(async () => {
    page = await browser.newPage();
    const accountLabel = trackAccount(uniqueLabel("E2E Rules"));
    tagName = trackTag(uniqueLabel("e2e-rules-tag"));
    await seedCsvRows([
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
    const tag = await apiJson<{ id: string }>("POST", "/tags", {
      name: tagName,
    });
    tagId = tag.id;
    await page.goto(`${FRONTEND}/rules`);
    await page.waitForSelector('[data-testid="new-rule-btn"]', {
      timeout: 10000,
    });
  });

  afterEach(async () => {
    await page.close();
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
    await page.locator('[data-testid="new-rule-btn"]').click();
    await page.waitForSelector('[data-testid="create-rule-form"]', {
      timeout: 5000,
    });
    await page.waitForFunction(
      (name) =>
        Array.from(
          document.querySelectorAll('[data-testid="rule-tag-select"] option'),
        ).some((option) => option.textContent === name),
      tagName,
      { timeout: 5000 },
    );
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
    const rules = await apiJson<Array<{ id: string }>>("GET", "/rules");
    const createdRule = rules[rules.length - 1];
    if (!createdRule) {
      throw new Error("Rule was not created");
    }
    trackRule(createdRule.id);
    const count = await page.locator('[data-testid="rule-card"]').count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("applies the rule retroactively and shows match result", async () => {
    const created = await apiJson<{ id: string }>("POST", "/rules", {
      tagId,
      conditions: [
        {
          matchField: "description",
          matchType: "contains",
          matchValue: "Starbucks",
        },
      ],
    });
    trackRule(created.id);
    await page.reload();
    await page.waitForSelector('[data-testid="apply-rule-btn"]', {
      timeout: 10000,
    });
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
    const created = await apiJson<{ id: string }>("POST", "/rules", {
      tagId,
      conditions: [
        {
          matchField: "description",
          matchType: "contains",
          matchValue: "Starbucks",
        },
      ],
    });
    trackRule(created.id);
    await page.reload();
    await page.waitForSelector('[data-testid="rule-card"]', {
      timeout: 10000,
    });
    const countBefore = await page.locator('[data-testid="rule-card"]').count();
    await page.locator('[data-testid="delete-rule-btn"]').first().click();
    await page.waitForTimeout(1000);
    const countAfter = await page.locator('[data-testid="rule-card"]').count();
    expect(countAfter).toBe(countBefore - 1);
  });
});

// ── Settings — accounts ───────────────────────────────────────────────────────

describe("Settings", () => {
  let page: Page;
  let accountLabel: string;

  beforeEach(async () => {
    page = await browser.newPage();
    accountLabel = trackAccount(uniqueLabel("E2E Settings Account"));
    await seedCsvRows([
      {
        date: "2025-11-01",
        description: "Settings Test Txn",
        amount: -10.0,
        account: accountLabel,
      },
    ]);
    await page.goto(`${FRONTEND}/settings`);
    await page
      .locator('[data-testid="accounts-list"] li')
      .filter({ hasText: accountLabel })
      .waitFor({ state: "visible", timeout: 10000 });
  });

  afterEach(async () => {
    await page.close();
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
