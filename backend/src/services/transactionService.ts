import {
  eq,
  and,
  gte,
  lte,
  gt,
  lt,
  inArray,
  sql,
  asc,
  desc,
  SQL,
} from "drizzle-orm";
import { db } from "../db/index.js";
import { transactions, accounts, tags, transactionTags } from "../db/schema.js";
import { NotFoundError } from "../middleware/errorHandler.js";
import { getOrCreateTag } from "./tagService.js";

export async function listTransactions(
  userId: string,
  params: {
    q?: string;
    dateFrom?: string;
    dateTo?: string;
    amountMin?: number;
    amountMax?: number;
    accountId?: string;
    accountIds?: string[];
    tags?: string;
    type?: "income" | "expense";
    sort: "date" | "amount" | "description" | "account";
    order: "asc" | "desc";
    page: number;
    limit: number;
  },
) {
  const conditions: SQL[] = [];

  conditions.push(eq(accounts.userId, userId));

  if (params.accountIds?.length) {
    conditions.push(inArray(transactions.accountId, params.accountIds));
  } else if (params.accountId) {
    conditions.push(eq(transactions.accountId, params.accountId));
  }

  if (params.dateFrom) {
    conditions.push(gte(transactions.date, params.dateFrom));
  }
  if (params.dateTo) {
    conditions.push(lte(transactions.date, params.dateTo));
  }

  if (params.amountMin !== undefined) {
    conditions.push(gte(transactions.amount, String(params.amountMin)));
  }
  if (params.amountMax !== undefined) {
    conditions.push(lte(transactions.amount, String(params.amountMax)));
  }

  if (params.type === "income") {
    conditions.push(gt(transactions.amount, "0"));
  } else if (params.type === "expense") {
    conditions.push(lt(transactions.amount, "0"));
  }

  if (params.q) {
    conditions.push(sql`${transactions.description} ILIKE ${`%${params.q}%`}`);
  }

  if (params.tags) {
    const tagNames = params.tags.split(",").map((t) => t.trim());
    conditions.push(
      sql`${transactions.id} IN (
        SELECT tt.transaction_id FROM transaction_tags tt
        JOIN tags tg ON tt.tag_id = tg.id
        WHERE tg.name = ANY(${tagNames})
      )`,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Sort
  const sortCol =
    params.sort === "date"
      ? transactions.date
      : params.sort === "amount"
        ? transactions.amount
        : params.sort === "account"
          ? accounts.label
          : transactions.description;
  const orderFn = params.order === "asc" ? asc : desc;

  const offset = (params.page - 1) * params.limit;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        accountId: transactions.accountId,
        date: transactions.date,
        description: transactions.description,
        amount: transactions.amount,
        currency: transactions.currency,
        createdAt: transactions.createdAt,
        accountLabel: accounts.label,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(whereClause)
      .orderBy(orderFn(sortCol), asc(transactions.id))
      .limit(params.limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    data: rows.map((r) => ({
      ...r,
      amount: parseFloat(String(r.amount)),
    })),
    total,
    page: params.page,
    limit: params.limit,
  };
}

export async function getTransactionById(userId: string, id: string) {
  const row = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);

  if (row.length === 0) {
    throw new NotFoundError(`Transaction ${id} not found`);
  }

  const txn = row[0]!;

  // Verify ownership
  const acct = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, txn.accountId), eq(accounts.userId, userId)))
    .limit(1);

  if (acct.length === 0) {
    throw new NotFoundError(`Transaction ${id} not found`);
  }

  // Fetch tags
  const tagRows = await db
    .select({ name: tags.name })
    .from(transactionTags)
    .innerJoin(tags, eq(transactionTags.tagId, tags.id))
    .where(eq(transactionTags.transactionId, id));

  return {
    ...txn,
    amount: parseFloat(String(txn.amount)),
    tags: tagRows.map((t) => t.name),
  };
}

export async function updateTransaction(
  userId: string,
  id: string,
  update: { description?: string; tags?: string[] },
) {
  await getTransactionById(userId, id);

  if (update.description !== undefined) {
    await db
      .update(transactions)
      .set({ description: update.description })
      .where(eq(transactions.id, id));
  }

  if (update.tags !== undefined) {
    // Replace tags
    await db
      .delete(transactionTags)
      .where(eq(transactionTags.transactionId, id));
    if (update.tags.length > 0) {
      const tagObjs = await Promise.all(
        update.tags.map((name) => getOrCreateTag(userId, name)),
      );
      await db
        .insert(transactionTags)
        .values(tagObjs.map((t) => ({ transactionId: id, tagId: t.id })));
    }
  }

  return getTransactionById(userId, id);
}

export async function deleteTransaction(userId: string, id: string) {
  await getTransactionById(userId, id); // verifies ownership + throws 404
  await db.delete(transactions).where(eq(transactions.id, id));
}

export async function bulkDeleteTransactions(
  userId: string,
  transactionIds: string[],
) {
  const uniqueIds = [...new Set(transactionIds)];

  const ownedRows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      and(eq(accounts.userId, userId), inArray(transactions.id, uniqueIds)),
    );

  if (ownedRows.length !== uniqueIds.length) {
    throw new NotFoundError("One or more transactions not found");
  }

  await db.delete(transactions).where(inArray(transactions.id, uniqueIds));

  return { deleted: uniqueIds.length };
}

export async function bulkTag(
  userId: string,
  transactionIds: string[],
  tagNames: string[],
  action: "add" | "remove",
) {
  // Verify all transactions belong to user
  const userTxns = await db
    .select({ id: transactions.id })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      and(
        inArray(transactions.id, transactionIds),
        eq(accounts.userId, userId),
      ),
    );

  const validIds = new Set(userTxns.map((t) => t.id));

  if (action === "add") {
    const tagObjs = await Promise.all(
      tagNames.map((name) => getOrCreateTag(userId, name)),
    );

    const pairs = [];
    for (const txnId of transactionIds) {
      if (!validIds.has(txnId)) continue;
      for (const tag of tagObjs) {
        pairs.push({ transactionId: txnId, tagId: tag.id });
      }
    }

    if (pairs.length > 0) {
      await db.insert(transactionTags).values(pairs).onConflictDoNothing();
    }

    return { updated: pairs.length };
  } else {
    // remove
    const tagRows = await db
      .select()
      .from(tags)
      .where(and(eq(tags.userId, userId), inArray(tags.name, tagNames)));

    const tagIds = tagRows.map((t) => t.id);
    if (tagIds.length === 0) return { updated: 0 };

    let removed = 0;
    for (const txnId of transactionIds) {
      if (!validIds.has(txnId)) continue;
      const result = await db
        .delete(transactionTags)
        .where(
          and(
            eq(transactionTags.transactionId, txnId),
            inArray(transactionTags.tagId, tagIds),
          ),
        );
      removed += result.rowCount ?? 0;
    }

    return { updated: removed };
  }
}
