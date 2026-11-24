// Credit card faces from the Cards tab (local fictional demo user).
import { chromium } from "playwright";
import fs from "node:fs";
const dir = new URL("./ai/", import.meta.url).pathname;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2, storageState: new URL("./state.json", import.meta.url).pathname });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/transactions?tab=cards", { waitUntil: "networkidle" });
await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await p.waitForTimeout(1500);
const boxes = await p.evaluate(() => {
  const faces = [];
  for (const el of document.querySelectorAll("*")) {
    if (!/^XXXX-XXXX-XXXX-/.test(el.textContent?.trim() ?? "") || el.children.length) continue;
    let f = el;
    while (f && f.getBoundingClientRect().height < 250) f = f.parentElement;
    const r = f.getBoundingClientRect();
    faces.push({ x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height });
  }
  return faces;
});
console.log(boxes);
for (const [i, r] of boxes.entries()) await p.screenshot({ path: `${dir}cardface${i}.png`, clip: r, fullPage: true });
const util = p.getByText("Overall utilization", { exact: true }).locator("xpath=ancestor::*[contains(@class,'rounded-card')][1]");
const sum = p.getByText("Owed on cards", { exact: true }).locator("xpath=ancestor::*[contains(@class,'rounded-card')][1]");
await sum.screenshot({ path: dir + "cards-summary.png" });
const m = JSON.parse(fs.readFileSync(dir + "meta.json", "utf8"));
m.cardfaces = boxes; m.cardsSummary = await sum.boundingBox();
fs.writeFileSync(dir + "meta.json", JSON.stringify(m, null, 1));
await b.close();
