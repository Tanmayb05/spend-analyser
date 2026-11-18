import path from "node:path";
import { expect, test } from "@playwright/test";
import { createConfirmedUser, signIn } from "./helpers";
import { TEST_USER } from "./test-user";

// Runs the AI flows end-to-end without a network or key. Needs the dev server started with
// AI_PROVIDER=mock (e.g. `AI_PROVIDER=mock npm run dev`); skipped otherwise.
test("AI flows work through the provider layer (mock provider)", async ({ page }, info) => {
  const email = TEST_USER.email.replace("@", `+ai-${info.project.name}@`);
  await createConfirmedUser(email, TEST_USER.password);
  await signIn(page, email, TEST_USER.password);

  await page.goto("/settings/ai");
  test.skip(!(await page.getByText("Provider: Mock AI").isVisible()), "dev server is not running with AI_PROVIDER=mock");
  await expect(page.getByText("What is sent to Mock AI")).toBeVisible();

  // Smart Add: text → prefilled form
  await page.goto("/");
  await page.getByRole("button", { name: "Add transaction" }).filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Describe a transaction").fill("lunch 12.50 at mock cafe");
  await dialog.getByRole("button", { name: "Fill" }).click();
  await expect(dialog.getByLabel("Merchant", { exact: true })).toHaveValue("Mock Cafe");
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveValue("12.5");

  // Receipt: upload → extracted items to review
  await dialog.getByRole("button", { name: "Read a receipt" }).click();
  await page.getByLabel("Receipt file").setInputFiles(path.join(__dirname, "../fixtures/receipts/receipt.png"));
  await expect(page.getByLabel("Item 1 name")).toHaveValue(/Milk/);
  await expect(page.getByLabel("Item 2 name")).toHaveValue(/Bananas/);

  // Usage meter moved: 2 smart entries used
  await page.goto("/settings/ai");
  const limit = Number(process.env.AI_LIMIT_PARSE ?? 100);
  await expect(page.getByText(new RegExp(`^${limit - 2}\\s*/\\s*${limit} left$`))).toBeVisible();
});
