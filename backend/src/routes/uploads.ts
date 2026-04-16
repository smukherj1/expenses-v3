import { Hono } from "hono";
import { classifyUpload, finalizeUpload } from "../services/uploadService.js";
import { validate } from "../middleware/validate.js";
import { finalizeUploadSchema } from "../schemas/upload.js";

const app = new Hono();

app.post("/", async (c) => {
  const userId = c.get("userId");

  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Missing file" } },
      400,
    );
  }

  const filename = file.name;
  const content = await file.text();
  const result = await classifyUpload(userId, filename, content);
  return c.json(result, result.status === "completed" ? 201 : 200);
});

app.post("/finalize", validate("json", finalizeUploadSchema), async (c) => {
  const userId = c.get("userId");
  const { transactions } = c.req.valid("json");
  const result = await finalizeUpload(userId, transactions);
  return c.json(result, 201);
});

export default app;
