import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { createConfirmedUser, importWorkbookAs, openAddForm, pickCategory, signIn } from "./helpers";
import { TEST_USER } from "./test-user";

// Phone-width walk through every major page and its main features. Fails on JS errors, failed requests and sideways scrolling.
test.describe.configure({ mode: "serial" });
test.use({ actionTimeout: 8_000, navigationTimeout: 30_000 });
test.skip(!existsSync("Expense_Tracker.xlsx"), "workbook not present");

const problems: string[] = [];
const log = (m: string) => {
  problems.push(m);
  console.log("PROBLEM " + m);
};

/** No horizontal scroll: the page must fit the phone's width. */
async function fits(page: Page, label: string) {
  const over = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        // ignore things inside a deliberately scrolling box
        for (let p = el.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return false;
        }
        return r.right > w + 1;
      })
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
    return { scroll: document.documentElement.scrollWidth - w, wide };
  });
  if (over.scroll > 1 || over.wide.length) log(`${label}: overflows by ${over.scroll}px ${over.wide.join(" | ")}`);
}

test("phone sweep", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone layout only");
  test.setTimeout(900_000);
  const email = TEST_USER.email.replace("@", `+sweep-${info.project.name}@`);
  await createConfirmedUser(email, TEST_USER.password);
  const sb = await importWorkbookAs(email, TEST_USER.password);
  // make two payment methods credit cards so the Cards tab has something to show
  const { data: pms } = await sb.from("payment_methods").select("id").order("name").limit(2);
  for (const [i, pm] of (pms ?? []).entries()) {
    const { error } = await sb.from("payment_methods").update({ is_credit_card: true, credit_limit: 5000 * (i + 1), statement_day: 5, due_day: 25 }).eq("id", pm.id);
    if (error) throw error;
  }
  await signIn(page, email, TEST_USER.password);

  page.on("pageerror", (e) => log(`pageerror @ ${page.url()}: ${e.message}`));
  page.on("console", async (m) => {
    if (m.type() !== "error" || /favicon|Failed to load resource.*(401|404)/.test(m.text())) return;
    const args = await Promise.all(m.args().map((a) => a.jsonValue().catch(() => "?")));
    log(`console @ ${page.url()}: ${args.map(String).join(" ").slice(0, 700)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) log(`http ${r.status()} ${r.url()}`);
  });

  const visit = async (path: string, heading: string | RegExp) => {
    let res = await page.goto(path).catch(() => null); // a leftover client navigation can abort the first try
    if (!res) res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1, name: heading }), path).toBeVisible();
    await page.waitForLoadState("networkidle");
    await fits(page, path);
    await page.screenshot({ path: `test-results/sweep/${path.replace(/[/?=&]/g, "_") || "root"}.png`, fullPage: true });
  };
  const step = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      log(`step "${label}": ${(e as Error).message.split("\n")[0]}`);
      await page.keyboard.press("Escape").catch(() => {});
    }
  };

  // ---------- Overview ----------
  await visit("/?m=2026-09", "Overview");
  await step("overview: month arrows", async () => {
    await page.getByRole("link", { name: "Previous month" }).first().click();
    await expect(page).toHaveURL(/m=2026-08/);
    await page.getByRole("link", { name: "Next month" }).first().click();
    await expect(page).toHaveURL(/m=2026-09/);
    await fits(page, "overview after month nav");
  });
  await step("overview: More sheet reaches Items, Insights, Settings", async () => {
    await page.getByRole("button", { name: "More" }).click();
    const d = page.getByRole("dialog");
    for (const name of ["Items", "Insights", "Settings"]) await expect(d.getByRole("link", { name })).toBeVisible();
    await fits(page, "more sheet");
    await d.getByRole("link", { name: "Insights" }).click();
    await expect(page).toHaveURL(/\/insights/);
  });

  // ---------- Transactions: Activity ----------
  await visit("/transactions?m=2026-09", "Transactions");
  await step("txn: open detail, see Edit/Delete/Close, close", async () => {
    await page.locator("main").getByRole("button", { name: /^View / }).first().click();
    const d = page.getByRole("dialog");
    await expect(d.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(d.getByRole("button", { name: /Delete/ })).toBeVisible();
    await fits(page, "txn detail sheet");
    await page.screenshot({ path: "test-results/sweep/txn-detail.png" });
    await d.getByRole("button", { name: "Close", exact: true }).last().click();
    await expect(d).toBeHidden();
  });
  await step("txn: filters sheet", async () => {
    await page.getByRole("button", { name: "Filters" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await fits(page, "txn filters sheet");
    await page.screenshot({ path: "test-results/sweep/txn-filters.png" });
    await page.keyboard.press("Escape");
  });
  await step("txn: search", async () => {
    const s = page.getByRole("combobox", { name: "Search" });
    await s.fill("Kroger");
    await s.press("Enter");
    await page.waitForLoadState("networkidle");
    await fits(page, "txn search results");
    await s.fill("");
    await s.press("Enter");
  });
  await step("txn: Plans tab", async () => {
    await page.goto("/transactions?tab=plans");
    await expect(page.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible();
    await fits(page, "plans tab");
    await page.screenshot({ path: "test-results/sweep/plans.png", fullPage: true });
  });
  await step("txn: Cards tab", async () => {
    await page.goto("/transactions?tab=cards");
    await expect(page.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await fits(page, "cards tab");
    await page.screenshot({ path: "test-results/sweep/cards.png", fullPage: true });
    // flip the first card with a tap, see the back, flip again
    const flipBtn = page.getByRole("button", { name: /flip|turn|back|details/i }).first();
    if (await flipBtn.count()) {
      await flipBtn.click();
      await page.waitForTimeout(600);
      await fits(page, "card back");
      await page.screenshot({ path: "test-results/sweep/card-back.png", fullPage: true });
    } else log("cards: no flip button found");
  });

  // ---------- Add transaction ----------
  await step("add: expense, income, spread, validation", async () => {
    await page.goto("/");
    const d = await openAddForm(page);
    await fits(page, "add sheet");
    await d.getByRole("button", { name: "Add", exact: true }).click(); // empty -> must show errors, not save
    await expect(d).toBeVisible();
    await d.getByLabel("Amount", { exact: true }).fill("12.34");
    await d.getByLabel("Merchant", { exact: true }).fill("Sweep Cafe");
    await pickCategory(d, "Groceries");
    await d.getByRole("button", { name: "Spread this cost over months" }).click();
    await fits(page, "add sheet with spread");
    await page.screenshot({ path: "test-results/sweep/add-spread.png" });
    await d.getByRole("checkbox").check();
    await d.getByLabel("Months", { exact: true }).fill("3");
    await d.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Added")).toBeVisible();
    const d2 = await openAddForm(page);
    await d2.getByRole("radio", { name: "Income" }).click();
    await d2.getByLabel("Amount", { exact: true }).fill("100");
    await pickCategory(d2, "Salary").catch(() => {});
    await page.keyboard.press("Escape");
  });
  await step("add: Describe it tab renders", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: "Add transaction" }).filter({ visible: true }).first().click();
    const d = page.getByRole("dialog");
    const describe = d.getByRole("radio", { name: "Describe it" });
    if (await describe.isVisible()) await describe.click();
    await fits(page, "add sheet describe");
    await page.screenshot({ path: "test-results/sweep/add-describe.png" });
    await page.keyboard.press("Escape");
  });
  await step("txn: new plan visible and opens", async () => {
    await page.goto("/transactions?tab=plans");
    await page.getByText("Sweep Cafe").first().click();
    const d = page.getByRole("dialog");
    await expect(d.getByText("Schedule")).toBeVisible();
    await fits(page, "plan detail sheet");
    await page.screenshot({ path: "test-results/sweep/plan-detail.png" });
    await d.getByRole("button", { name: "Close", exact: true }).last().click();
  });

  // ---------- Trips ----------
  await visit("/trips", "Trips");
  await step("trips: open a trip", async () => {
    await page.getByText("SF Bay Trip 2026-07").click();
    await expect(page.getByRole("heading", { level: 1, name: "SF Bay Trip 2026-07" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await fits(page, "trip detail");
    await page.screenshot({ path: "test-results/sweep/trip-detail.png", fullPage: true });
  });

  // ---------- Insights ----------
  for (const tab of ["", "?tab=categories", "?tab=habits", "?tab=ai"]) await visit(`/insights${tab}`, "Insights");
  await step("insights: tab switch + period controls", async () => {
    await page.goto("/insights");
    for (const name of ["Categories", "Habits"]) {
      const t = page.getByRole("radio", { name });
      if (await t.count()) {
        await t.first().click();
        await page.waitForLoadState("networkidle");
        await fits(page, `insights ${name}`);
      }
    }
  });

  // ---------- Items ----------
  await visit("/items", "Items");
  await step("items: open an item", async () => {
    const first = page.locator("main").getByRole("button").filter({ hasText: /\$/ }).first();
    if (await first.count()) {
      await first.click();
      await fits(page, "items detail");
      await page.keyboard.press("Escape");
    }
  });

  // ---------- Settings ----------
  await visit("/settings", "Settings");
  for (const [p, h] of [
    ["/settings/profile", "Profile"],
    ["/settings/preferences", "Preferences"],
    ["/settings/categories", "Categories"],
    ["/settings/budgets", "Budgets"],
    ["/settings/payments", "Payment methods"],
    ["/settings/people", "People"],
    ["/settings/merchants", "Merchants"],
    ["/settings/ai", "AI"],
    ["/settings/data", "Import & export"],
    ["/settings/reset", "Reset or delete"],
    ["/settings/security", "Security"],
    ["/settings/about", "About"],
  ] as const)
    await visit(p, h);
  await step("settings: preferences save", async () => {
    await page.goto("/settings/preferences");
    await page.getByRole("radio", { name: "Sunday" }).click();
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByText(/Saved|updated/i).first()).toBeVisible();
    await page.getByRole("radio", { name: "Monday" }).click();
    await page.getByRole("button", { name: "Save preferences" }).click();
  });
  await step("settings: payments add card opens", async () => {
    await page.goto("/settings/payments");
    const add = page.getByRole("button", { name: /Add/ }).first();
    await add.click();
    await fits(page, "payments add");
    await page.screenshot({ path: "test-results/sweep/payments-add.png" });
    await page.keyboard.press("Escape");
  });

  console.log("\nSWEEP PROBLEMS:\n" + (problems.length ? problems.map((p) => " - " + p).join("\n") : " none"));
  expect(problems, problems.join("\n")).toEqual([]);
});
