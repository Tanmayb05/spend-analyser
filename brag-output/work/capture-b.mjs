// Ask (one real call, ** stripped in the DOM for display), wallet open, trip stamps. Local fictional demo user.
import { chromium } from "playwright";
import fs from "node:fs";
const dir = new URL("./ai/", import.meta.url).pathname;
const base = "http://localhost:3000";
const only = process.argv[2] ?? "ask,wallet,trips";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2,
  storageState: new URL("./state.json", import.meta.url).pathname,
});
const page = await ctx.newPage();
const hide = () => page.addStyleTag({ content: "nextjs-portal{display:none!important} *{caret-color:transparent!important}" });
const meta = JSON.parse(fs.readFileSync(dir + "meta.json", "utf8"));
const card = (title) => page.getByText(title, { exact: true }).first().locator("xpath=ancestor::*[contains(@class,'rounded-card')][1]");
const rect = async (loc, inside) => { const a = await loc.boundingBox(), b = await inside.boundingBox(); return { x: a.x - b.x, y: a.y - b.y, w: a.width, h: a.height }; };

if (only.includes("ask")) {
  await page.goto(base + "/insights?tab=ai", { waitUntil: "networkidle" }); await hide();
  const c = card("Ask your data");
  await c.scrollIntoViewIfNeeded();
  const q = "How much did I spend at Amazon this year?";
  const input = page.getByLabel("Ask a question about your spending");
  await input.fill(q);
  await c.screenshot({ path: dir + "ask/typed.png" });
  meta.askInput = await rect(input, c);
  await input.fill("");
  await c.screenshot({ path: dir + "ask/empty.png" });
  await input.fill(q);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.waitForFunction((q) => {
    const el = [...document.querySelectorAll(".rounded-card")].find((e) => e.innerText.includes("Ask your data"));
    if (!el || !el.innerText.includes(q)) return false;
    return [...el.querySelectorAll("li")].length >= 2 && !/Looking at your numbers/.test(el.innerText);
  }, q, { timeout: 120000 });
  await page.waitForTimeout(800);
  // display fix: the card shows the model's markdown literally (bug reported separately); strip ** so the frame reads clean
  await page.evaluate(() => document.querySelectorAll("li").forEach((li) => { if (li.textContent.includes("**")) li.textContent = li.textContent.replace(/\*\*/g, ""); }));
  await c.screenshot({ path: dir + "ask/answer.png" });
  const lis = c.locator("li");
  meta.askQ = await rect(lis.nth(0), c);
  meta.askA = await rect(lis.nth(1), c);
  meta.askCard = await c.boundingBox();
  fs.writeFileSync(dir + "ask-text.txt", await c.innerText());
}

if (only.includes("wallet")) {
  await page.goto(base + "/", { waitUntil: "networkidle" }); await hide();
  const c = card("Cards");
  await c.scrollIntoViewIfNeeded();
  await c.screenshot({ path: dir + "wallet-closed.png" });
  await c.getByText("Wallet", { exact: true }).click();
  await page.waitForTimeout(1200);
  await c.screenshot({ path: dir + "wallet-open.png" });
  meta.wallet = await c.boundingBox();
}

if (only.includes("trips")) {
  await page.goto(base + "/trips", { waitUntil: "networkidle" }); await hide();
  await page.waitForTimeout(1500);
  const visited = page.getByText("Visited", { exact: true }).locator("xpath=following-sibling::*[1]");
  await visited.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await visited.screenshot({ path: dir + "stamps.png" });
  const stamps = visited.locator(":scope > *");
  meta.stamps = [];
  for (let i = 0; i < (await stamps.count()); i++) meta.stamps.push(await rect(stamps.nth(i), visited));
  meta.stampsBox = await visited.boundingBox();
  const head = await page.locator("main p, header p").allInnerTexts();
  meta.tripsSummary = head.find((t) => /across \d+ trips/.test(t)) ?? null;
}
fs.writeFileSync(dir + "meta.json", JSON.stringify(meta, null, 1));
await browser.close();
