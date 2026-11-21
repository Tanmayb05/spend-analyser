import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildBundle, UNCATEGORIZED } from "@/lib/import/workbook";
import { COLUMN_GUIDE, TEMPLATE_COLUMNS, templateRows } from "@/lib/import/template";

describe("import sample", () => {
  const rows = [[...TEMPLATE_COLUMNS], ...templateRows()];

  it("every sample row has one cell per column", () => {
    for (const r of templateRows()) expect(r).toHaveLength(TEMPLATE_COLUMNS.length);
  });

  it("imports through the real parser with nothing skipped", () => {
    const { bundle, stats } = buildBundle({ expenses: rows }, { replaceDefaults: false });
    expect(stats.skipped).toEqual([]);
    expect(stats.rows).toBe(9);
    expect(stats.plans).toBe(1);
    expect(stats.installmentRows).toBe(3);
    // 9 rows, the 3 installments collapse into one parent transaction
    expect(stats.transactions).toBe(7);
    expect(bundle.plans[0]).toMatchObject({ kind: "emi", months: 3 });
    expect(bundle.transactions.filter((t) => t.type === "income")).toHaveLength(1);
    expect(bundle.transactions.filter((t) => t.type === "refund")).toHaveLength(1);
    expect(bundle.transactions.filter((t) => t.category === UNCATEGORIZED)).toHaveLength(1);
    expect(bundle.transactions.filter((t) => t.currency === "EUR")).toHaveLength(1);
    expect(bundle.trips.map((t) => t.name)).toEqual(["Lisbon 2026"]);
  });

  it("survives an xlsx round trip", () => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    const back = XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }), { type: "array" });
    const parsed = XLSX.utils.sheet_to_json<unknown[]>(back.Sheets.Expenses, { header: 1, raw: true, defval: null }) as never;
    expect(buildBundle({ expenses: parsed }).stats.skipped).toEqual([]);
  });

  it("column guide documents exactly the sample's columns", () => {
    expect(COLUMN_GUIDE.map((g) => g.column).sort()).toEqual([...TEMPLATE_COLUMNS].sort());
  });

  it("only Date and Amount are required", () => {
    expect(COLUMN_GUIDE.filter((g) => g.required === "required").map((g) => g.column)).toEqual(["Date", "Amount"]);
  });
});
