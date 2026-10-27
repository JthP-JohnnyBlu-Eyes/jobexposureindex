// Draws a 1200x630 share card for every job into public/cards/<slug>.jpg, used as the
// page's link preview. Only draws cards that are missing or whose score changed
// (tracked in public/cards/scores.json). Run after build-index.mjs:
//   node scripts/build-cards.mjs [--force]
// Needs Playwright with Chromium.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname;
const jobs = JSON.parse(readFileSync(ROOT + "public/data/jobs.json", "utf8"));
const dir = ROOT + "public/cards/";
mkdirSync(dir, { recursive: true });
const seenFile = dir + "scores.json";
const seen = existsSync(seenFile) && !process.argv.includes("--force") ? JSON.parse(readFileSync(seenFile, "utf8")) : {};
const todo = jobs.filter((j) => seen[j.s] !== j.x || !existsSync(dir + j.s + ".jpg"));
console.log(`Drawing ${todo.length} of ${jobs.length} cards`);
if (!todo.length) process.exit(0);

const LABELS = { low: "Low", moderate: "Moderate", elevated: "Elevated", high: "High", "very-high": "Very high" };

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
body{margin:0;width:1200px;height:630px;background:#F6F3EC;font-family:"DejaVu Sans",system-ui,sans-serif;color:#14171C;position:relative;overflow:hidden}
.b{position:absolute;left:64px;top:52px;display:flex;align-items:center;gap:16px;font-weight:700;font-size:25px;line-height:1.12}
.b svg{width:60px;height:60px}
.q{position:absolute;left:64px;top:170px;font-weight:700;font-size:19px;letter-spacing:.05em;text-transform:uppercase;color:#65645E}
h1{position:absolute;left:64px;top:206px;width:620px;margin:0;font-weight:700;letter-spacing:-.02em;line-height:1.08}
.s{position:absolute;right:64px;top:118px;width:400px;height:318px;box-sizing:border-box;padding:36px 40px;background:#FFFDF8;border:2px solid #DED9CF;border-radius:28px}
.n{font-weight:700;font-size:150px;line-height:.9;letter-spacing:-.05em}
.of{font-size:32px;color:#65645E;letter-spacing:0;font-weight:400}
.p{margin-top:22px;font-weight:700;font-size:30px;line-height:1.15}
.segs{position:absolute;left:64px;right:64px;bottom:104px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.segs i{height:16px;border-radius:8px}
.pin{position:absolute;top:-12px;width:6px;height:40px;border-radius:3px;background:#14171C;transform:translateX(-50%);box-shadow:0 0 0 4px #F6F3EC}
.e{position:absolute;left:64px;right:64px;bottom:56px;display:flex;justify-content:space-between;font-size:19px;color:#65645E}
.e b{color:#14171C}
</style></head><body>
<div class="b"><svg viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#EDE8DE"/><rect x="12" y="38" width="8" height="14" rx="1.5" fill="#3FA796"/><rect x="24" y="30" width="8" height="22" rx="1.5" fill="#E3B341"/><rect x="36" y="20" width="8" height="32" rx="1.5" fill="#E8743B"/><rect x="48" y="11" width="6" height="41" rx="1.5" fill="#D9473A"/></svg><span>Job Exposure<br>Index</span></div>
<div class="q">AI exposure score</div>
<h1 id="t"></h1>
<div class="s"><div class="n"><span id="n"></span><span class="of"> / 100</span></div><div class="p" id="p"></div></div>
<div class="segs"><i style="background:#3FA796"></i><i style="background:#E3B341"></i><i style="background:#E8743B"></i><i style="background:#D9473A"></i><div class="pin" id="pin"></div></div>
<div class="e"><span>Lower exposure</span><b>jobexposureindex.com</b><span>Higher exposure</span></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);

for (const j of todo) {
  await page.evaluate(({ j, label }) => {
    const t = document.getElementById("t");
    t.textContent = j.t;
    // Shrink long titles until they clear the scale bar.
    let size = 76;
    t.style.fontSize = size + "px";
    while (t.scrollHeight > 250 && size > 32) { size -= 4; t.style.fontSize = size + "px"; }
    document.getElementById("n").textContent = j.x;
    document.getElementById("p").textContent = label + " AI exposure";
    document.getElementById("pin").style.left = Math.min(Math.max(j.x, 0.5), 99.5) + "%";
  }, { j, label: LABELS[j.b] });
  await page.screenshot({ path: dir + j.s + ".jpg", type: "jpeg", quality: 85 });
  seen[j.s] = j.x;
}
await browser.close();
writeFileSync(seenFile, JSON.stringify(seen));
