import { expect, test, type Page } from "@playwright/test";
import { createConfirmedUser, signIn } from "./helpers";
import { TEST_USER } from "./test-user";

async function addTxn(page: Page, amount: string, merchant: string, category: string) {
  await page.getByRole("button", { name: "Add transaction" }).filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Amount", { exact: true }).fill(amount);
  await dialog.getByLabel("Merchant", { exact: true }).fill(merchant);
  await dialog.getByLabel("Category", { exact: true }).selectOption({ label: category });
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Added")).toBeVisible();
}

test("transactions: labeled filters, period picker, Jan–Dec bars, year view, search suggestions", async ({ page }, info) => {
  const email = TEST_USER.email.replace("@", `+txui-${info.project.name}@`);
  await createConfirmedUser(email, TEST_USER.password);
  await signIn(page, email, TEST_USER.password);
  await addTxn(page, "42.50", "Kroger", "Groceries");

  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const monthIdx = now.getUTCMonth();
  await page.goto(`/transactions?m=${month}`);

  // labeled filters, including the Accounting toggle; Everyday only sits beside the period selector
  for (const name of ["Accounting", "Type", "Category"]) {
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByRole("radio", { name: "Smoothed" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Cash flow" })).toBeVisible();
  const everyday = page.getByRole("button", { name: "Everyday only", exact: true });
  const trigger = page.getByRole("button", { name: /\d{4}$/ }).first();
  const eb = await everyday.boundingBox();
  const tb = await trigger.boundingBox();
  expect(eb && tb && Math.abs(eb.y - tb.y) < 40).toBeTruthy(); // same row

  // Spent card: always Jan..Dec
  const bars = page.getByRole("button", { name: /: Spent / });
  await expect(bars).toHaveCount(12);

  // bar colors follow the accounting mode (blue = Smoothed, purple = Cash flow)
  const barColor = () => bars.nth(monthIdx).locator("div").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  const smoothed = await barColor();
  await page.goto(`/transactions?m=${month}&mode=cash`);
  const cash = await barColor();
  expect(cash).not.toBe(smoothed);
  await page.goto(`/transactions?m=${month}`);

  // month bar: click previews, does not navigate; the View button does
  const other = monthIdx === 0 ? 1 : 0;
  await bars.nth(other).click();
  await expect(page).toHaveURL(new RegExp(`m=${month}`));
  const view = page.getByRole("link", { name: /^View / });
  await expect(view).toBeVisible();
  await view.click();
  await expect(page).not.toHaveURL(new RegExp(`m=${month}`));

  // period picker: open, choose a month
  await page.goto(`/transactions?m=${month}`);
  await page.getByRole("button", { name: /\d{4}$/ }).first().click();
  const panel = page.getByRole("dialog", { name: "Choose month" });
  await expect(panel).toBeVisible();
  await panel.getByRole("link", { name: monthIdx === 5 ? "Jan" : "Jun", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`m=${now.getUTCFullYear()}-0[16]`));

  // year view: KPIs, no ledger
  await page.goto(`/transactions?m=${month}`);
  await page.getByRole("radio", { name: "Year" }).click();
  await expect(page).toHaveURL(/view=year/);
  await expect(page.getByText("Total spend", { exact: true })).toBeVisible();
  await expect(page.getByText("Total income", { exact: true })).toBeVisible();
  // no income recorded for this user, so saved/loss is neutral instead of a misleading "Loss"
  await expect(page.getByText("Saved / loss", { exact: true })).toBeVisible();
  await expect(page.getByText("No income in this period")).toBeVisible();
  await expect(page.getByRole("button", { name: /Kroger/ })).toHaveCount(0); // no ledger rows in the year view
  await page.getByRole("radio", { name: "Month" }).click();
  await expect(page).not.toHaveURL(/view=year/);

  // search suggestions: merchant pick adds a filter chip
  await page.goto(`/transactions?m=${month}`);
  const search = page.getByRole("combobox", { name: "Search" });
  await search.fill("kro");
  const list = page.getByRole("listbox", { name: "Search suggestions" });
  await expect(list.getByRole("option", { name: /Kroger/ })).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(page).toHaveURL(/merchant=/);
  await expect(page.getByRole("button", { name: /Kroger/ }).first()).toBeVisible();
});
