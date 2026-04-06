import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { accounts } from "../db/schema.js";
import { NotFoundError, ConflictError } from "../middleware/errorHandler.js";

export async function listAccounts(userId: string) {
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(accounts.createdAt);
}

export async function createAccount(userId: string, label: string) {
  // Check for duplicate
  const existing = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.label, label)))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError(`Account with label "${label}" already exists`);
  }

  const [account] = await db
    .insert(accounts)
    .values({ userId, label })
    .returning();
  return account!;
}

export async function deleteAccount(userId: string, id: string) {
  const existing = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError(`Account ${id} not found`);
  }

  await db.delete(accounts).where(eq(accounts.id, id));
}
