import { z } from "zod";

export const rowSchema = z.object({
  date: z.string().trim().min(1).refine(isValidDate, {
    message: "Invalid date format. Expected yyyy-mm-dd.",
  }),
  description: z.string().trim().min(1),
  amount: z
    .string()
    .trim()
    .max(10)
    .regex(/^-?\d+(?:\.\d{1,2})?$/, "Must be a valid monetary amount"),
  currency: z.string().trim().default("CAD"),
  account: z.string().trim().min(1),
});

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

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: string;
  currency: string;
  account: string;
}

export interface ParseError {
  row: number;
  message: string;
}
