export const uploadFormats = [
  "generic_csv",
  "generic_json",
  "td_canada",
  "rbc_canada",
  "amex_canada",
  "cibc_canada",
] as const;

export type UploadFormat = (typeof uploadFormats)[number];

export interface ParseOptions {
  format: UploadFormat;
  accountLabel?: string;
}
