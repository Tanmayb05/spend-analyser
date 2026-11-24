// Real AI flows on the local fictional demo account (provider from the dev server's env). Nothing is saved.
import { chromium } from "playwright";
import fs from "node:fs";
const dir = new URL("./ai/", import.meta.url).pathname;
fs.mkdirSync(dir + "type", { recursive: true });
fs.mkdirSync(dir + "ask", { recursive: true });
const base = "http://localhost:3000";
const only = process.argv[2] ?? "entry,receipt,ask";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2,
  storageState: new URL("./state.json", import.meta.url).pathname,
  permissions: [],
});
const page = await ctx.newPage();
const hide = () => page.addStyleTag({ content: "nextjs-portal{display:none!important} *{caret-color:transparent!important}" });
const meta = fs.existsSync(dir + "meta.json") ? JSON.parse(fs.readFileSync(dir + "meta.json", "utf8")) : {};
const dialog = () => page.getByRole("dialog").first();
async function openDescribe() {
  await page.goto(base + "/", { waitUntil: "networkidle" }); await hide();
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  await page.waitForTimeout(700);
  await page.getByText("Describe it", { exact: true }).click();
  await page.waitForTimeout(500);
}

if (only.includes("entry")) {
  await openDescribe();
  const input = page.getByLabel("Describe a transaction");
  const box = input.locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
  const phrase = "4.75 Starbucks coffee this morning, 62 Shell gas";
  await box.screenshot({ path: `${dir}type/c00.png` });
  for (let i = 1; i <= phrase.length; i++) {
    await input.fill(phrase.slice(0, i));
    await box.screenshot({ path: `${dir}type/c${String(i).padStart(2, "0")}.png` });
  }
  meta.typeCount = phrase.length;
  await dialog().screenshot({ path: dir + "entry-before.png" });
  const t0 = Date.now();
  await page.getByRole("button", { name: "Read it" }).click();
  await page.locator('section[aria-label^="Transaction"]').first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(800);
  console.log("entry parsed in", Date.now() - t0, "ms; cards:", await page.locator('section[aria-label^="Transaction"]').count());
  await dialog().screenshot({ path: dir + "entry-after.png" });
}

if (only.includes("receipt")) {
  await openDescribe();
  await page.getByLabel("Read a receipt").click();
  await page.waitForTimeout(700);
  await page.getByLabel("Receipt files").setInputFiles(new URL("../../tests/fixtures/receipts/receipt.png", import.meta.url).pathname);
  await page.waitForTimeout(1200);
  await dialog().screenshot({ path: dir + "receipt-added.png" });
  console.log("buttons:", (await dialog().getByRole("button").allInnerTexts()).map((s) => s.trim()).filter(Boolean).join(" | "));
  const read = dialog().getByRole("button", { name: "Read receipt", exact: true });
  if (await read.count()) {
    const t0 = Date.now();
    await read.click();
    await page.waitForFunction(() => /25\.47/.test(document.body.innerText) , null, { timeout: 90000 }).catch(() => console.log("no 25.47 seen"));
    await page.screenshot({ path: dir + "receipt-page.png" });
    console.log("page text tail:", (await page.locator("body").innerText()).slice(-600).replace(/\s+/g, " "));
    await page.waitForTimeout(1500);
    console.log("receipt read in", Date.now() - t0, "ms");
    await dialog().screenshot({ path: dir + "receipt-after.png" });
    fs.writeFileSync(dir + "receipt-text.txt", await dialog().innerText());
  }
}

if (only.includes("ask")) {
  await page.goto(base + "/insights?tab=ai", { waitUntil: "networkidle" }); await hide();
  const card = page.getByText("Ask your data", { exact: true }).locator("xpath=ancestor::*[contains(@class,'rounded-card')][1]");
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: dir + "ask/empty.png" });
  const q = process.env.Q ?? "How much did I spend at Amazon this year?";
  await page.getByLabel("Ask a question about your spending").fill(q);
  await card.screenshot({ path: dir + "ask/typed.png" });
  const t0 = Date.now();
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.waitForFunction((q) => {
    const el = [...document.querySelectorAll(".rounded-card")].find((e) => e.innerText.includes("Ask your data"));
    if (!el || !el.innerText.includes(q)) return false; const after = el.innerText.split(q)[1] ?? ''; return after.replace('AI answers from summaries of your data. Check important numbers on the Transactions page.', '').trim().length > 40;
  }, q, { timeout: 120000 }).catch(() => console.log("ask wait timed out"));
  await page.waitForTimeout(1500);
  console.log("ask answered in", Date.now() - t0, "ms");
  await card.screenshot({ path: dir + "ask/answer.png" });
  fs.writeFileSync(dir + "ask-text.txt", await card.innerText());
}
fs.writeFileSync(dir + "meta.json", JSON.stringify(meta));
await browser.close();
