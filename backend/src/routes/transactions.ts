import { Hono } from "hono";
import {
  listTransactionsSchema,
  updateTransactionSchema,
  bulkTagSchema,
  bulkDeleteSchema,
} from "../schemas/transaction.js";
import {
  listTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  bulkDeleteTransactions,
  bulkTag,
} from "../services/transactionService.js";
import { validate } from "../middleware/validate.js";

const app = new Hono();

app.get("/", validate("query", listTransactionsSchema), async (c) => {
  const userId = c.get("userId");
  const params = c.req.valid("query");
  const result = await listTransactions(userId, params);
  return c.json(result);
});

app.post("/bulk-tag", validate("json", bulkTagSchema), async (c) => {
  const userId = c.get("userId");
  const { transactionIds, tagNames, action } = c.req.valid("json");
  const result = await bulkTag(userId, transactionIds, tagNames, action);
  return c.json(result);
});

app.post("/bulk-delete", validate("json", bulkDeleteSchema), async (c) => {
  const userId = c.get("userId");
  const { transactionIds } = c.req.valid("json");
  const result = await bulkDeleteTransactions(userId, transactionIds);
  return c.json(result);
});

app.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const txn = await getTransactionById(userId, id);
  return c.json(txn);
});

app.patch("/:id", validate("json", updateTransactionSchema), async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const update = c.req.valid("json");
  const txn = await updateTransaction(userId, id, update);
  return c.json(txn);
});

app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  await deleteTransaction(userId, id);
  return c.body(null, 204);
});

export default app;
