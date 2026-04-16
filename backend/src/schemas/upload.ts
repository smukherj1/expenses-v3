import { z } from "zod";

export const uploadFinalizeRowSchema = z.object({
  date: z.string().trim().min(1),
  description: z.string().trim().min(1),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().trim().min(1),
  account: z.string().trim().min(1),
  allowDuplicate: z.boolean().optional(),
});

export const finalizeUploadSchema = z.object({
  transactions: z.array(uploadFinalizeRowSchema),
});
