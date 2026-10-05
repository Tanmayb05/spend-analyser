import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { buildBundle, planKey, toIsoDate } from "@/lib/import/workbook";

const FILE = "Expense_Tracker.xlsx";

describe("workbook helpers", () => {
  it("excel serial → ISO date", () => {
    expect(toIsoDate(46022)).toBe("2025-12-31");
    expect(toIsoDate("2026-9-3")).toBe("2026-09-03");
    expect(toIsoDate("9/3/2026")).toBe("2026-09-03");
  });
  it("groups EMI rows of the same plan", () => {
    expect(planKey("Walmart Aug EMI 0 (plan $37.79 / 5)", "Walmart")).toBe(planKey("Walmart Aug EMI 4 (plan $37.79 / 5)", "Walmart"));
    expect(planKey("Kinjal Renter's Insurance EMI 3", "Lemonade")).not.toBe(planKey("Kinjal Renter's Insurance Renewal EMI 3", "Lemonade"));
  });
});

describe.skipIf(!existsSync(FILE))("real Expense_Tracker.xlsx", () => {
  const wb = XLSX.read(readFileSync(FILE), { type: "buffer" });
  const rows = (name: string) => XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[name], { header: 1, raw: true, defval: null });
  const report = buildBundle({ settings: rows("Settings"), expenses: rows("Expenses") });

  it("reads every row", () => {
    expect(report.stats.rows).toBe(419);
    expect(report.stats.skipped).toEqual([]);
    expect(report.stats.totals.income).toBeCloseTo(7996.6, 2);
  });
  // EMI Tracker lists 17; the Expenses sheet also has Frontier CVG-LAS and the SF Bay flight plans.
  it("groups installments into 19 plans", () => {
    expect(report.stats.plans).toBe(19);
    expect(report.stats.installmentRows).toBe(112);
    const sum = report.bundle.plans.reduce((a, p) => a + p.installments.length, 0);
    expect(sum).toBe(112);
  });
  it("preserves money: parents equal the sum of their installments", () => {
    const parents = new Map(report.bundle.transactions.map((t) => [t.ref, t]));
    for (const p of report.bundle.plans) {
      const total = p.installments.reduce((a, i) => a + i.amount, 0);
      expect(parents.get(p.ref)!.amount).toBeCloseTo(total, 2);
    }
  });
  it("merges installments that share merchant + plan text", () => {
    const walmart = report.bundle.plans.filter((p) => report.bundle.transactions.find((t) => t.ref === p.ref)?.merchant === "Walmart");
    expect(walmart.map((p) => p.months).sort()).toEqual([5, 5]);
  });
  it("categories, budgets, core flags, trips", () => {
    const cat = (n: string) => report.bundle.categories.find((c) => c.name === n)!;
    expect(cat("Groceries")).toMatchObject({ budget: 180, is_core: true });
    expect(cat("Education").is_core).toBe(false);
    expect(cat("Rent & Utilities").subcategories).toContain("Duke");
    expect(report.bundle.trips.map((t) => t.name).sort()).toEqual(
      ["AZ-UT Road Trip 2026-02", "Antara Cincy Visit 2026-09", "India Trip 2025-11", "SF Bay Trip 2026-07", "SoCal Trip 2026-07"].sort(),
    );
    expect(report.bundle.budget_month).toBe("2025-07-01");
    expect(report.bundle.payment_methods).not.toContain("Unknown");
  });
});
