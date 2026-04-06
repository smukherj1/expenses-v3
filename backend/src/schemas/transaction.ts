import { z } from "zod";

export const listTransactionsSchema = z.object({
  q: z.string().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  amountMin: z.coerce.number().optional(),
  amountMax: z.coerce.number().optional(),
  accountId: z.string().uuid().optional(),
  tags: z.string().optional(),
  type: z.enum(["income", "expense"]).optional(),
  sort: z.enum(["date", "amount", "description"]).default("date"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const updateTransactionSchema = z.object({
  description: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
});

export const bulkTagSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1),
  tagNames: z.array(z.string().min(1)).min(1),
  action: z.enum(["add", "remove"]),
});
