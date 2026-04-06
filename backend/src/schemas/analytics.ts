import { z } from "zod";

export const monthlySummarySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});

export const categoryBreakdownSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const trendSchema = z.object({
  tag: z.string().min(1),
  months: z.coerce.number().int().min(1).max(60).default(12),
});

export const topTransactionsSchema = z.object({
  n: z.coerce.number().int().min(1).max(100).default(10),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  type: z.enum(["income", "expense"]).optional(),
});
