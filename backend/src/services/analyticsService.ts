import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

export async function getMonthlySummary(userId: string, year: number) {
  const result = await db.execute(sql`
    SELECT
      EXTRACT(MONTH FROM t.date)::int AS month,
      COALESCE(SUM(CASE WHEN t.amount::numeric > 0 THEN t.amount::numeric ELSE 0 END), 0)::float AS income,
      COALESCE(SUM(CASE WHEN t.amount::numeric < 0 THEN ABS(t.amount::numeric) ELSE 0 END), 0)::float AS expenses
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = ${userId}::uuid
      AND EXTRACT(YEAR FROM t.date)::int = ${year}
    GROUP BY month
    ORDER BY month
  `);

  return result.rows.map((r) => ({
    month: Number(r.month),
    income: Number(r.income),
    expenses: Number(r.expenses),
  }));
}

export async function getCategoryBreakdown(
  userId: string,
  year: number,
  month: number,
) {
  const result = await db.execute(sql`
    SELECT tg.name AS tag, COALESCE(SUM(ABS(t.amount::numeric)), 0)::float AS total
    FROM transactions t
    JOIN transaction_tags tt ON t.id = tt.transaction_id
    JOIN tags tg ON tt.tag_id = tg.id
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = ${userId}::uuid
      AND EXTRACT(YEAR FROM t.date)::int = ${year}
      AND EXTRACT(MONTH FROM t.date)::int = ${month}
      AND t.amount::numeric < 0
    GROUP BY tg.name
    ORDER BY total DESC
  `);

  return result.rows.map((r) => ({
    tag: String(r.tag),
    total: Number(r.total),
  }));
}

export async function getTrend(
  userId: string,
  tagName: string,
  months: number,
) {
  const result = await db.execute(sql`
    SELECT
      TO_CHAR(DATE_TRUNC('month', t.date), 'YYYY-MM') AS month,
      COALESCE(SUM(ABS(t.amount::numeric)), 0)::float AS amount
    FROM transactions t
    JOIN transaction_tags tt ON t.id = tt.transaction_id
    JOIN tags tg ON tt.tag_id = tg.id
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = ${userId}::uuid
      AND tg.name = ${tagName}
      AND t.date >= (CURRENT_DATE - (${months} || ' months')::interval)::date
    GROUP BY DATE_TRUNC('month', t.date)
    ORDER BY DATE_TRUNC('month', t.date)
  `);

  return result.rows.map((r) => ({
    month: String(r.month),
    amount: Number(r.amount),
  }));
}

export async function getTopTransactions(
  userId: string,
  params: {
    n: number;
    dateFrom?: string;
    dateTo?: string;
    type?: "income" | "expense";
  },
) {
  const conditions = [sql`a.user_id = ${userId}::uuid`];

  if (params.dateFrom) {
    conditions.push(sql`t.date >= ${params.dateFrom}::date`);
  }
  if (params.dateTo) {
    conditions.push(sql`t.date <= ${params.dateTo}::date`);
  }
  if (params.type === "income") {
    conditions.push(sql`t.amount::numeric > 0`);
  } else if (params.type === "expense") {
    conditions.push(sql`t.amount::numeric < 0`);
  }

  const whereClause = conditions
    .map((c) => sql`(${c})`)
    .reduce((a, b) => sql`${a} AND ${b}`);

  const result = await db.execute(sql`
    SELECT t.id, t.account_id AS "accountId", t.date, t.description, t.amount::float AS amount, t.currency
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE ${whereClause}
    ORDER BY ABS(t.amount::numeric) DESC
    LIMIT ${params.n}
  `);

  return result.rows.map((r) => ({
    id: String(r.id),
    accountId: String(r.accountId),
    date: String(r.date),
    description: String(r.description),
    amount: Number(r.amount),
    currency: String(r.currency),
  }));
}
