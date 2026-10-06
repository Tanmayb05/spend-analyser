import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { createConfirmedUser, signIn, userClient } from "./helpers";
import { TEST_USER } from "./test-user";

// Monthly totals computed straight from the Expenses sheet (expense − refund, income), all rows.
const EXCEL: Record<string, [number, number]> = {
  "2025-07": [9.83, 0], "2025-08": [1784.75, 0], "2025-09": [2106.52, 0], "2025-10": [2059.71, 32.27],
  "2025-11": [2121.4, 432.04], "2025-12": [1844.02, 106.7], "2026-01": [1832.82, 764.15], "2026-02": [2321.11, 690.44],
  "2026-03": [2177.52, 489.17], "2026-04": [1919.83, 841.02], "2026-05": [1973.23, 825.01], "2026-06": [961.83, 1137.62],
  "2026-07": [1106.57, 784.94], "2026-08": [1673.98, 992.1], "2026-09": [1882.19, 901.14], "2026-10": [1408.21, 0],
  "2026-11": [1160.21, 0], "2026-12": [606.71, 0],
};

test.describe("workbook import", () => {
  test.skip(!existsSync("Expense_Tracker.xlsx"), "workbook not present");

  test("imports Expense_Tracker.xlsx and matches Excel month by month", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "run once");
    const email = TEST_USER.email.replace("@", "+import@");
    await createConfirmedUser(email, TEST_USER.password, "Importer");
    await signIn(page, email, TEST_USER.password);

    // empty dashboard
    await expect(page.getByText("No transactions yet")).toBeVisible();

    await page.goto("/settings/data");
    await page.getByLabel("Choose file to import").setInputFiles("Expense_Tracker.xlsx");
    await expect(page.getByText("EMI plans", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Import \d+ transactions/ })).toBeVisible();
    await page.getByRole("button", { name: /Import \d+ transactions/ }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });

    // ledger parity (cash mode = how Excel counts EMI rows)
    const sb = userClient();
    await sb.auth.signInWithPassword({ email, password: TEST_USER.password });
    const { data, error } = await sb.rpc("ledger", { p_mode: "cash", p_from: "2025-01-01", p_to: "2027-12-31" });
    expect(error).toBeNull();
    const byMonth = new Map<string, [number, number]>();
    for (const r of data ?? []) {
      const k = r.month.slice(0, 7);
      const v = byMonth.get(k) ?? [0, 0];
      v[0] += Number(r.spend);
      v[1] += Number(r.income);
      byMonth.set(k, v);
    }
    for (const [m, [spent, income]] of Object.entries(EXCEL)) {
      const got = byMonth.get(m) ?? [0, 0];
      expect.soft(Math.round(got[0] * 100) / 100, `${m} spent`).toBe(spent);
      expect.soft(Math.round(got[1] * 100) / 100, `${m} income`).toBe(income);
    }

    // dashboard shows the September numbers
    await page.goto("/?m=2026-09&mode=cash");
    await expect(page.getByText("$1,882").first()).toBeVisible();
    await expect(page.getByText("$901").first()).toBeVisible();
    await page.screenshot({ path: "test-results/dashboard-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/dashboard-mobile.png", fullPage: true });
  });
});
