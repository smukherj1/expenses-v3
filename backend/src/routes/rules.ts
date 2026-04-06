import { Hono } from "hono";
import { createRuleSchema, updateRuleSchema } from "../schemas/rule.js";
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
  applyRule,
  applyAllRules,
} from "../services/ruleService.js";
import { validate } from "../middleware/validate.js";

const app = new Hono();

app.get("/", async (c) => {
  const userId = c.get("userId");
  const data = await listRules(userId);
  return c.json(data);
});

app.post("/", validate("json", createRuleSchema), async (c) => {
  const userId = c.get("userId");
  const { tagId, conditions } = c.req.valid("json");
  const rule = await createRule(userId, tagId, conditions);
  return c.json(rule, 201);
});

app.post("/apply-all", async (c) => {
  const userId = c.get("userId");
  const result = await applyAllRules(userId);
  return c.json(result);
});

app.put("/:id", validate("json", updateRuleSchema), async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const { tagId, conditions } = c.req.valid("json");
  const rule = await updateRule(userId, id, tagId, conditions);
  return c.json(rule);
});

app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  await deleteRule(userId, id);
  return c.body(null, 204);
});

app.post("/:id/apply", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const result = await applyRule(userId, id);
  return c.json(result);
});

export default app;
