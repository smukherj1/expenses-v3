import { Hono } from "hono";
import { defaultUserMiddleware } from "./middleware/defaultUser.js";
import { errorHandler } from "./middleware/errorHandler.js";
import accountRoutes from "./routes/accounts.js";
import uploadRoutes from "./routes/uploads.js";
import transactionRoutes from "./routes/transactions.js";
import tagRoutes from "./routes/tags.js";
import ruleRoutes from "./routes/rules.js";
import analyticsRoutes from "./routes/analytics.js";
import { uploadFile } from "./services/uploadService.js";
import { seedDefaultUser } from "./db/seed.js";

const app = new Hono();

app.use("*", defaultUserMiddleware);

app.route("/api/accounts", accountRoutes);
app.route("/api/uploads", uploadRoutes);
app.route("/api/transactions", transactionRoutes);
app.route("/api/tags", tagRoutes);
app.route("/api/rules", ruleRoutes);
app.route("/api/analytics", analyticsRoutes);

app.notFound((c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404),
);

app.onError(errorHandler);

await seedDefaultUser();

const port = parseInt(process.env.PORT ?? "3000");

Bun.serve({
  port,
  fetch: app.fetch,
  // Number of seconds to wait before closing idle connections. Default is 10s.
  idleTimeout: 60,
});

console.log(`Backend server listening on :${port}`);
