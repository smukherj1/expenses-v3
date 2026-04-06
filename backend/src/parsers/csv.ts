import Papa from "papaparse";

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  currency: string;
  account: string;
}

export interface ParseError {
  row: number;
  message: string;
}

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

export function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

  const [year, month, day] = dateStr.split("-").map(Number);

  // Months are 0-indexed in JS/TS.
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
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
    const currency = currencyKey ? (row[currencyKey]?.trim() ?? "CAD") : "CAD";

    if (!isValidDate(date)) {
      errors.push({
        row: rowNum,
        message: `Invalid date: ${date}, expecting yyyy-mm-dd format`,
      });
      continue;
    }

    if (!description) {
      errors.push({ row: rowNum, message: "Empty description" });
      continue;
    }

    // Amount: try direct amount column, then debit/credit
    let amount: number;
    const amountKey = findColumn(row, AMOUNT_COLUMNS);
    if (amountKey) {
      amount = parseFloat(row[amountKey]!);
    } else {
      const debitKey = findColumn(row, DEBIT_COLUMNS);
      const creditKey = findColumn(row, CREDIT_COLUMNS);
      const debit = debitKey ? parseFloat(row[debitKey]!) || 0 : 0;
      const credit = creditKey ? parseFloat(row[creditKey]!) || 0 : 0;
      amount = credit - debit;
    }

    if (isNaN(amount)) {
      errors.push({ row: rowNum, message: "Invalid amount" });
      continue;
    }

    const accountKey = findColumn(row, ACCOUNT_COLUMNS);
    if (!accountKey) {
      errors.push({ row: rowNum, message: "Missing account column" });
      continue;
    }
    const account = row[accountKey]!.trim();

    transactions.push({ date, description, amount, currency, account });
  }

  return { transactions, errors };
}
