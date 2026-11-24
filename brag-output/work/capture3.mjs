// Capture real app UI (fictional local demo user) as 2x layers + element boxes for animation.
import { chromium } from "playwright";
import fs from "node:fs";
const dir = new URL("./assets3/", import.meta.url).pathname;
fs.mkdirSync(dir, { recursive: true });
const base = "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  deviceScaleFactor: 3,
  storageState: new URL("./state.json", import.meta.url).pathname,
});
const page = await ctx.newPage();
const hideDev = () => page.addStyleTag({ content: "nextjs-portal{display:none!important} *{caret-color:transparent!important}" });
const meta = {};

async function card(title) {
  const h = page.getByText(title, { exact: true }).first();
  return h.locator("xpath=ancestor::*[contains(@class,'rounded-card')][1]");
}
async function shot(loc, name, extra) {
  await loc.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const box = await loc.boundingBox();
  await loc.screenshot({ path: dir + name + ".png" });
  meta[name] = { w: box.width, h: box.height, ...(extra ? await extra(loc, box) : {}) };
  console.log(name, Math.round(box.width), Math.round(box.height));
}

// overview, October
await page.goto(base + "/?m=2026-10", { waitUntil: "networkidle" });
await hideDev();
await page.waitForTimeout(1500);
await page.screenshot({ path: dir + "app-overview.png" });
await shot(await card("Financial summary"), "summary", async (loc, box) => {
  const cells = await loc.locator("dl > div, [class*='grid'] > div").evaluateAll((els) =>
    els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, t: e.innerText.slice(0, 30) }; }));
  return { cells: cells.map((c) => ({ ...c, x: c.x - box.x, y: c.y - box.y })) };
});
await shot(await card("Transaction calendar"), "calendar", async (loc, box) => {
  const cells = await loc.locator("button").evaluateAll((els) =>
    els.filter((e) => /^\s*\d{1,2}\b/.test(e.innerText)).map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, t: e.innerText.replace(/\s+/g, " ").slice(0, 20) }; }));
  return { cells: cells.map((c) => ({ ...c, x: c.x - box.x, y: c.y - box.y })) };
});
await shot(await card("All spending breakdown"), "donut");

// insights
await page.goto(base + "/insights", { waitUntil: "networkidle" });
await hideDev();
await page.waitForTimeout(1500);
await shot(await card("Where is this month heading?"), "pace");
await page.goto(base + "/insights?m=2026-10", { waitUntil: "networkidle" });
await hideDev();
await page.waitForTimeout(1500);
await shot(await card("Where did the money go?"), "sankey");
await shot(await card("Am I spending more than I earn?"), "bars");

fs.writeFileSync(dir + "meta.json", JSON.stringify(meta, null, 1));
await browser.close();
