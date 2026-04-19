import Papa from "papaparse";
import {
  rowSchema,
  type ParsedTransaction,
  type ParseError,
} from "../schema.js";
import { parseAmexDate } from "../dates.js";
import { parseMoney } from "../money.js";

export function parseAmexCanada(
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
      const sourceAmount = parseMoney(row["Amount"] ?? "", rowNum);
      const parsed = rowSchema.safeParse({
        date: parseAmexDate(row["Date"] ?? "", rowNum),
        description: (row["Description"] ?? "").trim(),
        amount: String(-parseFloat(sourceAmount)),
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
