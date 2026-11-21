import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createConfirmedUser, signIn } from "./helpers";
import { TEST_USER } from "./test-user";

// Scan flow end-to-end with the mock AI provider (the mock receipt is "Mock Market", total 10.00, dated today).
// Needs the dev server started with AI_PROVIDER=mock; skipped otherwise.
const PNG = fs.readFileSync(path.join(__dirname, "../fixtures/receipts/receipt.png"));
/** a distinct file per call: same PNG header, different trailing byte, so each is a new receipt */
const png = (n: number, name = `r${n}.png`) => ({ name, mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.from([n])]) });

async function openReader(page: Page) {
  await page.getByRole("button", { name: "Add transaction" }).filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Read a receipt" }).click();
  return dialog;
}

async function setup(page: Page, info: { project: { name: string } }, tag: string) {
  const email = TEST_USER.email.replace("@", `+${tag}-${info.project.name}@`);
  await createConfirmedUser(email, TEST_USER.password);
  await signIn(page, email, TEST_USER.password);
  await page.goto("/settings/ai");
  await page.getByText(/^Provider: /).waitFor();
  test.skip(!(await page.getByText("Provider: Mock AI").isVisible()), "dev server is not running with AI_PROVIDER=mock");
}

test("scan: link with a tip, create new, park, unlink", async ({ page }, info) => {
  await setup(page, info, "rcpt");
  const month = new Date().toISOString().slice(0, 7);

  // a bank-style transaction, $2.50 above the receipt total (a tip)
  await page.goto("/");
  await page.getByRole("button", { name: "Add transaction" }).filter({ visible: true }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount", { exact: true }).fill("12.50");
  await dialog.getByLabel("Merchant", { exact: true }).fill("Mock Market");
  await dialog.getByLabel("Category", { exact: true }).selectOption({ label: "Dining & Drinks" });
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Added")).toBeVisible();

  // read → review → the transaction is offered as a match
  dialog = await openReader(page);
  await page.getByLabel("Receipt files").setInputFiles(png(1));
  await page.getByRole("button", { name: "Read receipt" }).click();
  await expect(page.getByLabel("Item 1 name")).toHaveValue(/Milk/);
  await expect(page.getByLabel("Receipt total")).toHaveValue("10");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(dialog.getByText("Nothing is linked until you confirm")).toBeVisible();
  await dialog.getByRole("checkbox", { name: /Mock Market/ }).check();
  await dialog.getByRole("button", { name: "Link to this transaction" }).click();

  // the leftover must be explained: tip
  await expect(dialog.getByText(/higher than the receipt/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Link receipt" })).toBeDisabled();
  await dialog.getByRole("radio", { name: "Tip" }).click();
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveValue("2.5");
  await dialog.getByRole("button", { name: "Link receipt" }).click();
  await expect(page.getByText(/Receipt linked and the extra transaction/)).toBeVisible();

  // two rows now: the receipt amount and a Tip transaction; the receipt shows in the detail
  await page.goto(`/transactions?m=${month}`);
  await expect(page.getByText("Dining & Drinks › Tip")).toBeVisible();
  await expect(page.getByText(/\$10\.00/).first()).toBeVisible();
  await expect(page.getByText(/\$2\.50/).first()).toBeVisible();
  await page.getByRole("button", { name: /Mock Market/ }).first().click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: /^Receipt/ })).toBeVisible();
  await dialog.getByRole("button", { name: /^Receipt/ }).click();
  await expect(dialog.getByText("Whole Milk")).toBeVisible();
  await dialog.getByRole("button", { name: "Unlink" }).click();
  await dialog.getByRole("button", { name: "Confirm unlink" }).click();
  await expect(page.getByText("Receipt unlinked and moved to the inbox")).toBeVisible();

  // create a new transaction from a receipt
  await page.goto("/");
  dialog = await openReader(page);
  await page.getByLabel("Receipt files").setInputFiles(png(2));
  await page.getByRole("button", { name: "Read receipt" }).click();
  await expect(page.getByLabel("Item 1 name")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "New transaction" }).click();
  await dialog.getByLabel("Category", { exact: true }).selectOption({ label: "Groceries" });
  await dialog.getByRole("button", { name: "Create transaction" }).click();
  await expect(page.getByText(/Transaction created/)).toBeVisible();

  // park one for later
  await page.goto("/");
  dialog = await openReader(page);
  await page.getByLabel("Receipt files").setInputFiles(png(3));
  await page.getByRole("button", { name: "Read receipt" }).click();
  await expect(page.getByLabel("Item 1 name")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Keep in inbox" }).click();
  await expect(page.getByText("Kept in the inbox")).toBeVisible();
});

test("scan: several files ask one receipt or separate; pages stay in one receipt", async ({ page }, info) => {
  await setup(page, info, "rpage");
  await page.goto("/");
  const dialog = await openReader(page);
  await page.getByLabel("Receipt files").setInputFiles([png(11, "page-a.png"), png(12, "page-b.png")]);
  await expect(dialog.getByRole("radio", { name: "One receipt" })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "Separate receipts" })).toBeVisible();
  await page.getByRole("button", { name: "Read receipt" }).click();
  await expect(dialog.getByText(/found on 2 pages/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Page 2/ })).toBeVisible();
});

/** Reads the mock receipt and keeps it in the inbox (the mock receipt is "Mock Market", total 10.00, dated today). */
async function parkOne(page: Page, n: number) {
  await page.goto("/");
  const dialog = await openReader(page);
  await page.getByLabel("Receipt files").setInputFiles(png(n));
  await page.getByRole("button", { name: "Read receipt" }).click();
  await expect(page.getByLabel("Item 1 name")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Keep in inbox" }).click();
  await expect(page.getByText("Kept in the inbox")).toBeVisible();
}

test("inbox: a parked receipt shows a likely match, links later, and another can be deleted", async ({ page }, info) => {
  await setup(page, info, "rinbox");
  await parkOne(page, 21);
  await parkOne(page, 22);

  await page.goto("/items?tab=inbox");
  await expect(page.getByRole("link", { name: "Inbox (2)" })).toBeVisible();
  await expect(page.getByTestId("inbox-row")).toHaveCount(2);
  await expect(page.getByText("Kept for later").first()).toBeVisible();
  await expect(page.getByText(/likely match/)).toHaveCount(0);

  // the statement import (here: a manual transaction) arrives afterwards
  await page.goto("/");
  await page.getByRole("button", { name: "Add transaction" }).filter({ visible: true }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount", { exact: true }).fill("10.00");
  await dialog.getByLabel("Merchant", { exact: true }).fill("Mock Market");
  await dialog.getByLabel("Category", { exact: true }).selectOption({ label: "Groceries" });
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Added")).toBeVisible();

  await page.goto("/items?tab=inbox");
  await expect(page.getByText(/1 likely match/).first()).toBeVisible();
  await page.getByRole("button", { name: "Match", exact: true }).first().click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Item 1 name")).toHaveValue(/Milk/);
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog.getByRole("button", { name: "Keep in inbox" })).toHaveCount(0);
  await dialog.getByRole("checkbox", { name: /Mock Market/ }).check();
  await dialog.getByRole("button", { name: "Link to this transaction" }).click();
  await dialog.getByRole("button", { name: "Link receipt" }).click();
  await expect(page.getByText(/Receipt linked/)).toBeVisible();
  await expect(page.getByTestId("inbox-row")).toHaveCount(1);

  // delete the other one
  await page.getByRole("button", { name: /^Delete/ }).first().click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Receipt deleted")).toBeVisible();
  await expect(page.getByText("Inbox is empty")).toBeVisible();
});

test("bulk: several files are read in turn and land in the inbox, with pages grouped", async ({ page }, info) => {
  await setup(page, info, "rbulk");
  await page.goto("/");
  const dialog = await openReader(page);
  // three files: the third is a second page of the second receipt, so two receipts result
  await page.getByLabel("Receipt files").setInputFiles([png(31, "a.png"), png(32, "b-page1.png"), png(33, "b-page2.png")]);
  await dialog.getByRole("radio", { name: "Separate receipts" }).click();
  await expect(dialog.getByRole("button", { name: "Read 3 receipts, one by one" })).toBeVisible();
  await dialog.getByRole("checkbox", { name: /b-page2\.png is another page/ }).check();
  await expect(dialog.getByRole("button", { name: "Read 2 receipts, one by one" })).toBeVisible();
  await dialog.getByRole("button", { name: "Read all and review later in the inbox" }).click();
  await expect(dialog.getByText("Done: 2 of 2 in the inbox.")).toBeVisible({ timeout: 60_000 });
  await expect(dialog.getByText("2 pages")).toBeVisible();
  await dialog.getByRole("button", { name: "Open the inbox" }).click();
  await expect(page).toHaveURL(/tab=inbox/);
  await expect(page.getByTestId("inbox-row")).toHaveCount(2);

  // the same files again are recognised and left alone
  await page.goto("/");
  const again = await openReader(page);
  await page.getByLabel("Receipt files").setInputFiles([png(31, "a.png"), png(34, "c.png")]);
  await again.getByRole("radio", { name: "Separate receipts" }).click();
  await again.getByRole("button", { name: "Read all and review later in the inbox" }).click();
  await expect(again.getByText("Done: 1 of 2 in the inbox.")).toBeVisible({ timeout: 60_000 });
  await expect(again.getByText("Skipped")).toBeVisible();
});
