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

function normalizeAmount(a: string | number): string {
  return String(parseFloat(String(a)));
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

async function findExistingTransactions(
  userId: string,
  txns: ResolvedTransaction[],
): Promise<ResolvedTransaction[]> {
  if (txns.length === 0) {
    return [];
  }
  const dateFrom = txns.reduce(
    (min, t) => (t.date < min ? t.date : min),
    txns[0].date,
  );
  const dateTo = txns.reduce(
    (max, t) => (t.date > max ? t.date : max),
    txns[0].date,
  );

  const accountIds = Array.from(new Set(txns.map((t) => t.accountId)));

  const existing = await db
    .select({
      date: transactions.date,
      amount: transactions.amount,
      description: transactions.description,
      currency: transactions.currency,
      accountId: transactions.accountId,
      account: accounts.label,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      and(
        eq(accounts.userId, userId),
        inArray(transactions.accountId, accountIds),
        gte(transactions.date, dateFrom),
        lte(transactions.date, dateTo),
      ),
    );
  return existing.map((e) => ({
    date: e.date,
    amount: e.amount,
    description: e.description,
    currency: e.currency,
    accountId: e.accountId,
    account: e.account,
  }));
}

export async function uploadFile(
  userId: string,
  filename: string,
  content: string,
) {
  const ext = filename.split(".").pop()?.toLowerCase();
  let parsed: ReturnType<typeof parseCsv>;

  if (ext === "json") {
    parsed = parseJson(content);
  } else {
    parsed = parseCsv(content);
  }

  const { transactions: parsedRows, errors: parseErrors } = parsed;

  if (parseErrors.length > 0) {
    const messages = parseErrors
      .map((e) => `Row ${e.row}: ${e.message}`)
      .join("; ");
    throw new ValidationError(`File contains invalid rows: ${messages}`);
  }

  // Check for non-CAD currencies before creating any accounts
  const nonCad = parsedRows.find((r) => r.currency !== "CAD");
  if (nonCad) {
    throw new UnsupportedCurrencyError(
      `Unsupported currency: ${nonCad.currency}. Only CAD is supported.`,
    );
  }

  const resolvedTxns = await upsertAccounts(userId, parsedRows);

  // Check for duplicates: (date, amount, description) match
  const existingTxns = await findExistingTransactions(userId, resolvedTxns);
  const existingSet = new Set(
    existingTxns.map(
      (t) =>
        `${t.date}|${normalizeAmount(t.amount)}|${t.description}|${t.account}`,
    ),
  );

  const toInsert = [];
  const duplicateWarnings = [];

  for (const row of resolvedTxns) {
    const key = `${row.date}|${normalizeAmount(row.amount)}|${row.description}|${row.account}`;
    if (existingSet.has(key)) {
      duplicateWarnings.push(row);
    } else {
      toInsert.push(row);
      existingSet.add(key);
    }
  }

  if (toInsert.length === 0) {
    return {
      inserted: 0,
      duplicatesSkipped: duplicateWarnings.length,
      duplicateWarnings,
    };
  }

  // Bulk insert transactions
  let insertedIds: string[] = [];
  const inserted = await db
    .insert(transactions)
    .values(
      toInsert.map((r) => ({
        userId,
        accountId: r.accountId,
        date: r.date,
        description: r.description,
        amount: String(r.amount),
        currency: r.currency,
      })),
    )
    .returning({ id: transactions.id });
  insertedIds = inserted.map((r) => r.id);

  // Apply auto-tag rules to new transactions
  await applyAllRulesToTransactions(userId, insertedIds);

  return {
    inserted: toInsert.length,
    duplicatesSkipped: duplicateWarnings.length,
    duplicateWarnings,
  };
}
