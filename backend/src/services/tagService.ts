import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { tags } from "../db/schema.js";
import { ConflictError, NotFoundError } from "../middleware/errorHandler.js";

export async function listTags(userId: string) {
  return db
    .select()
    .from(tags)
    .where(eq(tags.userId, userId))
    .orderBy(tags.name);
}

export async function createTag(userId: string, name: string) {
  const existing = await db
    .select()
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.name, name)))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError(`Tag "${name}" already exists`);
  }

  const [tag] = await db.insert(tags).values({ userId, name }).returning();
  return tag!;
}

export async function deleteTag(userId: string, id: string) {
  const existing = await db
    .select()
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError(`Tag ${id} not found`);
  }

  await db.delete(tags).where(eq(tags.id, id));
}

export async function getOrCreateTag(userId: string, name: string) {
  const existing = await db
    .select()
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.name, name)))
    .limit(1);

  if (existing.length > 0) return existing[0]!;

  const [tag] = await db.insert(tags).values({ userId, name }).returning();
  return tag!;
}
