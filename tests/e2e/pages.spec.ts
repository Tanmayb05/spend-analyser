import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { createConfirmedUser, importWorkbookAs, signIn } from "./helpers";
import { TEST_USER } from "./test-user";

test.describe.configure({ mode: "serial" });
test.skip(!existsSync("Expense_Tracker.xlsx"), "workbook not present");

const PAGES = [
  ["/", "Overview"],
  ["/?m=2026-09&scope=core", "Overview"],
  ["/transactions?m=2026-09", "Transactions"],
  ["/trips", "Trips"],
  ["/plans", "Plans & EMIs"],
  ["/items", "Items"],
  ["/insights", "Insights"],
  ["/settings", "Settings"],
  ["/settings/profile", "Profile"],
  ["/settings/preferences", "Preferences"],
  ["/settings/categories", "Categories"],
  ["/settings/budgets", "Budgets"],
  ["/settings/payments", "Payment methods"],
  ["/settings/people", "People"],
  ["/settings/merchants", "Merchants"],
  ["/settings/ai", "AI"],
  ["/settings/data", "Import & export"],
  ["/settings/security", "Security"],
] as const;

test("every page renders with real data", async ({ page }, info) => {
  const email = TEST_USER.email.replace("@", `+pages-${info.project.name}@`);
  await createConfirmedUser(email, TEST_USER.password);
  await importWorkbookAs(email, TEST_USER.password);
  await signIn(page, email, TEST_USER.password);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  for (const [path, heading] of PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1, name: heading }), path).toBeVisible();
    // every page explains itself behind the ⓘ next to its title
    if (path !== "/settings") await expect(page.locator("details:has(h1) > summary"), path).toHaveCount(1);
    await page.screenshot({ path: `test-results/pages/${info.project.name}${path.replace(/[/?=&]/g, "_") || "_root"}.png`, fullPage: true });
  }
  // a trip detail page
  await page.goto("/trips");
  await page.getByText("SF Bay Trip 2026-07").click();
  await expect(page.getByRole("heading", { level: 1, name: "SF Bay Trip 2026-07" })).toBeVisible();

  // info panels: open on tap; KPI overlays close on a tap elsewhere
  await page.goto("/");
  await page.getByRole("heading", { level: 1, name: "Overview" }).click();
  await expect(page.getByText(/Normalized spreads big costs/)).toBeVisible();
  const spent = page.getByRole("group", { name: "Spent", exact: true });
  await spent.locator("summary").click();
  await expect(spent.getByText(/Expenses minus refunds/)).toBeVisible();
  await page.getByRole("heading", { level: 1, name: "Overview" }).click();
  await expect(spent.getByText(/Expenses minus refunds/)).toBeHidden();
  expect(errors).toEqual([]);
});

test("budgets carry forward and change from a month onward", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const email = TEST_USER.email.replace("@", "+budgets@");
  await createConfirmedUser(email, TEST_USER.password);
  await signIn(page, email, TEST_USER.password);

  await page.goto("/settings/budgets?m=2026-10");
  const input = page.getByLabel("Budget for Groceries");
  await input.fill("200");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Budget saved")).toBeVisible();

  await page.goto("/settings/budgets?m=2026-11");
  await expect(page.getByLabel("Budget for Groceries")).toHaveValue("200");

  await page.goto("/settings/budgets?m=2026-12");
  await page.getByLabel("Budget for Groceries").fill("250");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Budget saved")).toBeVisible();

  await page.goto("/settings/budgets?m=2026-11");
  await expect(page.getByLabel("Budget for Groceries")).toHaveValue("200");

  // editing Oct now asks about the later (Dec) change
  await page.goto("/settings/budgets?m=2026-10");
  await page.getByLabel("Budget for Groceries").fill("180");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/later budget change/)).toBeVisible();
  await page.getByRole("button", { name: /from now on/ }).click();
  await expect(page.getByText("Budget saved")).toBeVisible();
  await page.goto("/settings/budgets?m=2027-01");
  await expect(page.getByLabel("Budget for Groceries")).toHaveValue("180");
});

test("trip counting modes change monthly totals", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const email = TEST_USER.email.replace("@", "+trips@");
  await createConfirmedUser(email, TEST_USER.password);
  await signIn(page, email, TEST_USER.password);

  // create trip (excluded by default) and add an expense to it
  await page.goto("/trips");
  await page.getByRole("button", { name: "New trip" }).first().click();
  await page.getByLabel("Trip name", { exact: true }).fill("Goa");
  await page.getByLabel("Start", { exact: true }).fill("2026-10-01");
  await page.getByLabel("End", { exact: true }).fill("2026-10-04");
  await page.getByRole("button", { name: "Create trip" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Goa" })).toBeVisible();
  await page.getByRole("button", { name: "Add expense" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Amount", { exact: true }).fill("300");
  await d.getByLabel("Date", { exact: true }).fill("2026-10-02");
  await d.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Added")).toBeVisible();

  await page.goto("/?m=2026-10&mode=cash");
  await expect(page.getByText("No transactions yet")).toBeVisible(); // excluded trip: nothing counted
  await page.goto("/trips");
  await expect(page.getByText("$300").first()).toBeVisible();

  // switch to lump sum
  await page.getByText("Goa").click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("radio", { name: /One lump sum/ }).click();
  await page.getByRole("button", { name: "Save trip" }).click();
  await expect(page.getByText("Trip saved")).toBeVisible();
  await page.goto("/?m=2026-10&mode=cash");
  await expect(page.getByText("$300").first()).toBeVisible();
});

test("export xlsx round-trips through the importer", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const email = TEST_USER.email.replace("@", "+export@");
  await createConfirmedUser(email, TEST_USER.password);
  const sb = await importWorkbookAs(email, TEST_USER.password);
  await signIn(page, email, TEST_USER.password);

  await page.goto("/settings/data");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByText("Excel (.xlsx)").click()]);
  const path = await dl.path();
  const wb = XLSX.read(readFileSync(path!), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets.Expenses, { header: 1, raw: true });
  expect(rows[0].slice(0, 12)).toEqual(["Date", "Type", "Category", "Subcategory", "Merchant", "Description", "Amount", "Payment", "Paid By", "Trip", "EMI", "Receipt"]);
  expect(rows.length - 1).toBe(419); // installments expand back to one row each

  const { buildBundle } = await import("../../src/lib/import/workbook");
  const report = buildBundle({ expenses: rows });
  expect(report.stats.plans).toBe(19);
  const { data } = await sb.rpc("ledger", { p_mode: "cash", p_from: "2025-01-01", p_to: "2027-12-31" });
  const ledgerTotal = (data ?? []).reduce((a: number, r: { spend: number }) => a + Number(r.spend), 0);
  const fileTotal = report.stats.totals.expense - report.stats.totals.refund;
  expect(Math.round(fileTotal * 100)).toBe(Math.round(ledgerTotal * 100));
});

test("changing default currency converts everything", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const email = TEST_USER.email.replace("@", "+fx@");
  await createConfirmedUser(email, TEST_USER.password);
  await signIn(page, email, TEST_USER.password);
  // one USD expense
  await page.getByRole("button", { name: "Add transaction" }).filter({ visible: true }).first().click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Amount", { exact: true }).fill("100");
  await d.getByLabel("Category", { exact: true }).selectOption({ label: "Groceries" });
  await d.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Added")).toBeVisible();

  await page.goto("/settings/preferences");
  await page.getByLabel("Default currency").selectOption("INR");
  await expect(page.getByText(/will be converted to INR/)).toBeVisible();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText(/Switched to INR/)).toBeVisible({ timeout: 30_000 });
  await page.goto("/");
  // KPI is in rupees; the original USD amount is kept as the secondary label on the transaction
  await expect(page.getByRole("group", { name: "Spent", exact: true }).getByText(/^₹[\d,]+$/)).toBeVisible();
  await expect(page.getByText("$100.00").first()).toBeVisible();
});
