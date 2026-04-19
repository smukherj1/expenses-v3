import { ValidationError } from "../middleware/errorHandler.js";

function cleanMoneyInput(value: string): string {
  return value.trim().replace(/\$/g, "").replace(/,/g, "");
}

export function parseMoney(value: string, row: number): string {
  const cleaned = cleanMoneyInput(value);

  if (cleaned.length === 0) {
    throw new ValidationError(`Row ${row}: Missing monetary value`);
  }

  if (!/^-?\d+(?:\.\d{1,2})?$/.test(cleaned)) {
    throw new ValidationError(`Row ${row}: Invalid monetary value: ${value}`);
  }

  return String(parseFloat(cleaned));
}

export function parseOptionalMoney(value: string | undefined): number {
  const cleaned = cleanMoneyInput(value ?? "");
  if (cleaned.length === 0) return 0;
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(cleaned)) {
    throw new ValidationError(`Invalid monetary value: ${value ?? ""}`);
  }
  return parseFloat(cleaned);
}

export function combineDebitCredit(
  debit: string | undefined,
  credit: string | undefined,
): string {
  const debitValue = parseOptionalMoney(debit);
  const creditValue = parseOptionalMoney(credit);
  return (creditValue - debitValue).toFixed(2);
}
