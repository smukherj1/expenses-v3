import { z } from "zod";

const accountIdsSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    return value;
  }

  const ids = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return ids.length > 0 ? ids : undefined;
}, z.array(z.string().uuid()).optional());

export const listTransactionsSchema = z.object({
  q: z.string().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  amountMin: z.coerce.number().optional(),
  amountMax: z.coerce.number().optional(),
  accountIds: accountIdsSchema,
  tags: z.string().optional(),
  type: z.enum(["income", "expense"]).optional(),
  sort: z.enum(["date", "amount", "description", "account"]).default("date"),
  order: z.enum(["asc", "desc"]).default("asc"),
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

export const bulkDeleteSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1),
});
