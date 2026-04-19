import { ValidationError } from "../middleware/errorHandler.js";

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function assertValidDate(
  year: number,
  month: number,
  day: number,
  raw: string,
) {
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new ValidationError(`Invalid date format: ${raw}`);
  }
}

export function normalizeIsoDate(raw: string, row: number): string {
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`Row ${row}: Invalid date format: ${raw}`);
  }

  const [year, month, day] = value.split("-").map(Number);
  assertValidDate(year, month, day, raw);
  return value;
}

export function parseRbcDate(raw: string, row: number): string {
  const value = raw.trim();
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    throw new ValidationError(`Row ${row}: Invalid date format: ${raw}`);
  }

  const [, monthText, dayText, yearText] = match;
  const month = Number(monthText);
  const day = Number(dayText);
  const year = Number(yearText);
  assertValidDate(year, month, day, raw);
  return `${yearText}-${monthText.padStart(2, "0")}-${dayText.padStart(2, "0")}`;
}

export function parseAmexDate(raw: string, row: number): string {
  const value = raw.trim().replace(/\.+/g, ".");
  const match = value.match(/^(\d{1,2}) ([A-Za-z]{3})\.? (\d{4})$/);
  if (!match) {
    throw new ValidationError(`Row ${row}: Invalid date format: ${raw}`);
  }

  const [, dayText, monthText, yearText] = match;
  const month = MONTHS[monthText.toLowerCase()];
  if (!month) {
    throw new ValidationError(`Row ${row}: Invalid date format: ${raw}`);
  }

  const day = Number(dayText);
  const year = Number(yearText);
  assertValidDate(year, month, day, raw);
  return `${yearText}-${String(month).padStart(2, "0")}-${dayText.padStart(2, "0")}`;
}
