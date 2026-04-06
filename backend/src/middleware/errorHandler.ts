import type { Context } from "hono";
import { ZodError } from "zod";

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message = "Conflict") {
    super(message);
    this.name = "ConflictError";
  }
}

export class UnsupportedCurrencyError extends Error {
  constructor(message = "Unsupported currency") {
    super(message);
    this.name = "UnsupportedCurrencyError";
  }
}

export class ValidationError extends Error {
  constructor(message = "Validation error") {
    super(message);
    this.name = "ValidationError";
  }
}

export function errorHandler(err: Error, c: Context) {
  if (err instanceof ZodError) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: err.message } },
      400,
    );
  }
  if (err instanceof ValidationError) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: err.message } },
      400,
    );
  }
  if (err instanceof NotFoundError) {
    return c.json({ error: { code: "NOT_FOUND", message: err.message } }, 404);
  }
  if (err instanceof ConflictError) {
    return c.json({ error: { code: "CONFLICT", message: err.message } }, 409);
  }
  if (err instanceof UnsupportedCurrencyError) {
    return c.json(
      { error: { code: "UNSUPPORTED_CURRENCY", message: err.message } },
      422,
    );
  }
  console.error("Unhandled error:", err);
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    500,
  );
}
