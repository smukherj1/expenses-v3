import Papa from "papaparse";
import {
  rowSchema,
  type ParsedTransaction,
  type ParseError,
} from "../schema.js";
import { parseRbcDate } from "../dates.js";
import { parseMoney } from "../money.js";

function parseDescription(row: Record<string, string>): string {
  const pieces = [row["Description 1"], row["Description 2"]]
    .map((part) => part?.trim())
    .filter(Boolean);
  return pieces.join(" ");
}

export function parseRbcCanada(
  content: string,
  accountLabel: string,
): { transactions: ParsedTransaction[]; errors: ParseError[] } {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });

  const transactions: ParsedTransaction[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < result.data.length; i++) {
    const row = result.data[i] ?? {};
    const rowNum = i + 2;

    try {
      if ((row["USD$"] ?? "").trim().length > 0) {
        errors.push({ row: rowNum, message: "USD$ values are not supported" });
        continue;
      }

      const parsed = rowSchema.safeParse({
        date: parseRbcDate(row["Transaction Date"] ?? "", rowNum),
        description: parseDescription(row),
        amount: parseMoney(row["CAD$"] ?? "", rowNum),
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
      errors.push({
        row: rowNum,
        message:
          err instanceof Error
            ? err.message.replace(/^Row \d+:\s*/, "")
            : "Invalid row",
      });
    }
  }

  return { transactions, errors };
}
