import { Hono } from "hono";
import {
  monthlySummarySchema,
  categoryBreakdownSchema,
  trendSchema,
  topTransactionsSchema,
} from "../schemas/analytics.js";
import {
  getMonthlySummary,
  getCategoryBreakdown,
  getTrend,
  getTopTransactions,
} from "../services/analyticsService.js";
import { validate } from "../middleware/validate.js";

const app = new Hono();

app.get(
  "/monthly-summary",
  validate("query", monthlySummarySchema),
  async (c) => {
    const userId = c.get("userId");
    const { year } = c.req.valid("query");
    const data = await getMonthlySummary(userId, year);
    return c.json(data);
  },
);

app.get(
  "/category-breakdown",
  validate("query", categoryBreakdownSchema),
  async (c) => {
    const userId = c.get("userId");
    const { year, month } = c.req.valid("query");
    const data = await getCategoryBreakdown(userId, year, month);
    return c.json(data);
  },
);

app.get("/trend", validate("query", trendSchema), async (c) => {
  const userId = c.get("userId");
  const { tag, months } = c.req.valid("query");
  const data = await getTrend(userId, tag, months);
  return c.json(data);
});

app.get(
  "/top-transactions",
  validate("query", topTransactionsSchema),
  async (c) => {
    const userId = c.get("userId");
    const params = c.req.valid("query");
    const data = await getTopTransactions(userId, params);
    return c.json(data);
  },
);

export default app;
