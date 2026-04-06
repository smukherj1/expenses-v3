import { get, post, put, del } from "./client.ts";

export interface Condition {
  id: string;
  ruleId: string;
  matchField: "description" | "amount";
  matchType: "contains" | "exact" | "regex" | "gt" | "lt";
  matchValue: string;
}

export interface Rule {
  id: string;
  userId: string;
  tagId: string;
  conditions: Condition[];
}

export interface ConditionInput {
  matchField: "description" | "amount";
  matchType: "contains" | "exact" | "regex" | "gt" | "lt";
  matchValue: string;
}

export function getRules(): Promise<Rule[]> {
  return get<Rule[]>("/rules");
}

export function createRule(
  tagId: string,
  conditions: ConditionInput[],
): Promise<Rule> {
  return post<Rule>("/rules", { tagId, conditions });
}

export function updateRule(
  id: string,
  tagId: string,
  conditions: ConditionInput[],
): Promise<Rule> {
  return put<Rule>(`/rules/${id}`, { tagId, conditions });
}

export function deleteRule(id: string): Promise<void> {
  return del<void>(`/rules/${id}`);
}

export function applyRule(
  id: string,
): Promise<{ matched: number; tagged: number }> {
  return post<{ matched: number; tagged: number }>(`/rules/${id}/apply`);
}

export function applyAllRules(): Promise<{ matched: number; tagged: number }> {
  return post<{ matched: number; tagged: number }>("/rules/apply-all");
}
