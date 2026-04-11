import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod/v4";

type Target = "json" | "query" | "param" | "form" | "header";

export function validate<TTarget extends Target, TSchema extends ZodType>(
  target: TTarget,
  schema: TSchema,
) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: result.error.message,
          },
        },
        400,
      );
    }
  });
}
