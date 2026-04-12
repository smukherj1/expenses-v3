import type { ParsedTransaction } from "./schema.js";
import { rowSchema } from "./schema.js";

export function parseJson(content: string): {
  transactions: ParsedTransaction[];
  errors: Array<{ row: number; message: string }>;
} {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error("JSON must be an array of transaction objects");
  }

  const transactions: ParsedTransaction[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < parsed.length; i++) {
    const result = rowSchema.safeParse(parsed[i]);
    if (result.success) {
      transactions.push({
        date: result.data.date,
        description: result.data.description,
        amount: result.data.amount,
        currency: result.data.currency,
        account: result.data.account,
      });
    } else {
      errors.push({ row: i + 1, message: result.error.message });
    }
  }

  return { transactions, errors };
}
