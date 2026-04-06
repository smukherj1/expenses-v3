import { z } from "zod";

export const conditionSchema = z.object({
  matchField: z.enum(["description", "amount"]),
  matchType: z.enum(["contains", "exact", "regex", "gt", "lt"]),
  matchValue: z.string().min(1),
});

export const createRuleSchema = z.object({
  tagId: z.string().uuid(),
  conditions: z.array(conditionSchema).min(1),
});

export const updateRuleSchema = createRuleSchema;
