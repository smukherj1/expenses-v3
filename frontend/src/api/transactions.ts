import { get, patch, del, post } from "./client.ts";

export interface Transaction {
  id: string;
  accountId: string;
  accountLabel: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  createdAt: string;
}

export interface TransactionWithTags extends Transaction {
  tags: string[];
}

export interface TransactionList {
  data: Transaction[];
  total: number;
  page: number;
  limit: number;
}

export interface ListParams {
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  accountId?: string;
  tags?: string;
  type?: "income" | "expense";
  sort?: "date" | "amount" | "description" | "account";
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export function listTransactions(
  params: ListParams = {},
): Promise<TransactionList> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  const query = qs.toString();
  return get<TransactionList>(`/transactions${query ? `?${query}` : ""}`);
}

export function getTransaction(id: string): Promise<TransactionWithTags> {
  return get<TransactionWithTags>(`/transactions/${id}`);
}

export function updateTransaction(
  id: string,
  update: { description?: string; tags?: string[] },
): Promise<TransactionWithTags> {
  return patch<TransactionWithTags>(`/transactions/${id}`, update);
}

export function deleteTransaction(id: string): Promise<void> {
  return del<void>(`/transactions/${id}`);
}

export function bulkDeleteTransactions(
  transactionIds: string[],
): Promise<{ deleted: number }> {
  return post<{ deleted: number }>("/transactions/bulk-delete", {
    transactionIds,
  });
}

export function bulkTag(
  transactionIds: string[],
  tagNames: string[],
  action: "add" | "remove",
): Promise<{ updated: number }> {
  return post<{ updated: number }>("/transactions/bulk-tag", {
    transactionIds,
    tagNames,
    action,
  });
}
