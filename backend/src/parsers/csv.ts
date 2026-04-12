import Papa from "papaparse";
import { rowSchema, ParsedTransaction, ParseError } from "./schema.js";

const DATE_COLUMNS = ["date", "Date", "Transaction Date", "Posted Date"];
const DESCRIPTION_COLUMNS = ["description", "Description", "Memo", "Name"];
const AMOUNT_COLUMNS = ["amount", "Amount"];
const DEBIT_COLUMNS = ["Debit", "debit"];
const CREDIT_COLUMNS = ["Credit", "credit"];
const CURRENCY_COLUMNS = ["currency", "Currency"];
const ACCOUNT_COLUMNS = ["account", "Account", "Account Name"];

function findColumn(row: Record<string, string>, candidates: string[]) {
  for (const key of candidates) {
    if (key in row && row[key] !== undefined && row[key] !== "") return key;
  }
  return null;
}

export function parseCsv(content: string): {
  transactions: ParsedTransaction[];
  errors: ParseError[];
} {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });

  const transactions: ParsedTransaction[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < result.data.length; i++) {
    const row = result.data[i]!;
    const rowNum = i + 2; // 1-indexed, +1 for header

    const dateKey = findColumn(row, DATE_COLUMNS);
    const descKey = findColumn(row, DESCRIPTION_COLUMNS);
    const currencyKey = findColumn(row, CURRENCY_COLUMNS);

    if (!dateKey) {
      errors.push({ row: rowNum, message: "Missing date column" });
      continue;
    }
    if (!descKey) {
      errors.push({ row: rowNum, message: "Missing description column" });
      continue;
    }

    const date = row[dateKey]!.trim();
    const description = row[descKey]!.trim();
    const currency = currencyKey ? row[currencyKey]?.trim() : undefined;

    // Amount: try direct amount column, then debit/credit
    let amount: string;
    const amountKey = findColumn(row, AMOUNT_COLUMNS);
    if (amountKey) {
      amount = row[amountKey]!.trim();
    } else {
      const debitKey = findColumn(row, DEBIT_COLUMNS);
      const creditKey = findColumn(row, CREDIT_COLUMNS);
      const debit = debitKey ? parseFloat(row[debitKey]!) || 0 : 0;
      const credit = creditKey ? parseFloat(row[creditKey]!) || 0 : 0;
      amount = (credit - debit).toFixed(2);
    }

    const accountKey = findColumn(row, ACCOUNT_COLUMNS);
    if (!accountKey) {
      errors.push({ row: rowNum, message: "Missing account column" });
      continue;
    }

    const parsedRow = rowSchema.safeParse({
      date,
      description,
      amount,
      currency,
      account: row[accountKey]!.trim(),
    });

    if (!parsedRow.success) {
      errors.push({
        row: rowNum,
        message: parsedRow.error.issues[0]?.message,
      });
      continue;
    }

    transactions.push(parsedRow.data);
  }

  return { transactions, errors };
}
