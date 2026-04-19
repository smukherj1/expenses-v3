import Papa from "papaparse";
import {
  rowSchema,
  type ParsedTransaction,
  type ParseError,
} from "../schema.js";
import { combineDebitCredit } from "../money.js";
import { normalizeIsoDate } from "../dates.js";
import { ValidationError } from "../../middleware/errorHandler.js";

export function parseTdCanada(
  content: string,
  accountLabel: string,
): { transactions: ParsedTransaction[]; errors: ParseError[] } {
  const result = Papa.parse<string[]>(content, {
    header: false,
    skipEmptyLines: true,
  });

  const transactions: ParsedTransaction[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < result.data.length; i++) {
    const row = result.data[i] ?? [];
    const rowNum = i + 1;

    if (row.length < 4) {
      errors.push({ row: rowNum, message: "Missing required columns" });
      continue;
    }

    try {
      const parsed = rowSchema.safeParse({
        date: normalizeIsoDate(row[0] ?? "", rowNum),
        description: (row[1] ?? "").trim(),
        amount: combineDebitCredit(row[2], row[3]),
        currency: "CAD",
        account: accountLabel.trim(),
      });

      if (!parsed.success) {
        errors.push({
          row: rowNum,
          message: parsed.error.issues[0]?.message ?? "Invalid row",
        });
        continue;
      }

      transactions.push(parsed.data);
    } catch (err) {
      if (err instanceof ValidationError) {
        errors.push({
          row: rowNum,
          message: err.message.replace(/^Row \d+:\s*/, ""),
        });
        continue;
      }
      throw err;
    }
  }

  return { transactions, errors };
}
