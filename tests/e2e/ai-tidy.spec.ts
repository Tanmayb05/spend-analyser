import { expect, test } from "@playwright/test";
import { createConfirmedUser, signIn, userClient } from "./helpers";
import { TEST_USER } from "./test-user";
import { buildBundle } from "../../src/lib/import/workbook";

// Tidy-up, unusual-spending check and Ask your data, end to end with the offline provider.
// Needs the dev server started with AI_PROVIDER=mock; skipped otherwise.
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

test("AI tidy-up, anomaly check and Q&A (mock provider)", async ({ page }, info) => {
  const email = TEST_USER.email.replace("@", `+tidy-${info.project.name}@`);
  await createConfirmedUser(email, TEST_USER.password);

  // one row with no category (→ Uncategorized) and a same-day-ish duplicate pair
  const sb = userClient();
  await sb.auth.signInWithPassword({ email, password: TEST_USER.password });
  const { bundle } = buildBundle(
    {
      expenses: [
        ["Date", "Type", "Category", "Subcategory", "Amount", "Merchant"],
        [day(-5), "expense", "", "", 12, "Kroger"],
        [day(-3), "expense", "Groceries", "Groceries", 25, "Corner Shop"],
        [day(-2), "expense", "Groceries", "Groceries", 25, "Corner Shop"],
      ],
    },
    { replaceDefaults: false },
  );
  const { error } = await sb.rpc("import_bundle", { p: bundle });
  expect(error).toBeNull();

  await signIn(page, email, TEST_USER.password);
  await page.goto("/settings/ai");
  test.skip(!(await page.getByText("Provider: Mock AI").isVisible()), "dev server is not running with AI_PROVIDER=mock");
  await expect(page.getByText("Tidy-up runs")).toBeVisible();

  // Categorise: suggest → review → apply
  await page.goto("/settings/tidy");
  await expect(page.getByText("1 transaction to check.")).toBeVisible();
  await page.getByRole("button", { name: "Suggest" }).first().click(); // first card: Categorise
  await expect(page.getByRole("checkbox", { name: "Recategorise Kroger" })).toBeChecked();
  await expect(page.getByText("Groceries › Groceries")).toBeVisible();
  await page.getByRole("button", { name: "Apply 1" }).click();
  await expect(page.getByText("Recategorised 1 transaction")).toBeVisible();
  await expect(page.getByText("Nothing to check right now.")).toBeVisible();

  // Unusual & duplicates: SQL finds the pair, the (mock) AI explains it
  await page.goto("/insights");
  await page.getByRole("button", { name: "Check now" }).click();
  await expect(page.getByText("Mock: same amount at the same merchant two days apart.")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss Corner Shop" }).click();
  await expect(page.getByText("Mock: same amount at the same merchant two days apart.")).toBeHidden();

  // Ask your data
  await page.getByRole("button", { name: "How much did I spend on food last month?" }).click();
  await expect(page.getByText("Mock answer: you spent $120 on Food last month.")).toBeVisible();
});
