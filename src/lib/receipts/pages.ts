/** Caps from the spec: 10 pages and 20 MB per receipt, 25 receipts per bulk batch. */
export const MAX_PAGES = 10;
export const MAX_RECEIPT_BYTES = 20 * 1024 * 1024;
export const MAX_BATCH = 25;

export type PageFile = { name: string; size: number; type: string };

/** Capacity check for the pages of one receipt. Returns an error message or null. */
export function checkPageCaps(pages: { size: number }[]): string | null {
  if (!pages.length) return "Choose at least one file.";
  if (pages.length > MAX_PAGES) return `A receipt can have up to ${MAX_PAGES} pages.`;
  if (pages.reduce((a, p) => a + p.size, 0) > MAX_RECEIPT_BYTES) return "A receipt can be up to 20 MB in total.";
  return null;
}

/**
 * Groups picked files into receipts. "one": a single receipt (in the order given).
 * "separate": one receipt per file. A lone PDF is always its own receipt.
 */
export function groupFiles<T>(files: T[], mode: "one" | "separate"): T[][] {
  if (!files.length) return [];
  return mode === "one" ? [files] : files.map((f) => [f]);
}

/**
 * Bulk grouping: `joinPrev[i]` attaches file i to the receipt of the file before it (extra pages of one receipt);
 * every other file starts a new receipt. The first file always starts one.
 */
export function groupByJoins<T>(files: T[], joinPrev: boolean[]): T[][] {
  const out: T[][] = [];
  files.forEach((f, i) => {
    if (i > 0 && joinPrev[i]) out[out.length - 1].push(f);
    else out.push([f]);
  });
  return out;
}
