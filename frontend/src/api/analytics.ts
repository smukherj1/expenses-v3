import { get } from "./client.ts";

export interface MonthlyRow {
  month: number;
  income: number;
  expenses: number;
}

export interface CategoryRow {
  tag: string;
  total: number;
}

export interface TrendRow {
  month: string;
  amount: number;
}

export interface TopTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
}

export function getMonthlySummary(year: number): Promise<MonthlyRow[]> {
  return get<MonthlyRow[]>(`/analytics/monthly-summary?year=${year}`);
}

export function getCategoryBreakdown(
  year: number,
  month: number,
): Promise<CategoryRow[]> {
  return get<CategoryRow[]>(
    `/analytics/category-breakdown?year=${year}&month=${month}`,
  );
}

export function getTrend(tag: string, months: number): Promise<TrendRow[]> {
  return get<TrendRow[]>(
    `/analytics/trend?tag=${encodeURIComponent(tag)}&months=${months}`,
  );
}

export function getTopTransactions(
  n: number,
  type: "expense" | "income",
  dateFrom?: string,
  dateTo?: string,
): Promise<TopTransaction[]> {
  const qs = new URLSearchParams({ n: String(n), type });
  if (dateFrom) qs.set("dateFrom", dateFrom);
  if (dateTo) qs.set("dateTo", dateTo);
  return get<TopTransaction[]>(`/analytics/top-transactions?${qs}`);
}
