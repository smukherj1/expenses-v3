import { Hono } from "hono";
import { classifyUpload, finalizeUpload } from "../services/uploadService.js";
import { validate } from "../middleware/validate.js";
import { finalizeUploadSchema } from "../schemas/upload.js";
import { uploadFormats, type UploadFormat } from "../parsers/types.js";
import { ValidationError } from "../middleware/errorHandler.js";

const app = new Hono();

app.post("/", async (c) => {
  const userId = c.get("userId");

  const formData = await c.req.formData();
  const file = formData.get("file");
  const formatValue = formData.get("format");
  const accountLabelValue = formData.get("accountLabel");

  if (!file || typeof file === "string") {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Missing file" } },
      400,
    );
  }

  if (
    typeof formatValue !== "string" ||
    !uploadFormats.includes(formatValue as UploadFormat)
  ) {
    throw new ValidationError("Missing or invalid format");
  }

  const filename = file.name;
  const content = await file.text();
  const result = await classifyUpload(userId, filename, content, {
    format: formatValue as UploadFormat,
    accountLabel:
      typeof accountLabelValue === "string" ? accountLabelValue : undefined,
  });
  return c.json(result, result.status === "completed" ? 201 : 200);
});

app.post("/finalize", validate("json", finalizeUploadSchema), async (c) => {
  const userId = c.get("userId");
  const { transactions } = c.req.valid("json");
  const result = await finalizeUpload(userId, transactions);
  return c.json(result, 201);
});

export default app;
