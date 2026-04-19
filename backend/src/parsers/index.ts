import type { ParseError, ParsedTransaction } from "./schema.js";
import type { ParseOptions, UploadFormat } from "./types.js";
import { parseCsv } from "./csv.js";
import { parseJson } from "./json.js";
import { parseTdCanada } from "./institutions/tdCanada.js";
import { parseRbcCanada } from "./institutions/rbcCanada.js";
import { parseAmexCanada } from "./institutions/amexCanada.js";
import { parseCibcCanada } from "./institutions/cibcCanada.js";
import { ValidationError } from "../middleware/errorHandler.js";

export interface ParseResult {
  format: UploadFormat;
  transactions: ParsedTransaction[];
  errors: ParseError[];
}

export function parseUploadFile(
  content: string,
  options: ParseOptions,
): ParseResult {
  switch (options.format) {
    case "generic_csv": {
      const { transactions, errors } = parseCsv(content);
      return { format: options.format, transactions, errors };
    }
    case "generic_json": {
      try {
        const { transactions, errors } = parseJson(content);
        return { format: options.format, transactions, errors };
      } catch (err) {
        throw new ValidationError(
          err instanceof Error ? err.message : "Invalid JSON",
        );
      }
    }
    case "td_canada":
      return {
        format: options.format,
        ...parseTdCanada(content, options.accountLabel ?? ""),
      };
    case "rbc_canada":
      return {
        format: options.format,
        ...parseRbcCanada(content, options.accountLabel ?? ""),
      };
    case "amex_canada":
      return {
        format: options.format,
        ...parseAmexCanada(content, options.accountLabel ?? ""),
      };
    case "cibc_canada":
      return {
        format: options.format,
        ...parseCibcCanada(content, options.accountLabel ?? ""),
      };
  }

  throw new Error(`Unsupported upload format: ${options.format}`);
}
