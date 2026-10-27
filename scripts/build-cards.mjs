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

const COLORS = { low: "#3FA796", moderate: "#9DB15A", elevated: "#E3B341", high: "#E8743B", "very-high": "#D9473A" };
const LABELS = { low: "Low", moderate: "Moderate", elevated: "Elevated", high: "High", "very-high": "Very high" };

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@500&display=swap">
<style>
body{margin:0;width:1200px;height:630px;background:#F6F3EC;font-family:"Space Grotesk",sans-serif;color:#14171C;position:relative;overflow:hidden}
.b{position:absolute;left:72px;top:58px;display:flex;align-items:center;gap:16px;font-weight:700;font-size:26px;line-height:1.1}
.b svg{width:54px;height:54px}
.q{position:absolute;left:72px;top:168px;font:500 22px "JetBrains Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:#D9473A}
h1{position:absolute;left:72px;top:206px;width:680px;margin:0;font-weight:700;letter-spacing:-.025em;line-height:1.04}
.s{position:absolute;right:72px;top:150px;width:330px;text-align:right}
.n{font-weight:700;font-size:200px;line-height:.85;letter-spacing:-.05em}
.of{font-size:34px;color:#7A7E85;letter-spacing:0}
.p{display:inline-block;margin-top:22px;font:500 22px "JetBrains Mono",monospace;letter-spacing:.08em;text-transform:uppercase;padding:8px 18px;border-radius:999px;border:2px solid var(--c);background:color-mix(in srgb,var(--c) 18%,transparent)}
.bar{position:absolute;left:72px;right:72px;bottom:104px;height:16px;border-radius:8px;background:linear-gradient(90deg,#3FA796,#E3B341 45%,#E8743B 72%,#D9473A)}
.pin{position:absolute;top:-12px;width:6px;height:40px;border-radius:3px;background:#14171C;transform:translateX(-50%);box-shadow:0 0 0 3px #F6F3EC}
.e{position:absolute;left:72px;right:72px;bottom:58px;display:flex;justify-content:space-between;font:500 18px "JetBrains Mono",monospace;letter-spacing:.1em;color:#5E636B}
</style></head><body>
<div class="b"><svg viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#14171C"/><rect x="12" y="38" width="8" height="14" rx="1.5" fill="#3FA796"/><rect x="24" y="30" width="8" height="22" rx="1.5" fill="#E3B341"/><rect x="36" y="20" width="8" height="32" rx="1.5" fill="#E8743B"/><rect x="48" y="11" width="6" height="41" rx="1.5" fill="#D9473A"/></svg><span>Job Exposure<br>Index</span></div>
<div class="q">AI exposure score</div>
<h1 id="t"></h1>
<div class="s"><div class="n"><span id="n"></span><span class="of"> /100</span></div><div class="p" id="p"></div></div>
<div class="bar"><div class="pin" id="pin"></div></div>
<div class="e"><span>LOW EXPOSURE</span><span>JOBEXPOSUREINDEX.COM</span><span>HIGH EXPOSURE</span></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);

for (const j of todo) {
  await page.evaluate(({ j, color, label }) => {
    const t = document.getElementById("t");
    t.textContent = j.t;
    // Shrink long titles until they clear the scale bar.
    let size = 76;
    t.style.fontSize = size + "px";
    while (t.scrollHeight > 270 && size > 32) { size -= 4; t.style.fontSize = size + "px"; }
    document.getElementById("n").textContent = j.x;
    const p = document.getElementById("p");
    p.textContent = label;
    p.style.setProperty("--c", color);
    document.getElementById("pin").style.left = j.x + "%";
  }, { j, color: COLORS[j.b], label: LABELS[j.b] });
  await page.screenshot({ path: dir + j.s + ".jpg", type: "jpeg", quality: 85 });
  seen[j.s] = j.x;
}
await browser.close();
writeFileSync(seenFile, JSON.stringify(seen));
