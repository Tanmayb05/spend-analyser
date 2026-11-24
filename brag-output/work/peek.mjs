import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1, storageState: new URL("./state.json", import.meta.url).pathname });
const p = await ctx.newPage();
await p.goto("http://localhost:3000" + process.argv[2], { waitUntil: "networkidle" });
await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await p.waitForTimeout(1500);
await p.screenshot({ path: new URL("./peek.png", import.meta.url).pathname, fullPage: true });
await b.close();
