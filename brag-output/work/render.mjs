// node render.mjs stills 1.0,2.6,...   -> stills/t_<t>.png
// node render.mjs full                 -> frames/f0000.jpg ... (630 frames @30fps)
import { chromium } from "playwright";
import fs from "node:fs";
const here = new URL("./", import.meta.url).pathname;
const meta = fs.readFileSync(here + "assets/meta.json", "utf8");
const rows = fs.readFileSync(here + "rows.txt", "utf8").trim().split("\n").map((r) => r.replace(/&/g, "&amp;").replace(/</g, "&lt;"));
const meta3 = fs.readFileSync(here + "assets3/meta.json", "utf8");
const html = fs.readFileSync(here + "comp.html", "utf8").replace("__META3__", meta3).replace("__META__", meta).replace("__ROWS__", JSON.stringify(rows));
fs.writeFileSync(here + "comp.built.html", html);

const [mode, arg] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto("file://" + here + "comp.built.html");
const ok = await page.evaluate(() => window.ready);
if (!ok) throw new Error("fonts not loaded");
if (mode === "stills") {
  fs.mkdirSync(here + "stills", { recursive: true });
  for (const t of arg.split(",").map(Number)) {
    await page.evaluate((t) => window.render(t), t);
    await page.screenshot({ path: `${here}stills/t_${t.toFixed(2)}.png` });
  }
} else {
  const FPS = 30, N = 630;
  fs.mkdirSync(here + "frames", { recursive: true });
  for (let f = 0; f < N; f++) {
    await page.evaluate((t) => window.render(t), f / FPS);
    await page.screenshot({ path: `${here}frames/f${String(f).padStart(4, "0")}.png` });
    if (f % 90 === 0) console.log("frame", f);
  }
}
await browser.close();
