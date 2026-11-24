import { expect, test, type Page } from "@playwright/test";
import { createConfirmedUser, signIn, openAddForm, pickCategory } from "./helpers";
import { TEST_USER } from "./test-user";

async function openAdd(page: Page) {
  await openAddForm(page);
}

test("add, edit, spread, delete + undo", async ({ page }, info) => {
  const email = TEST_USER.email.replace("@", `+crud-${info.project.name}@`);
  await createConfirmedUser(email, TEST_USER.password);
  await signIn(page, email, TEST_USER.password);

  const month = new Date().toISOString().slice(0, 7);

  // add
  await openAdd(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount", { exact: true }).fill("42.50");
  await dialog.getByLabel("Merchant", { exact: true }).fill("Kroger");
  await pickCategory(dialog, "Groceries");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Added")).toBeVisible();

  await page.goto(`/transactions?m=${month}`);
  await expect(page.getByRole("button", { name: /Kroger/ })).toBeVisible();
  await expect(page.getByText("$42.50").first()).toBeVisible();

  // merchant remembers category
  await openAdd(page);
  await dialog.getByLabel("Merchant", { exact: true }).fill("Kroger");
  await expect(dialog.getByRole("group", { name: "Recent categories" }).getByRole("button", { name: "Groceries", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");

  // edit
  await page.getByRole("button", { name: /Kroger/ }).first().click();
  // clicking a row opens a read-only detail panel first; "Edit" hands over to the form
  await expect(dialog.getByText("−$42.50")).toBeVisible();
  await dialog.getByRole("button", { name: "Edit" }).click();
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveValue("42.5");
  await dialog.getByLabel("Amount", { exact: true }).fill("50");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await expect(page.getByText("$50.00").first()).toBeVisible();

  // spread $1,200 over 12 months
  await openAdd(page);
  await dialog.getByLabel("Amount", { exact: true }).fill("1200");
  await dialog.getByLabel("Merchant", { exact: true }).fill("Apple");
  await pickCategory(dialog, "Shopping");
  await dialog.getByRole("button", { name: "Spread this cost over months" }).click();
  await dialog.getByRole("checkbox").check();
  await dialog.getByLabel("Months", { exact: true }).fill("12");
  await expect(dialog.getByText(/\$100\.00\/mo/)).toBeVisible();
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Added")).toBeVisible();

  await page.goto(`/?m=${month}`);
  await expect(page.getByText("$150").first()).toBeVisible(); // 50 + 100 installment (smoothed)

  // delete + undo
  await page.goto(`/transactions?m=${month}`);
  await page.getByRole("button", { name: /Kroger/ }).first().click();
  await dialog.getByRole("button", { name: "Edit" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Tap again to delete" }).click();
  await expect(page.getByText("Deleted")).toBeVisible();
  await expect(page.getByRole("button", { name: /Kroger/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: /Kroger/ })).toBeVisible();

  await page.screenshot({ path: `test-results/transactions-${info.project.name}.png`, fullPage: true });
});
