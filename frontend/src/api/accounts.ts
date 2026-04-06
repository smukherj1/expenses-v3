import { get, del } from "./client.ts";

export interface Account {
  id: string;
  label: string;
  createdAt: string;
}

export function getAccounts(): Promise<Account[]> {
  return get<Account[]>("/accounts");
}

export function deleteAccount(id: string): Promise<void> {
  return del<void>(`/accounts/${id}`);
}
