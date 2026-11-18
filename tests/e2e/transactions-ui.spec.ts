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

  // toolbar: period + search on top; All activity / Everyday switch, Filters and Sort beneath
  await expect(page.getByRole("radio", { name: "All activity" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Everyday" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Filters/ })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Sort" })).toBeVisible();
  // the Smoothed / Cash flow toggle is gone: smoothed is the only view
  await expect(page.getByRole("radio", { name: "Smoothed" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Cash flow" })).toHaveCount(0);
  // Type and Category live in the Filters sheet
  await page.getByRole("button", { name: /^Filters/ }).click();
  for (const name of ["Type", "Category"]) {
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  }
  await page.getByRole("button", { name: "Done" }).click();

  // Activity / Plans / EMIs / Cards switch
  await page.getByRole("radio", { name: "Plans" }).click();
  await expect(page).toHaveURL(/tab=plans/);
  await page.getByRole("radio", { name: "EMIs" }).click();
  await expect(page).toHaveURL(/tab=emis/);
  await page.getByRole("radio", { name: "Activity" }).click();
  await expect(page).not.toHaveURL(/tab=/);

  // expenses read −$42.50 in the list
  await expect(page.getByText("−$42.50").first()).toBeVisible();

  // Everyday view: income is outside it, so it reads "—" rather than $0
  await page.getByRole("radio", { name: "Everyday" }).click();
  await expect(page).toHaveURL(/core=1/);
  await expect(page.getByText("Not part of Everyday")).toBeVisible();
  await page.getByRole("radio", { name: "All activity" }).click();
  await expect(page).not.toHaveURL(/core=1/);

  // Spent card: always Jan..Dec
  const bars = page.getByRole("button", { name: /: Spent / });
  await expect(bars).toHaveCount(12);

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
