import { expect, test, type Page } from "@playwright/test";
import { createConfirmedUser, openAddForm, pickCategory, signIn } from "./helpers";
import { TEST_USER } from "./test-user";

async function addTxn(page: Page, amount: string, merchant: string, category: string) {
  const dialog = await openAddForm(page);
  await dialog.getByLabel("Amount", { exact: true }).fill(amount);
  await dialog.getByLabel("Merchant", { exact: true }).fill(merchant);
  await pickCategory(dialog, category);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Added")).toBeVisible();
}

/** The app shows ⌘ or Ctrl depending on the OS it detects; press whichever it says. */
async function modKey(page: Page) {
  const mac = await page.evaluate(() => document.querySelector("aside kbd")?.textContent === "⌘");
  return mac ? "Meta" : "Control";
}

const openDialog = (page: Page, name: string) => page.getByRole("dialog", { name });

test("keyboard: help, command menu, go-to keys, lists, select mode, tabs, rebinding, character keys off", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard shortcuts are for hardware keyboards");
  const email = TEST_USER.email.replace("@", `+keys-${info.project.name}@`);
  await createConfirmedUser(email, TEST_USER.password);
  await signIn(page, email, TEST_USER.password);
  await addTxn(page, "12.00", "Kroger", "Groceries");
  await addTxn(page, "30.00", "Shell", "Transport");
  const mod = await modKey(page);

  // skip link is the first Tab stop
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();

  // ? opens the shortcut list; Esc closes it
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("?");
  await expect(openDialog(page, "Keyboard shortcuts")).toBeVisible();
  await expect(openDialog(page, "Keyboard shortcuts").getByText("Go to Transactions")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(openDialog(page, "Keyboard shortcuts")).toBeHidden();

  // ⌘K / Ctrl+K: type, Enter goes there
  await page.keyboard.press(`${mod}+k`);
  const menu = openDialog(page, "Command menu");
  await expect(menu).toBeVisible();
  await page.keyboard.type("budg");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings\/budgets$/);

  // g then t → Transactions, focus lands in the content
  await page.keyboard.press("g");
  await page.keyboard.press("t");
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(page.locator("#main")).toContainText("Kroger");

  // j moves onto the first row, Enter opens it
  await page.keyboard.press("j");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", /^View /);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", /^View /);
  await page.keyboard.press("Enter");
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  // s → select mode, j + x picks a row, Esc leaves
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("s");
  await expect(page.getByRole("toolbar", { name: "Bulk actions" })).toBeVisible();
  await page.keyboard.press("j");
  await page.keyboard.press("x");
  await expect(page.getByText("1 selected")).toBeVisible();
  await page.keyboard.press(`${mod}+a`);
  await expect(page.getByText("2 selected")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar", { name: "Bulk actions" })).toBeHidden();

  // number keys switch the page tabs
  await page.keyboard.press("2");
  await expect(page).toHaveURL(/tab=plans/);
  await page.keyboard.press("1");
  await expect(page).not.toHaveURL(/tab=/);

  // / focuses search; typing there doesn't fire shortcuts
  await page.keyboard.press("/");
  await expect(page.getByRole("combobox", { name: "Search" })).toBeFocused();
  await page.keyboard.type("n");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // n opens Add transaction
  await page.keyboard.press("n");
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.keyboard.press("Escape");

  // rebinding: Add a transaction → A, saved to the account
  await page.goto("/settings/shortcuts");
  await page.getByRole("button", { name: "Change shortcut for Add a transaction" }).click();
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/settings/shortcuts"));
  await page.keyboard.press("a");
  const row = page.locator("#main li", { has: page.getByText("Add a transaction", { exact: true }) });
  await expect(row.locator("kbd")).toHaveText("A", { timeout: 4000 });
  await saved;
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(row.locator("kbd")).toHaveText("A");
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("a");
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.keyboard.press("Escape");

  // a clash is caught: ? already belongs to the shortcut list
  await page.getByRole("button", { name: "Change shortcut for Add a transaction" }).click();
  await page.keyboard.press("?");
  await expect(page.getByText(/is already used by Show keyboard shortcuts/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await row.getByRole("button", { name: "Reset" }).click();
  await expect(row.locator("kbd")).toHaveText("N");

  // character keys off: n does nothing, ⌘K still works
  const off = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/settings/shortcuts"));
  await page.getByLabel("Single-key shortcuts").uncheck();
  await off;
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("Single-key shortcuts")).not.toBeChecked();
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("n");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.keyboard.press(`${mod}+k`);
  await expect(openDialog(page, "Command menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("Single-key shortcuts").check();
});

test("keyboard: Mac shows ⌘, Windows shows Ctrl", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard shortcuts are for hardware keyboards");
  const email = TEST_USER.email.replace("@", `+keysos-${info.project.name}@`);
  await createConfirmedUser(email, TEST_USER.password);
  const agents = {
    mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  };
  for (const [os, userAgent] of Object.entries(agents)) {
    const ctx = await browser.newContext({ userAgent, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await signIn(page, email, TEST_USER.password);
    const search = page.locator("aside").getByRole("button", { name: /Search/ });
    await expect(search.locator("kbd").first()).toHaveText(os === "mac" ? "⌘" : "Ctrl");
    await expect(search).toHaveAttribute("aria-keyshortcuts", os === "mac" ? "Meta+K" : "Control+K");
    await page.keyboard.press(os === "mac" ? "Meta+k" : "Control+k");
    await expect(page.getByRole("dialog", { name: "Command menu" })).toBeVisible();
    await ctx.close();
  }
});
