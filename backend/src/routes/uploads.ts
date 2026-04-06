import { Hono } from "hono";
import { uploadFile } from "../services/uploadService.js";

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
  const result = await uploadFile(userId, filename, content);
  return c.json(result, 201);
});

export default app;
