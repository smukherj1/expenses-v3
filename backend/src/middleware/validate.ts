import { zValidator } from "@hono/zod-validator";
import type { ZodSchema } from "zod";

type Target = "json" | "query" | "param" | "form" | "header";

export function validate(target: Target, schema: ZodSchema) {
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
