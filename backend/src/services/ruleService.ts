import { eq, and, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  autoTagRules,
  autoTagRuleConditions,
  transactions,
  accounts,
  transactionTags,
  tags,
} from "../db/schema.js";
import { NotFoundError } from "../middleware/errorHandler.js";

interface Condition {
  id: string;
  ruleId: string;
  matchField: string;
  matchType: string;
  matchValue: string;
}

interface Transaction {
  id: string;
  description: string;
  amount: string | number;
}

function matchesCondition(txn: Transaction, condition: Condition): boolean {
  const value =
    condition.matchField === "description"
      ? String(txn.description)
      : String(txn.amount);

  switch (condition.matchType) {
    case "contains":
      return value.toLowerCase().includes(condition.matchValue.toLowerCase());
    case "exact":
      return value === condition.matchValue;
    case "regex":
      return new RegExp(condition.matchValue, "i").test(value);
    case "gt":
      return parseFloat(value) > parseFloat(condition.matchValue);
    case "lt":
      return parseFloat(value) < parseFloat(condition.matchValue);
    default:
      return false;
  }
}

function matchesRule(txn: Transaction, conditions: Condition[]): boolean {
  return conditions.every((c) => matchesCondition(txn, c));
}

export async function listRules(userId: string) {
  const rules = await db
    .select()
    .from(autoTagRules)
    .where(eq(autoTagRules.userId, userId));

  const rulesWithConditions = await Promise.all(
    rules.map(async (rule) => {
      const conditions = await db
        .select()
        .from(autoTagRuleConditions)
        .where(eq(autoTagRuleConditions.ruleId, rule.id));
      return { ...rule, conditions };
    }),
  );

  return rulesWithConditions;
}

export async function createRule(
  userId: string,
  tagId: string,
  conditions: Array<{
    matchField: string;
    matchType: string;
    matchValue: string;
  }>,
) {
  const [rule] = await db
    .insert(autoTagRules)
    .values({ userId, tagId })
    .returning();

  await db.insert(autoTagRuleConditions).values(
    conditions.map((c) => ({
      ruleId: rule!.id,
      matchField: c.matchField,
      matchType: c.matchType,
      matchValue: c.matchValue,
    })),
  );

  const ruleConditions = await db
    .select()
    .from(autoTagRuleConditions)
    .where(eq(autoTagRuleConditions.ruleId, rule!.id));

  return { ...rule!, conditions: ruleConditions };
}

export async function updateRule(
  userId: string,
  id: string,
  tagId: string,
  conditions: Array<{
    matchField: string;
    matchType: string;
    matchValue: string;
  }>,
) {
  const existing = await db
    .select()
    .from(autoTagRules)
    .where(and(eq(autoTagRules.id, id), eq(autoTagRules.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError(`Rule ${id} not found`);
  }

  await db.update(autoTagRules).set({ tagId }).where(eq(autoTagRules.id, id));

  await db
    .delete(autoTagRuleConditions)
    .where(eq(autoTagRuleConditions.ruleId, id));

  await db.insert(autoTagRuleConditions).values(
    conditions.map((c) => ({
      ruleId: id,
      matchField: c.matchField,
      matchType: c.matchType,
      matchValue: c.matchValue,
    })),
  );

  const ruleConditions = await db
    .select()
    .from(autoTagRuleConditions)
    .where(eq(autoTagRuleConditions.ruleId, id));

  return { ...existing[0]!, tagId, conditions: ruleConditions };
}

export async function deleteRule(userId: string, id: string) {
  const existing = await db
    .select()
    .from(autoTagRules)
    .where(and(eq(autoTagRules.id, id), eq(autoTagRules.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError(`Rule ${id} not found`);
  }

  await db.delete(autoTagRules).where(eq(autoTagRules.id, id));
}

export async function applyRule(
  userId: string,
  ruleId: string,
): Promise<{ matched: number; tagged: number }> {
  const [rule] = await db
    .select()
    .from(autoTagRules)
    .where(and(eq(autoTagRules.id, ruleId), eq(autoTagRules.userId, userId)))
    .limit(1);

  if (!rule) {
    throw new NotFoundError(`Rule ${ruleId} not found`);
  }

  const conditions = await db
    .select()
    .from(autoTagRuleConditions)
    .where(eq(autoTagRuleConditions.ruleId, ruleId));

  const userTxns = await db
    .select()
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(eq(accounts.userId, userId));

  let matched = 0;
  let tagged = 0;

  const pairs: Array<{ transactionId: string; tagId: string }> = [];

  for (const { transactions: txn } of userTxns) {
    if (matchesRule(txn, conditions)) {
      matched++;
      pairs.push({ transactionId: txn.id, tagId: rule.tagId });
    }
  }

  if (pairs.length > 0) {
    const result = await db
      .insert(transactionTags)
      .values(pairs)
      .onConflictDoNothing()
      .returning();
    tagged = result.length;
  }

  return { matched, tagged };
}

export async function applyAllRules(
  userId: string,
): Promise<{ matched: number; tagged: number }> {
  const rules = await db
    .select()
    .from(autoTagRules)
    .where(eq(autoTagRules.userId, userId));

  let totalMatched = 0;
  let totalTagged = 0;

  for (const rule of rules) {
    const result = await applyRule(userId, rule.id);
    totalMatched += result.matched;
    totalTagged += result.tagged;
  }

  return { matched: totalMatched, tagged: totalTagged };
}

export async function applyAllRulesToTransactions(
  userId: string,
  transactionIds: string[],
): Promise<void> {
  if (transactionIds.length === 0) return;

  const rules = await db
    .select()
    .from(autoTagRules)
    .where(eq(autoTagRules.userId, userId));

  if (rules.length === 0) return;

  const txns = await db
    .select()
    .from(transactions)
    .where(inArray(transactions.id, transactionIds));

  for (const rule of rules) {
    const conditions = await db
      .select()
      .from(autoTagRuleConditions)
      .where(eq(autoTagRuleConditions.ruleId, rule.id));

    const pairs: Array<{ transactionId: string; tagId: string }> = [];
    for (const txn of txns) {
      if (matchesRule(txn, conditions)) {
        pairs.push({ transactionId: txn.id, tagId: rule.tagId });
      }
    }

    if (pairs.length > 0) {
      await db.insert(transactionTags).values(pairs).onConflictDoNothing();
    }
  }
}
