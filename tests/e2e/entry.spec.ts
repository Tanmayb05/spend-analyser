import { expect, test } from "@playwright/test";
import { createConfirmedUser, openAddForm, pickCategory, signIn } from "./helpers";
import { TEST_USER } from "./test-user";

test("form: Add & another keeps the date; usual merchants and categories become one-tap chips", async ({ page }, info) => {
  const email = TEST_USER.email.replace("@", `+entry-${info.project.name}@`);
  await createConfirmedUser(email, TEST_USER.password);
  await signIn(page, email, TEST_USER.password);

  const dialog = await openAddForm(page);
  const amount = dialog.getByLabel("Amount", { exact: true });
  await amount.fill("5");
  await dialog.getByLabel("Merchant", { exact: true }).fill("Kroger");
  await pickCategory(dialog, "Groceries");
  await dialog.getByRole("button", { name: "Yesterday" }).click();
  await dialog.getByRole("button", { name: "Add & another" }).click();
  await expect(page.getByText("Added").first()).toBeVisible();

  // the form stays open, cleared, with the date kept and the amount focused for the next one
  await expect(amount).toHaveValue("");
  await expect(amount).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Yesterday" })).toHaveAttribute("aria-pressed", "true");

  // history now offers Kroger as a chip; picking it fills the category from last time
  await amount.fill("7");
  await dialog.getByRole("group", { name: "Recent merchants" }).getByRole("button", { name: "Kroger" }).click();
  await expect(dialog.getByRole("group", { name: "Recent categories" }).getByRole("button", { name: "Groceries", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

// Describe it needs the mock AI provider: start the dev server with AI_PROVIDER=mock; skipped otherwise.
test("default entry method: Describe it, switch inside the sheet, and the saved preference", async ({ page }, info) => {
  const email = TEST_USER.email.replace("@", `+entrym-${info.project.name}@`);
  await createConfirmedUser(email, TEST_USER.password);
  await signIn(page, email, TEST_USER.password);
  await page.goto("/settings/ai");
  await page.getByText(/^Provider: /).waitFor();
  test.skip(!(await page.getByText("Provider: Mock AI").isVisible()), "dev server is not running with AI_PROVIDER=mock");

  const add = () => page.getByRole("button", { name: "Add transaction" }).filter({ visible: true }).first().click();

  // default: Describe it. type → card → Save
  await page.goto("/");
  await add();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Describe a transaction").fill("lunch 12.50 at mock cafe");
  await dialog.getByRole("button", { name: "Read it" }).click();
  const card = dialog.getByRole("region", { name: "Transaction 1" });
  await expect(card.getByText("Mock Cafe")).toBeVisible();
  const category = card.getByLabel("Category", { exact: true });
  if (await category.isVisible()) await category.selectOption({ label: "Dining & Drinks" });
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("list", { name: "Added just now" }).getByText("Mock Cafe")).toBeVisible();

  // Edit hands the entry to the form, prefilled
  await dialog.getByLabel("Describe a transaction").fill("lunch 12.50 at mock cafe");
  await dialog.getByRole("button", { name: "Read it" }).click();
  await dialog.getByRole("region", { name: "Transaction 1" }).getByRole("button", { name: "Edit" }).click();
  await expect(dialog.getByLabel("Merchant", { exact: true })).toHaveValue("Mock Cafe");
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveValue("12.5");
  await page.keyboard.press("Escape");

  // the in-sheet switch works for one entry
  await add();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Form" }).click();
  await expect(dialog.getByLabel("Amount", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // saved preference: Form
  await page.goto("/settings/preferences");
  await page.getByRole("radio", { name: "Form" }).click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("radio", { name: "Form" })).toHaveAttribute("aria-checked", "true");
  }).toPass();
  await page.goto("/");
  await add();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Amount", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Describe a transaction")).toHaveCount(0);
  await dialog.getByRole("radio", { name: "Describe it" }).click();
  await expect(dialog.getByLabel("Describe a transaction")).toBeVisible();
});
