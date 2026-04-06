import { Hono } from "hono";
import { createTagSchema } from "../schemas/tag.js";
import { listTags, createTag, deleteTag } from "../services/tagService.js";
import { validate } from "../middleware/validate.js";

const app = new Hono();

app.get("/", async (c) => {
  const userId = c.get("userId");
  const data = await listTags(userId);
  return c.json(data);
});

app.post("/", validate("json", createTagSchema), async (c) => {
  const userId = c.get("userId");
  const { name } = c.req.valid("json");
  const tag = await createTag(userId, name);
  return c.json(tag, 201);
});

app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  await deleteTag(userId, id);
  return c.body(null, 204);
});

export default app;
