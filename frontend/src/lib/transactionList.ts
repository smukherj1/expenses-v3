export type SortColumn =
  | "date"
  | "description"
  | "amount"
  | "account"
  | "duplicateStatus";

export type SortOrder = "asc" | "desc";

export type TransactionListSort = {
  column: SortColumn;
  order: SortOrder;
};

export type TransactionListColumn =
  | "select"
  | "date"
  | "description"
  | "amount"
  | "account"
  | "tags"
  | "duplicateStatus";

export type TransactionListRow = {
  key: string;
  date: string;
  description: string;
  amount: number;
  currency?: "CAD" | string;
  accountLabel?: string;
  tags?: string[];
  duplicate?: boolean;
  included?: boolean;
  href?: string;
};

export type TransactionListSelection = {
  pageSelected: boolean;
  pageIndeterminate: boolean;
};

export type DuplicateReviewFilterState = {
  duplicateVisibility: "all" | "duplicates" | "nonDuplicates";
};

export function toggleSort(
  current: TransactionListSort | null,
  column: SortColumn,
): TransactionListSort {
  if (current?.column === column) {
    return {
      column,
      order: current.order === "asc" ? "desc" : "asc",
    };
  }

  return { column, order: "asc" };
}

function compareValues(
  left: string | number | boolean | undefined,
  right: string | number | boolean | undefined,
): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }

  return String(left ?? "").localeCompare(String(right ?? ""));
}

export function sortTransactionRows(
  rows: TransactionListRow[],
  sort: TransactionListSort,
): TransactionListRow[] {
  const sorted = [...rows];

  sorted.sort((left, right) => {
    let result = 0;

    switch (sort.column) {
      case "date":
        result = compareValues(left.date, right.date);
        break;
      case "description":
        result = compareValues(left.description, right.description);
        break;
      case "amount":
        result = compareValues(left.amount, right.amount);
        break;
      case "account":
        result = compareValues(left.accountLabel, right.accountLabel);
        break;
      case "duplicateStatus":
        result = compareValues(
          Boolean(left.duplicate),
          Boolean(right.duplicate),
        );
        break;
    }

    if (result === 0) {
      result = compareValues(left.key, right.key);
    }

    return sort.order === "asc" ? result : -result;
  });

  return sorted;
}

export function filterReviewRows(
  rows: TransactionListRow[],
  duplicateVisibility: DuplicateReviewFilterState["duplicateVisibility"],
): TransactionListRow[] {
  switch (duplicateVisibility) {
    case "duplicates":
      return rows.filter((row) => row.duplicate === true);
    case "nonDuplicates":
      return rows.filter((row) => row.duplicate === false);
    default:
      return rows;
  }
}

export function formatAmount(row: TransactionListRow): string {
  const value = row.amount.toFixed(2);
  const signed = row.amount >= 0 ? `+${value}` : value;
  return row.currency ? `${signed} ${row.currency}` : signed;
}
