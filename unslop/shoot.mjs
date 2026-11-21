// Screenshots every route: mobile (iPhone 14) + desktop (1440x900), dark + light.
// Usage: node --env-file=.env.local unslop/shoot.mjs before|after
// Local only. Reads SEED_DEMO_USER_EMAIL/PASSWORD from env, never prints them.
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const label = process.argv[2] ?? "before";
const BASE = "http://localhost:3000";
const { SEED_DEMO_USER_EMAIL: email, SEED_DEMO_USER_PASSWORD: password, NEXT_PUBLIC_SUPABASE_URL: sb } = process.env;
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(sb ?? "")) throw new Error("Refusing: Supabase URL is not local");
if (!email || !password) throw new Error("Missing SEED_DEMO_USER_* in env");

const SETTINGS = ["", "/profile", "/preferences", "/categories", "/merchants", "/payments", "/people", "/budgets", "/data", "/tidy", "/ai", "/ai/usage", "/security"];
const APP = [
  ["dashboard", "/"],
  ["transactions-activity", "/transactions"],
  ["transactions-plans", "/transactions?tab=plans"],
  ["transactions-emis", "/transactions?tab=emis"],
  ["transactions-cards", "/transactions?tab=cards"],
  ["insights", "/insights"],
  ["items", "/items"],
  ["trips", "/trips"],
  ["reset-password", "/reset-password"],
  ...SETTINGS.map((s) => [`settings${s.replace(/\//g, "-") || "-home"}`, `/settings${s}`]),
];
const AUTH = [["login", "/login"], ["signup", "/signup"], ["forgot-password", "/forgot-password"], ["not-found", "/does-not-exist"]];

const devs = {
  mobile: { ...devices["iPhone 14"], browserName: undefined },
  desktop: { viewport: { width: 1440, height: 900 } },
};
delete devs.mobile.defaultBrowserType;

const browser = await chromium.launch();
let n = 0;
for (const [dev, opts] of Object.entries(devs)) {
  for (const theme of ["dark", "light"]) {
    const dir = `unslop/${label}/${dev}-${theme}`;
    mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ ...opts, reducedMotion: "reduce", colorScheme: theme });
    const shoot = async (page, name) => {
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, animations: "disabled" });
      n++;
    };
    await ctx.addCookies([{ name: "theme", value: theme, url: BASE }]);
    // logged out first
    const page = await ctx.newPage();
    for (const [name, path] of AUTH) { await page.goto(BASE + path); await shoot(page, name); }
    // sign in
    await page.goto(BASE + "/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/$/);
    for (const [name, path] of APP) {
      await page.goto(BASE + path);
      await shoot(page, name);
    }
    // first trip detail
    await page.goto(BASE + "/trips");
    const href = await page.locator('a[href^="/trips/"]').first().getAttribute("href").catch(() => null);
    if (href) { await page.goto(BASE + href); await shoot(page, "trip-detail"); }
    // open transaction sheet
    await page.goto(BASE + "/");
    const add = page.getByRole("button", { name: /add transaction|^add$/i }).first();
    if (await add.isVisible().catch(() => false)) { await add.click(); await page.waitForTimeout(600); await shoot(page, "transaction-sheet"); }
    await ctx.close();
    console.log(`${dev}-${theme}: done`);
  }
}
await browser.close();
console.log(`${n} screenshots -> unslop/${label}/`);
