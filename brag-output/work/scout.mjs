// Scout: log in as the local fictional demo user and screenshot pages. Never logs credentials.
import { chromium } from "playwright";
const out = new URL("./scout/", import.meta.url).pathname;
const base = "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(base + "/login");
await page.fill("#email", process.env.SEED_DEMO_USER_EMAIL);
await page.fill("#password", process.env.SEED_DEMO_USER_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
await ctx.storageState({ path: new URL("./state.json", import.meta.url).pathname });
const pages = (process.argv[2] ?? "/,/transactions,/insights,/plans,/items,/trips").split(",");
for (const p of pages) {
  await page.goto(base + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const name = p === "/" ? "overview" : p.replace(/\W+/g, "_");
  await page.screenshot({ path: `${out}${name}.png`, fullPage: true });
  console.log("shot", name);
}
await browser.close();
