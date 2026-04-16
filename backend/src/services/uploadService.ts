import { eq, and, inArray, gte, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { transactions, accounts } from "../db/schema.js";
import {
  UnsupportedCurrencyError,
  ValidationError,
} from "../middleware/errorHandler.js";
import { ParsedTransaction } from "../parsers/schema.js";
import { parseCsv } from "../parsers/csv.js";
import { parseJson } from "../parsers/json.js";
import { applyAllRulesToTransactions } from "./ruleService.js";

// Transaction with fields like account ID resolved from the db.
interface ResolvedTransaction extends ParsedTransaction {
  accountId: string;
}

interface ReviewTransaction {
  rowNumber: number;
  date: string;
  description: string;
  amount: number;
  currency: string;
  account: string;
  duplicate: boolean;
}

interface FinalizeUploadRow {
  date: string;
  description: string;
  amount: string | number;
  currency: string;
  account: string;
  allowDuplicate?: boolean;
}

function parseUploadContent(filename: string, content: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  try {
    if (ext === "json") {
      return parseJson(content);
    }
    return parseCsv(content);
  } catch (err) {
    if (err instanceof SyntaxError || err instanceof Error) {
      throw new ValidationError(err.message);
    }
    throw err;
  }
}

function normalizeAmount(a: string | number): string {
  return String(parseFloat(String(a)));
}

function duplicateKey(row: {
  date: string;
  amount: string | number;
  description: string;
  account: string;
}) {
  return `${row.date}|${normalizeAmount(row.amount)}|${row.description}|${row.account}`;
}

function assertCadCurrency(rows: { currency: string }[]) {
  const nonCad = rows.find((r) => r.currency !== "CAD");
  if (nonCad) {
    throw new UnsupportedCurrencyError(
      `Unsupported currency: ${nonCad.currency}. Only CAD is supported.`,
    );
  }
}

async function findExistingAccountsByLabel(userId: string, labels: string[]) {
  if (labels.length === 0) return [];
  return db
    .select({ id: accounts.id, label: accounts.label })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), inArray(accounts.label, labels)));
}

async function upsertAccounts(
  userId: string,
  transactions: ParsedTransaction[],
): Promise<ResolvedTransaction[]> {
  const accountLabels = Array.from(new Set(transactions.map((t) => t.account)));

  const existingAccounts = await db
    .select({ id: accounts.id, label: accounts.label })
    .from(accounts)
    .where(
      and(eq(accounts.userId, userId), inArray(accounts.label, accountLabels)),
    );

  const missingAccounts = accountLabels.filter(
    (label) => !existingAccounts.some((a) => a.label === label),
  );

  const newAccounts =
    missingAccounts.length > 0
      ? await db
          .insert(accounts)
          .values(missingAccounts.map((label) => ({ userId, label })))
          .returning({ id: accounts.id, label: accounts.label })
      : [];

  const allAccounts = [...existingAccounts, ...newAccounts];

  return transactions.map((t) => {
    const acct = allAccounts.find((a) => a.label === t.account);
    if (!acct) {
      // Shouldn't happen because we just inserted missing accounts above but maybe something weird
      // like the account got deleted in between?
      throw new Error(
        `Failed to find or create account for label ${t.account}`,
      );
    }
    return { ...t, accountId: acct.id };
  });
}

async function classifyDuplicateRows(
  userId: string,
  rows: ParsedTransaction[],
): Promise<ReviewTransaction[]> {
  const accountLabels = Array.from(new Set(rows.map((row) => row.account)));
  const existingAccounts = await findExistingAccountsByLabel(
    userId,
    accountLabels,
  );
  const existingAccountIds = existingAccounts.map((account) => account.id);
  const existingKeySet = new Set<string>();

  if (existingAccountIds.length > 0) {
    const dateFrom = rows.reduce(
      (min, row) => (row.date < min ? row.date : min),
      rows[0]!.date,
    );
    const dateTo = rows.reduce(
      (max, row) => (row.date > max ? row.date : max),
      rows[0]!.date,
    );

    const existing = await db
      .select({
        date: transactions.date,
        amount: transactions.amount,
        description: transactions.description,
        account: accounts.label,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(
        and(
          eq(accounts.userId, userId),
          inArray(transactions.accountId, existingAccountIds),
          gte(transactions.date, dateFrom),
          lte(transactions.date, dateTo),
        ),
      );

    for (const row of existing) {
      existingKeySet.add(duplicateKey(row));
    }
  }

  return rows.map((row, index) => {
    const key = duplicateKey(row);
    const duplicate = existingKeySet.has(key);
    return {
      rowNumber: index + 1,
      date: row.date,
      description: row.description,
      amount: parseFloat(row.amount),
      currency: row.currency,
      account: row.account,
      duplicate,
    };
  });
}

async function insertUploadRows(userId: string, rows: ResolvedTransaction[]) {
  if (rows.length === 0) {
    return [];
  }

  const inserted = await db
    .insert(transactions)
    .values(
      rows.map((row) => ({
        userId,
        accountId: row.accountId,
        date: row.date,
        description: row.description,
        amount: String(row.amount),
        currency: row.currency,
      })),
    )
    .returning({ id: transactions.id });

  const insertedIds = inserted.map((row) => row.id);
  await applyAllRulesToTransactions(userId, insertedIds);
  return insertedIds;
}

export async function classifyUpload(
  userId: string,
  filename: string,
  content: string,
) {
  const parsed = parseUploadContent(filename, content);

  const { transactions: parsedRows, errors: parseErrors } = parsed;

  if (parseErrors.length > 0) {
    const messages = parseErrors
      .map((e) => `Row ${e.row}: ${e.message}`)
      .join("; ");
    throw new ValidationError(`File contains invalid rows: ${messages}`);
  }

  assertCadCurrency(parsedRows);

  if (parsedRows.length === 0) {
    return {
      status: "completed" as const,
      summary: {
        inserted: 0,
        duplicates: 0,
      },
    };
  }

  const classified = await classifyDuplicateRows(userId, parsedRows);
  const duplicates = classified.filter((row) => row.duplicate).length;

  if (duplicates > 0) {
    return {
      status: "needs_review" as const,
      summary: {
        inserted: 0,
        duplicates,
      },
      transactions: classified,
    };
  }

  const resolvedTxns = await upsertAccounts(userId, parsedRows);
  await insertUploadRows(userId, resolvedTxns);

  return {
    status: "completed" as const,
    summary: {
      inserted: resolvedTxns.length,
      duplicates: 0,
    },
  };
}

export async function finalizeUpload(
  userId: string,
  rows: FinalizeUploadRow[],
) {
  if (rows.length === 0) {
    return {
      status: "completed" as const,
      inserted: 0,
      duplicates: 0,
    };
  }

  assertCadCurrency(rows);

  const parsedRows: ParsedTransaction[] = rows.map((row) => ({
    date: row.date,
    description: row.description,
    amount: String(row.amount),
    currency: row.currency,
    account: row.account,
  }));

  const duplicateReviews = await classifyDuplicateRows(userId, parsedRows);
  const duplicateCount = duplicateReviews.filter((row) => row.duplicate).length;
  const rejected = duplicateReviews.filter(
    (row, index) => row.duplicate && !rows[index]?.allowDuplicate,
  );

  if (rejected.length > 0) {
    throw new ValidationError(
      `Duplicate rows require allowDuplicate: row ${rejected[0]?.rowNumber}`,
    );
  }

  const resolvedTxns = await upsertAccounts(userId, parsedRows);
  await insertUploadRows(userId, resolvedTxns);

  return {
    status: "completed" as const,
    inserted: resolvedTxns.length,
    duplicates: duplicateCount,
  };
}
