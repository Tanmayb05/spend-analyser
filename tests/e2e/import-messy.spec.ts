import { expect, test } from "@playwright/test";
import { createConfirmedUser, signIn, userClient } from "./helpers";
import { TEST_USER } from "./test-user";

// A European bank export: semicolons, dd.mm.yyyy that fits both orders, decimal commas, a preamble and a footer.
const CSV = [
  "Konto: 12345;;",
  "Date;Description;Amount",
  "01.02.2026;Rewe;-1.234,56",
  "03.04.2026;Gehalt;3.200,00",
  "Total;;1.965,44",
].join("\n");

test.describe("messy import", () => {
  test("asks for the date order, imports, then skips the same file as duplicates", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "run once");
    const email = TEST_USER.email.replace("@", "+messy@");
    await createConfirmedUser(email, TEST_USER.password, "Messy");
    await signIn(page, email, TEST_USER.password);

    const file = { name: "bank.csv", mimeType: "text/csv", buffer: Buffer.from(CSV, "utf-8") };
    await page.goto("/settings/data");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Choose file to import").setInputFiles(file);

    // both dates fit day-first and month-first: import is blocked until one is chosen
    await expect(page.getByText("Every date in this file fits both orders")).toBeVisible();
    await expect(page.getByRole("button", { name: /Import \d+ transactions/ })).toBeDisabled();
    await expect(page.getByText("1 row will be skipped")).toBeVisible();
    await page.getByRole("radio", { name: "Day first" }).click();
    const importBtn = page.getByRole("button", { name: "Import 2 transactions" });
    await expect(importBtn).toBeEnabled();
    await importBtn.click();
    await expect(page).toHaveURL(/\/settings\/tidy/, { timeout: 30_000 });

    const sb = userClient();
    await sb.auth.signInWithPassword({ email, password: TEST_USER.password });
    const { data, error } = await sb.from("transactions").select("date, amount, type").order("date");
    expect(error).toBeNull();
    expect(data?.map((t) => [t.date, Number(t.amount), t.type])).toEqual([
      ["2026-02-01", 1234.56, "expense"],
      ["2026-04-03", 3200, "income"],
    ]);

    // same file again: everything already exists
    await page.goto("/settings/data");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Choose file to import").setInputFiles(file);
    await page.getByRole("radio", { name: "Day first" }).click();
    await expect(page.getByText(/Also import the 2 rows that look already imported/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Import 0 transactions" })).toBeDisabled();
  });
});
