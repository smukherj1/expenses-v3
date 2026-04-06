import { z } from "zod";
import type { ParsedTransaction } from "./csv.js";
import { isValidDate } from "./csv.js";

const rowSchema = z.object({
  date: z.string().min(1).refine(isValidDate, {
    message: "Invalid date format. Expected yyyy-mm-dd.",
  }),
  description: z.string().min(1),
  amount: z.number(),
  currency: z.string().default("CAD"),
  account: z.string().min(1),
});

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
