// Turns an uploaded file into row arrays for the parser: sniffs encoding and delimiter for text files,
// reads workbooks with SheetJS, and picks the sheet that looks like a transaction list.

import Papa from "papaparse";
import { findHeader, type Rows } from "./workbook";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 20_000;

export type FileMeta = {
  kind: "csv" | "workbook";
  encoding?: string;
  delimiter?: string;
  sheet?: string;
  sheetNames?: string[];
};

export type ReadResult = { sheets: { settings?: Rows; expenses: Rows; date1904: boolean }; meta: FileMeta };

export class ImportReadError extends Error {}

// Windows-1252 differs from Latin-1 in 0x80-0x9F (€, curly quotes, …). Some runtimes decode that range as Latin-1, so map it ourselves.
const CP1252_HIGH = "\u20AC\u0081\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u008D\u017D\u008F\u0090\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u009D\u017E\u0178";
const fromCp1252 = (b: Uint8Array) => Array.from(b, (x) => (x >= 0x80 && x <= 0x9f ? CP1252_HIGH[x - 0x80] : String.fromCharCode(x))).join("");

export function decodeText(buf: Uint8Array): { text: string; encoding: string } {
  const b = buf;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return { text: new TextDecoder("utf-8").decode(b.subarray(3)), encoding: "UTF-8" };
  if (b[0] === 0xff && b[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(b.subarray(2)), encoding: "UTF-16" };
  if (b[0] === 0xfe && b[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(b.subarray(2)), encoding: "UTF-16" };
  // UTF-16 without a BOM: ASCII text has a zero in every other byte
  const probe = b.subarray(0, 400);
  let evenZero = 0;
  let oddZero = 0;
  probe.forEach((x, i) => {
    if (x !== 0) return;
    if (i % 2) oddZero++;
    else evenZero++;
  });
  if (probe.length >= 8 && (oddZero > probe.length / 4 || evenZero > probe.length / 4)) {
    return { text: new TextDecoder(oddZero >= evenZero ? "utf-16le" : "utf-16be").decode(b), encoding: "UTF-16" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(b), encoding: "UTF-8" };
  } catch {
    return { text: fromCp1252(b), encoding: "Windows-1252" };
  }
}

const DELIMITERS = [",", ";", "\t", "|"];

/** Pick the delimiter that splits the first lines into the most consistent number of columns. */
export function sniffDelimiter(text: string): string {
  let best = ",";
  let bestScore = 0;
  for (const d of DELIMITERS) {
    const rows = Papa.parse<string[]>(text, { delimiter: d, preview: 60 }).data.filter((r) => r.some((c) => c.trim()));
    if (!rows.length) continue;
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
    const [cols, freq] = [...counts.entries()].filter(([n]) => n > 1).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [1, 0];
    const score = (freq / rows.length) * Math.log(cols + 1) * (cols > 1 ? 1 : 0);
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

export function parseDelimited(text: string): { rows: Rows; delimiter: string } {
  let body = text.replace(/^﻿/, "");
  let delimiter: string | null = null;
  const sep = body.match(/^sep=(.)\r?\n/i); // Excel's hint line
  if (sep) {
    delimiter = sep[1];
    body = body.slice(sep[0].length);
  }
  delimiter ??= sniffDelimiter(body);
  return { rows: Papa.parse<string[]>(body, { delimiter }).data as Rows, delimiter };
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;
const isOle = (b: Uint8Array) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;

export async function readImportFile(file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<ReadResult> {
  if (file.size === 0) throw new ImportReadError("That file is empty");
  if (file.size > MAX_FILE_BYTES) throw new ImportReadError("That file is over 10 MB. Split it into smaller files");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const asText = /\.(csv|tsv|txt)$/i.test(file.name) && !isZip(bytes) && !isOle(bytes);

  let result: ReadResult;
  if (asText || (!isZip(bytes) && !isOle(bytes) && !/\.(xlsx|xlsm|xls)$/i.test(file.name))) {
    const { text, encoding } = decodeText(bytes);
    const { rows, delimiter } = parseDelimited(text);
    result = { sheets: { expenses: rows, date1904: false }, meta: { kind: "csv", encoding, delimiter } };
  } else {
    const XLSX = await import("xlsx");
    let wb;
    try {
      wb = XLSX.read(bytes, { type: "array" });
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (/password|encrypt/i.test(msg)) throw new ImportReadError("That workbook is password-protected. Save an unprotected copy and try again");
      throw new ImportReadError(`Couldn't read that file: ${msg}`);
    }
    if (!wb.SheetNames.length) throw new ImportReadError("That workbook has no sheets");
    const toRows = (name: string) => XLSX.utils.sheet_to_json<Rows[number]>(wb.Sheets[name], { header: 1, raw: true, defval: null }) as Rows;
    const named = wb.SheetNames.find((n) => n.toLowerCase() === "expenses");
    let chosen = named;
    let rows: Rows | null = named ? toRows(named) : null;
    if (!rows || !findHeader(rows)) {
      // the sheet with the best-looking header, else the first one (the parser then explains what is missing)
      let bestScore = 0;
      for (const n of wb.SheetNames) {
        if (n.toLowerCase() === "settings") continue;
        const r = toRows(n);
        const h = findHeader(r);
        if (h && h.score > bestScore) {
          bestScore = h.score;
          chosen = n;
          rows = r;
        }
      }
      if (!rows) {
        chosen = wb.SheetNames[0];
        rows = toRows(chosen);
      }
    }
    const settingsName = wb.SheetNames.find((n) => n.toLowerCase() === "settings");
    const date1904 = Boolean((wb.Workbook as { WBProps?: { date1904?: boolean } } | undefined)?.WBProps?.date1904);
    result = {
      sheets: { expenses: rows, settings: settingsName && settingsName !== chosen ? toRows(settingsName) : undefined, date1904 },
      meta: { kind: "workbook", sheet: chosen, sheetNames: wb.SheetNames },
    };
  }

  if (result.sheets.expenses.length > MAX_ROWS + 200) throw new ImportReadError(`That file has more than ${MAX_ROWS.toLocaleString("en-US")} rows. Split it into smaller files`);
  if (!result.sheets.expenses.some((r) => r.some((c) => String(c ?? "").trim()))) throw new ImportReadError("That file has no data in it");
  return result;
}
