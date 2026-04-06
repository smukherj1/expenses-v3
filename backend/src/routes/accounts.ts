import { Hono } from "hono";
import { listAccounts, deleteAccount } from "../services/accountService.js";

const app = new Hono();

app.get("/", async (c) => {
  const userId = c.get("userId");
  const data = await listAccounts(userId);
  return c.json(data);
});

app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  await deleteAccount(userId, id);
  return c.body(null, 204);
});

export default app;
