import { z } from 'zod/v4'

const TxnSchema = z.object({
  id: z.number(),
  date: z.string(),
  description: z.string(),
  amount: z.number(),
  institution: z.string(),
  tag: z
    .string()
    .nullish()
    .transform((x) => x ?? undefined),
})

export type Txn = z.infer<typeof TxnSchema>

export const TxnSearchRequestSchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  description: z.string().optional(),
  fromAmount: z.number().optional(),
  toAmount: z.number().optional(),
  institution: z.string().optional(),
  tag: z.string().optional(),
  pageSize: z.number().optional(),
  pageToken: z.string().optional(),
})

export type TxnSearchRequest = z.infer<typeof TxnSearchRequestSchema>

export const TxnSearchResponseSchema = z.object({
  transactions: z.array(TxnSchema).optional().default([]),
  nextPageToken: z
    .string()
    .nullish()
    .transform((x) => x ?? undefined),
})

export type TxnSearchResponse = z.infer<typeof TxnSearchResponseSchema>

export const TxnUploadRequestSchema = z.array(TxnSchema.omit({ id: true }))
export type TxnUploadRequest = z.infer<typeof TxnUploadRequestSchema>
