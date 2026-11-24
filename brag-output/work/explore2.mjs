// Explore AI entry, Ask, trips and cards screens as the local fictional demo user. No AI calls here.
import { chromium } from "playwright";
import fs from "node:fs";
const out = new URL("./scout2/", import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
const base = "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const hide = () => page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.goto(base + "/login");
await page.fill("#email", process.env.SEED_DEMO_USER_EMAIL);
await page.fill("#password", process.env.SEED_DEMO_USER_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
await ctx.storageState({ path: new URL("./state.json", import.meta.url).pathname });

await page.goto(base + "/", { waitUntil: "networkidle" }); await hide();
await page.getByRole("button", { name: "Add transaction" }).first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: out + "sheet.png" });
await page.getByText("Describe it", { exact: true }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: out + "describe.png" });

for (const p of ["/insights?tab=ai", "/trips", "/settings/payments", "/transactions"]) {
  await page.goto(base + p, { waitUntil: "networkidle" }); await hide();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out + p.replace(/\W+/g, "_") + ".png", fullPage: true });
  console.log("shot", p);
}
await browser.close();
