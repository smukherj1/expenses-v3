import { createMiddleware } from "hono/factory";

export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

declare module "hono" {
  interface ContextVariableMap {
    userId: string;
  }
}

export const defaultUserMiddleware = createMiddleware(async (c, next) => {
  c.set("userId", DEFAULT_USER_ID);
  await next();
});
