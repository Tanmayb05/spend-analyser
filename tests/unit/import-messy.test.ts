import { describe, expect, it } from "vitest";
import { buildBundle, findHeader, parseSettings, type Rows } from "@/lib/import/workbook";
import { decodeText, parseDelimited, sniffDelimiter } from "@/lib/import/read-file";
import { matchDuplicates } from "@/lib/import/dedupe";
import { fit, mapType, normText, parseAmount, parseDate, scanDateOrder, scanDecimalMark } from "@/lib/import/values";

type Opts = NonNullable<Parameters<typeof buildBundle>[1]>;
const run = (csv: string, opts: Opts = {}) => buildBundle({ expenses: parseDelimited(csv).rows }, { baseCurrency: "USD", ...opts });
const dates = (csv: string, opts: Opts = {}) => run(csv, opts).bundle.transactions.map((t) => t.date);

describe("amounts", () => {
  const p = (s: string, mark: "." | "," = ".") => parseAmount(s, mark);
  it("plain, grouped, symbols", () => {
    expect(p("54.20")?.value).toBe(54.2);
    expect(p("$1,234.50")?.value).toBe(1234.5);
    expect(p("€12,50", ",")?.value).toBe(12.5);
    expect(p("1.234,56", ",")?.value).toBe(1234.56);
    expect(p("1 234,56", ",")?.value).toBe(1234.56);
    expect(p("1'234.50")?.value).toBe(1234.5);
    expect(p("₹1,23,456.00")?.value).toBe(123456);
    expect(p("USD 45")?.value).toBe(45);
    expect(p("45 EUR")?.value).toBe(45);
  });
  it("signs", () => {
    expect(p("(45.00)")).toMatchObject({ value: 45, negative: true });
    expect(p("−45")).toMatchObject({ value: 45, negative: true });
    expect(p("45-")).toMatchObject({ value: 45, negative: true });
    expect(p("-45")).toMatchObject({ negative: true });
    expect(p("+45")).toMatchObject({ negative: false });
    expect(p("45.00 CR")).toMatchObject({ value: 45, side: "cr" });
    expect(p("45.00 DR")).toMatchObject({ value: 45, side: "dr" });
  });
  it("rejects what it cannot read instead of guessing", () => {
    for (const bad of ["1e3", "=1+2", "abc", "12 apples", "1.2.3", "1,2,3x", "--5", ""]) expect(p(bad), bad).toBeNull();
    expect(p("12.5", ",")).toBeNull(); // a point is not a decimal mark here
  });
  it("infers the decimal mark from the whole column", () => {
    expect(scanDecimalMark(["1.234,56", "12,50"])).toEqual({ state: "known", mark: "," });
    expect(scanDecimalMark(["1,234.56", "12.50"])).toEqual({ state: "known", mark: "." });
    expect(scanDecimalMark(["12,5"])).toEqual({ state: "known", mark: "," });
    expect(scanDecimalMark(["1,234"])).toEqual({ state: "known", mark: "." }); // 3 digits after a comma: thousands
    expect(scanDecimalMark(["1.234"])).toEqual({ state: "known", mark: "," });
    expect(scanDecimalMark([12, 13.5, "40"])).toEqual({ state: "none", mark: "." });
    expect(scanDecimalMark(["12,50", "12.50"]).state).toBe("conflict");
  });
});

describe("dates", () => {
  const mdy = { order: "mdy" as const };
  const dmy = { order: "dmy" as const };
  it("formats", () => {
    expect(parseDate("2026-1-5", mdy)).toBe("2026-01-05");
    expect(parseDate("2026-01-05T10:30:00Z", mdy)).toBe("2026-01-05");
    expect(parseDate("20260105", mdy)).toBe("2026-01-05");
    expect(parseDate("05/01/2026", dmy)).toBe("2026-01-05");
    expect(parseDate("05/01/2026", mdy)).toBe("2026-05-01");
    expect(parseDate("5.1.2026", dmy)).toBe("2026-01-05");
    expect(parseDate("1/5/26", mdy)).toBe("2026-01-05");
    expect(parseDate("Jan 5, 2026", mdy)).toBe("2026-01-05");
    expect(parseDate("5 January 2026", mdy)).toBe("2026-01-05");
    expect(parseDate("05-Jan-2026", mdy)).toBe("2026-01-05");
    expect(parseDate("2026 Jan 05", mdy)).toBe("2026-01-05");
    expect(parseDate(46027, mdy)).toBe("2026-01-05");
    expect(parseDate("46027", mdy)).toBe("2026-01-05");
    expect(parseDate(20260105, mdy)).toBe("2026-01-05");
  });
  it("rejects impossible dates", () => {
    for (const bad of ["2026-02-31", "13/13/2026", "2026-13-01", "0", "1/1/1800", "not a date", "", "31/04/2026"]) expect(parseDate(bad, dmy), bad).toBeNull();
    expect(parseDate(0, mdy)).toBeNull();
    expect(parseDate(1e12, mdy)).toBeNull();
    expect(parseDate(Number.NaN, mdy)).toBeNull();
  });
  it("1904 workbooks", () => {
    expect(parseDate(46027 - 1462, { order: "mdy", date1904: true })).toBe("2026-01-05");
  });
  it("infers order from the column", () => {
    expect(scanDateOrder(["15/01/2026", "03/02/2026"])).toEqual({ state: "known", order: "dmy" });
    expect(scanDateOrder(["01/15/2026", "03/02/2026"])).toEqual({ state: "known", order: "mdy" });
    expect(scanDateOrder(["01/02/2026", "03/04/2026"]).state).toBe("ambiguous");
    expect(scanDateOrder(["03/03/2026"]).state).toBe("none"); // same either way
    expect(scanDateOrder(["15/01/2026", "01/15/2026"]).state).toBe("mixed");
    expect(scanDateOrder(["2026-01-02", 46027]).state).toBe("none");
  });
});

describe("text", () => {
  it("normalises", () => {
    expect(normText("  a  b​c\t d \n")).toBe("a bc d");
    expect(normText("Café")).toBe("Café");
  });
  it("truncates without splitting a surrogate pair", () => {
    expect(fit("x".repeat(600), 500)).toMatchObject({ truncated: true });
    expect(fit("x".repeat(600), 500).value).toHaveLength(500);
    const s = `${"a".repeat(499)}\u{1F600}`; // emoji straddles the limit
    expect(fit(s, 500).value).toBe("a".repeat(499));
    expect(fit("ok", 500)).toEqual({ value: "ok", truncated: false });
  });
  it("maps types", () => {
    expect(mapType("Sale")).toBe("expense");
    expect(mapType("ACH_DEBIT")).toBe("expense");
    expect(mapType("ACH_CREDIT")).toBe("income");
    expect(mapType("Return")).toBe("refund");
    expect(mapType("Payment")).toBe("transfer");
    expect(mapType("Transfer out")).toBe("transfer");
    expect(mapType("Credit card payment")).toBe("transfer");
    expect(mapType("")).toBe("blank");
    expect(mapType("Adjustment")).toBe("unknown");
  });
});

describe("file reading", () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  it("UTF-8 without a BOM keeps accents and rupee signs", () => {
    expect(decodeText(enc("Café ₹"))).toEqual({ text: "Café ₹", encoding: "UTF-8" });
  });
  it("falls back to Windows-1252", () => {
    expect(decodeText(Uint8Array.from([0x43, 0x61, 0x66, 0xe9, 0x20, 0x80]))).toEqual({ text: "Café €", encoding: "Windows-1252" });
  });
  it("UTF-8 BOM and UTF-16", () => {
    expect(decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, ...enc("Date")])).text).toBe("Date");
    const le = (s: string) => Uint8Array.from([...s].flatMap((c) => [c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8]));
    expect(decodeText(Uint8Array.from([0xff, 0xfe, ...le("Date,Amount\n")])).text).toBe("Date,Amount\n");
    expect(decodeText(le("Date,Amount\n1,2\n")).text).toBe("Date,Amount\n1,2\n");
  });
  it("sniffs the delimiter", () => {
    expect(sniffDelimiter("Date;Amount;Memo\n1;2,5;a, b\n2;3,5;c, d")).toBe(";");
    expect(sniffDelimiter("Date\tAmount\n1\t2\n2\t3")).toBe("\t");
    expect(sniffDelimiter('Date,Amount,Memo\n1,2,"a, b"\n2,3,c')).toBe(",");
    expect(parseDelimited("sep=;\nDate;Amount\n1;2").rows).toEqual([["Date", "Amount"], ["1", "2"]]);
  });
});

describe("bank exports", () => {
  it("US signed amounts, month-first inferred", () => {
    const r = run("Date,Description,Amount\n01/15/2026,Grocery,-54.20\n01/16/2026,Salary,3200.00\n01/20/2026,Cafe,-6.50");
    expect(r.needsInput).toEqual([]);
    expect(r.detected.dateOrder).toMatchObject({ value: "mdy", state: "known" });
    expect(r.detected.signMode).toMatchObject({ value: "bank", source: "inferred" });
    expect(r.stats.totals).toEqual({ expense: 60.7, income: 3200, refund: 0 });
    expect(dates("Date,Description,Amount\n01/15/2026,Grocery,-54.20")).toEqual(["2026-01-15"]);
  });

  it("European: semicolons, dd.mm.yyyy, decimal commas", () => {
    const r = run("Date;Description;Amount\n15.01.2026;Rewe;-1.234,56\n16.01.2026;Gehalt;3.200,00\n17.01.2026;Cafe;-3,50");
    expect(r.detected.dateOrder.value).toBe("dmy");
    expect(r.detected.decimalMark.value).toBe(",");
    expect(r.stats.totals).toEqual({ expense: 1238.06, income: 3200, refund: 0 });
  });

  it("UK split debit and credit columns, day-first", () => {
    const r = run("Transaction Date,Description,Debit,Credit,Balance\n05/01/2026,Tesco,45.10,,1000\n13/01/2026,Salary,,2000.00,3000\n14/01/2026,Odd,,,3000");
    expect(r.detected.amountStyle).toBe("split");
    expect(r.stats.totals).toEqual({ expense: 45.1, income: 2000, refund: 0 });
    expect(r.stats.skipped).toEqual([{ row: 4, reason: "missing amount" }]);
    expect(dates("Transaction Date,Description,Debit,Credit\n05/01/2026,T,45.10,\n13/01/2026,S,,1")).toEqual(["2026-01-05", "2026-01-13"]);
  });

  it("credit card: charges positive, payments are transfers, returns are refunds", () => {
    const r = run(
      "Transaction Date,Post Date,Description,Category,Type,Amount\n01/05/2026,01/06/2026,AMAZON,Shopping,Sale,25.00\n01/20/2026,01/21/2026,AUTOPAY,,Payment,-100.00\n01/22/2026,01/23/2026,AMAZON,Shopping,Return,-10.00",
    );
    expect(r.stats.totals).toEqual({ expense: 25, income: 0, refund: 10 });
    expect(r.stats.skipped).toEqual([{ row: 3, reason: "transfer (not tracked)", detail: "Payment" }]);
  });

  it("one negative and one positive, no type column, reads as a bank file", () => {
    const r = run("Date,Description,Amount\n2026-02-01,Rewe,-12.34\n2026-04-03,Salary,3200");
    expect(r.detected.signMode.value).toBe("bank");
    expect(r.stats.totals).toEqual({ expense: 12.34, income: 3200, refund: 0 });
  });

  it("a positive footer total doesn't flip the sign guess", () => {
    const r = run("Date,Description,Amount\n2026-02-01,Rewe,-12.34\n2026-04-03,Salary,3200\nTotal,,3187.66\nBalance,,100");
    expect(r.detected.signMode.value).toBe("bank");
  });

  it("card statement with every amount positive and no type", () => {
    const r = run("Date,Description,Amount\n2026-01-05,A,10\n2026-01-06,B,20");
    expect(r.detected.signMode.value).toBe("positive-spend");
    expect(r.stats.totals.expense).toBe(30);
  });

  it("Dr/Cr suffixes decide the direction", () => {
    const r = run("Date,Description,Amount\n2026-01-05,A,45.00 DR\n2026-01-06,B,100.00 CR");
    expect(r.stats.totals).toEqual({ expense: 45, income: 100, refund: 0 });
  });

  it("preamble, repeated header, summary lines", () => {
    const r = run("Account Statement,,\nGenerated 2026-02-01,,\nDate,Description,Amount\n2026-01-05,A,10\nDate,Description,Amount\n2026-01-06,B,20\nTotal,,30\n,,");
    expect(r.stats.transactions).toBe(2);
    expect(r.stats.skipped.map((s) => s.reason)).toEqual(["repeated header row", "summary row (total or balance)"]);
    expect(r.detected.headerRow).toBe(3);
  });

  it("legacy: a negative Expense row is a refund, Type column wins over sign", () => {
    const r = run("Date,Type,Amount\n2026-01-05,Expense,-10\n2026-01-06,Income,-5\n2026-01-07,Expense,7");
    expect(r.stats.totals).toEqual({ expense: 7, income: 5, refund: 10 });
    expect(r.detected.signMode.source).toBe("type");
  });
});

describe("ambiguity asks instead of guessing", () => {
  const csv = "Date,Amount\n01/02/2026,10\n03/04/2026,20";
  it("blocks until the date order is chosen", () => {
    expect(run(csv).needsInput).toEqual(["dateOrder"]);
    expect(dates(csv, { dateOrder: "dmy" })).toEqual(["2026-02-01", "2026-04-03"]);
    expect(dates(csv, { dateOrder: "mdy" })).toEqual(["2026-01-02", "2026-03-04"]);
    expect(run(csv, { dateOrder: "dmy" }).needsInput).toEqual([]);
  });
  it("blocks on conflicting decimal marks", () => {
    const r = run("Date,Amount\n2026-01-01,\"12,50\"\n2026-01-02,12.50");
    expect(r.needsInput).toEqual(["decimalMark"]);
  });
});

describe("bad rows never abort the file", () => {
  it("invalid dates, zero, rounding, unreadable amounts", () => {
    const r = run(
      ["Date,Description,Amount", "2026-02-31,A,10", "13/13/2026,B,10", "2026-01-05,C,0", "2026-01-06,D,0.004", "2026-01-07,E,=1+2", "2026-01-08,F,1e3", "2026-01-09,G,abc", "2026-01-10,H,12.50"].join("\n"),
    );
    expect(r.stats.transactions).toBe(1);
    expect(r.stats.skipped.map((s) => [s.row, s.reason])).toEqual([
      [2, "invalid date"],
      [3, "invalid date"],
      [4, "amount is zero"],
      [5, "amount rounds to zero"],
      [6, "amount isn't a number"],
      [7, "amount isn't a number"],
      [8, "amount isn't a number"],
    ]);
  });

  it("over-long text is shortened with a warning, not rejected", () => {
    const r = run(`Date,Description,Amount,Notes\n2026-01-05,${"x".repeat(600)},5,${"n".repeat(2500)}`);
    expect(r.bundle.transactions[0].description).toHaveLength(500);
    expect(r.bundle.transactions[0].notes).toHaveLength(2000);
    expect(r.warnings.find((w) => w.kind === "truncated")?.rows).toEqual([2, 2]);
  });

  it("missing header gives a clear error", () => {
    expect(() => run("foo,bar\n1,2")).toThrow(/header row/);
  });

  it("overriding a column away from required fields keeps the report alive", () => {
    const r = run("Date,Amount\n2026-01-05,5", { columns: { date: -1 } });
    expect(r.stats.transactions).toBe(0);
    expect(r.warnings.map((w) => w.kind)).toContain("columns");
  });

  it("never throws on junk and only emits rows the database accepts", () => {
    const junk: unknown[] = ["", null, undefined, 0, -1, 1e12, Number.NaN, "x".repeat(900), "2026-02-31", "13/13/2026", "(45)", "=SUM(A1)", "\u0000​", "NULL", "n/a", true, "1,2,3", "🙂", "05/01/2026", 46027, "Transfer", "Expense", "Income", "Refund", "yes", "-"];
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const pick = () => junk[Math.floor(rnd() * junk.length)] as Rows[number][number];
    for (let n = 0; n < 200; n++) {
      const rows: Rows = [["Date", "Type", "Category", "Merchant", "Description", "Amount", "EMI", "Trip", "Notes"]];
      for (let i = 0; i < 15; i++) rows.push(Array.from({ length: 9 }, pick));
      const { bundle } = buildBundle({ expenses: rows });
      for (const t of bundle.transactions) {
        expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(new Date(`${t.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(t.date);
        expect(t.amount).toBeGreaterThan(0);
        expect(t.category.length).toBeGreaterThanOrEqual(1);
        expect(t.category.length).toBeLessThanOrEqual(60);
        expect((t.description ?? "").length).toBeLessThanOrEqual(500);
        expect((t.merchant ?? "").length).toBeLessThanOrEqual(120);
        expect((t.notes ?? "").length).toBeLessThanOrEqual(2000);
      }
      for (const t of bundle.trips) if (t.start_date && t.end_date) expect(t.end_date >= t.start_date).toBe(true);
    }
  });
});

describe("names and settings", () => {
  it("folds case and spacing variants into the first spelling", () => {
    const r = run("Date,Category,Subcategory,Merchant,Payment,Amount\n2026-01-05,Food,Cafe,Blue Bottle,Visa,5\n2026-01-06,food ,CAFE,blue bottle,VISA,6\n2026-01-07,FOOD,cafe,Blue  Bottle,visa,7");
    expect(r.bundle.categories.filter((c) => c.name.toLowerCase() === "food")).toHaveLength(1);
    expect(r.bundle.categories.find((c) => c.name === "Food")?.subcategories).toEqual(["Cafe"]);
    expect(new Set(r.bundle.transactions.map((t) => t.merchant))).toEqual(new Set(["Blue Bottle"]));
    expect(r.bundle.payment_methods).toEqual(["Visa"]);
  });

  it("a Settings sheet in another layout is ignored and does not wipe the defaults", () => {
    expect(parseSettings([["Foo", "Bar"], [1, 2]])).toBeNull();
    const r = buildBundle({ settings: [["Foo", "Bar"]], expenses: parseDelimited("Date,Amount\n2026-01-05,5").rows });
    expect(r.bundle.replace_defaults).toBe(false);
  });

  it("1904 workbook dates", () => {
    const serial1900 = Date.UTC(2026, 0, 5) / 86_400_000 + 25569;
    const r = buildBundle({ expenses: [["Date", "Amount"], [serial1900 - 1462, 10]], date1904: true });
    expect(r.bundle.transactions[0].date).toBe("2026-01-05");
  });

  it("warns about other currencies and duplicate headers", () => {
    const r = run("Date,Amount,Amount,Currency\n2026-01-05,10,99,EUR");
    expect(r.warnings.map((w) => w.kind).sort()).toEqual(["duplicate-header", "other-currency"]);
    expect(r.bundle.transactions[0].amount).toBe(10);
  });

  it("finds the header past a preamble", () => {
    expect(findHeader([["x"], ["y"], ["Posting Date", "Narrative", "Withdrawals", "Deposits"]])?.row).toBe(2);
  });
});

describe("duplicates", () => {
  const f = (ref: string, date: string, amount: number, merchant: string | null, description: string | null = null) => ({ ref, date, amount, merchant, description });
  it("matches on date, amount and merchant or description", () => {
    const existing = [{ date: "2026-01-05", amount: 5, merchant: "Blue Bottle", description: null }];
    expect(matchDuplicates([f("a", "2026-01-05", 5, "blue bottle")], existing)).toEqual(["a"]);
    expect(matchDuplicates([f("a", "2026-01-05", 5, null, "BLUE BOTTLE")], existing)).toEqual(["a"]);
    expect(matchDuplicates([f("a", "2026-01-05", 5, "Other")], existing)).toEqual([]);
    expect(matchDuplicates([f("a", "2026-01-06", 5, "Blue Bottle")], existing)).toEqual([]);
    expect(matchDuplicates([f("a", "2026-01-05", 5.01, "Blue Bottle")], existing)).toEqual([]);
  });
  it("is count-based: two identical coffees, one already imported", () => {
    const existing = [{ date: "2026-01-05", amount: 5, merchant: "Blue Bottle", description: null }];
    expect(matchDuplicates([f("a", "2026-01-05", 5, "Blue Bottle"), f("b", "2026-01-05", 5, "Blue Bottle")], existing)).toEqual(["a"]);
  });
  it("skipRefs removes rows and whole plans from the bundle", () => {
    const csv = "Date,Merchant,Description,Amount,EMI\n2026-01-05,A,Coffee,5,\n2026-01-06,B,Laptop EMI 0 (plan $20 / 2),10,Yes\n2026-02-06,B,Laptop EMI 1 (plan $20 / 2),10,Yes";
    const all = run(csv);
    expect(all.stats.transactions).toBe(2);
    const r = run(csv, { skipRefs: ["r2", "plan-r3"] });
    expect(r.stats.transactions).toBe(0);
    expect(r.stats.duplicates).toBe(2);
    expect(r.bundle.plans).toEqual([]);
    expect(r.stats.totals.expense).toBe(0);
  });
});
