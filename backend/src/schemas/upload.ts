import { z } from "zod";
import { normalizeTags } from "../parsers/schema.js";

export const uploadFinalizeRowSchema = z.object({
  date: z.string().trim().min(1),
  description: z.string().trim().min(1),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().trim().min(1),
  account: z.string().trim().min(1),
  tags: z
    .array(z.string())
    .optional()
    .transform((value) => normalizeTags(value)),
  allowDuplicate: z.boolean().optional(),
});

export const finalizeUploadSchema = z.object({
  transactions: z.array(uploadFinalizeRowSchema),
});
