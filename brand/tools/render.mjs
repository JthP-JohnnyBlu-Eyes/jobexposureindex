// Render every profile image, banner and logo PNG in brand/ from the SVGs in brand/logo.
// Needs Playwright with Chromium. Usage: node brand/tools/render.mjs
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BRAND = join(dirname(fileURLToPath(import.meta.url)), "..");
const logo = (name) => readFileSync(join(BRAND, "logo", `${name}.svg`), "utf8");

const C = { bg: "#F6F3EC", surface: "#FFFDF8", line: "#E2DDD1", ink: "#14171C", soft: "#3A3F47", muted: "#5E636B",
  low: "#3FA796", mid: "#E3B341", high: "#E8743B", max: "#D9473A" };
const GRAD = `linear-gradient(90deg, ${C.low}, ${C.mid} 50%, ${C.high} 75%, ${C.max})`;
const FONTS = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=block";

const css = `
* { box-sizing: border-box; }
html, body { margin: 0; }
body { font-family: Inter, sans-serif; color: ${C.ink}; overflow: hidden; }
.canvas { position: relative; overflow: hidden; }
.paper { background: ${C.bg}; }
.ink { background: ${C.ink}; color: #fff; }
.strip { position: absolute; left: 0; right: 0; bottom: 0; background: ${GRAD}; }
.safe { position: absolute; display: flex; }
.row { align-items: center; justify-content: space-between; }
.stack { flex-direction: column; justify-content: space-between; }
.eyebrow { font-family: "JetBrains Mono", monospace; font-weight: 500; font-size: .2em; letter-spacing: .16em; text-transform: uppercase; color: ${C.max}; }
.ink .eyebrow { color: ${C.high}; }
h1 { font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 1em; line-height: 1.02; letter-spacing: -.025em; margin: .14em 0 0; }
h1 em { font-style: normal; background: linear-gradient(transparent 62%, rgba(232,116,59,.35) 62%); }
.sub { font-size: .2em; line-height: 1.45; color: ${C.soft}; margin: .9em 0 0; max-width: 30em; }
.ink .sub { color: #C9CDD3; }
.lockup svg { display: block; height: 100%; width: auto; }
.meter { flex: 0 0 auto; }
.bar { position: relative; height: .085em; border-radius: .05em; background: ${GRAD}; }
.bar i { position: absolute; top: -.05em; bottom: -.05em; width: .022em; background: ${C.ink}; border-radius: .01em; }
.ink .bar i { background: #fff; }
.ends { display: flex; justify-content: space-between; font-family: "JetBrains Mono", monospace; font-size: .12em; letter-spacing: .08em; text-transform: uppercase; color: ${C.muted}; margin-top: .9em; }
.ink .ends { color: #9AA0A8; }
.url { display: inline-block; font-family: "JetBrains Mono", monospace; font-weight: 500; font-size: .17em; letter-spacing: .02em; padding: .55em .9em; border-radius: .4em; background: ${C.ink}; color: #fff; }
.ink .url { background: ${C.max}; }
.tasks { list-style: none; padding: 0; margin: 0; font-size: .16em; }
.tasks li { display: flex; align-items: center; gap: .8em; padding: .75em 0; border-top: 1px solid ${C.line}; color: ${C.soft}; }
.tasks li b { width: .6em; height: .6em; border-radius: 50%; flex: 0 0 auto; }
.tasks li span { flex: 1; }
.tasks li small { font-family: "JetBrains Mono", monospace; font-size: .72em; letter-spacing: .08em; color: ${C.muted}; }
.card { background: ${C.surface}; border: 1px solid ${C.line}; border-radius: .1em; padding: .2em .24em; box-shadow: 0 .04em .12em rgba(20,23,28,.06); }
`;

const meter = (pos = 62, ends = true) => `<div class="bar"><i style="left:${pos}%"></i></div>` +
  (ends ? `<div class="ends"><span>Low exposure</span><span>High exposure</span></div>` : "");
const tasks = `<ul class="tasks">
  <li><b style="background:${C.max}"></b><span>Drafting routine documents and emails</span><small>HIGHER</small></li>
  <li><b style="background:${C.mid}"></b><span>Analysing data and writing reports</span><small>MEDIUM</small></li>
  <li><b style="background:${C.low}"></b><span>Hands-on, in-person work</span><small>LOWER</small></li></ul>`;
const HEAD = "How exposed is <em>your job</em> to&nbsp;AI?";

// Layouts. Each fills the safe box; the base font size is then shrunk until nothing overflows.
const layouts = {
  // Headline over the exposure meter on the left, address on the right
  two: ({ eyebrow = "AI and the US job market", head = "How exposed is<br><em>your job</em> to AI?" } = {}) => `
    <div style="flex:0 0 auto"><div class="eyebrow">${eyebrow}</div><h1 style="white-space:nowrap">${head}</h1>
      <div style="margin-top:.3em">${meter()}</div></div>
    <div style="flex:0 0 auto;align-self:flex-end;margin-left:.5em"><span class="url">jobexposureindex.com</span></div>`,
  // One line of headline plus the address, for thin banners
  row: ({ eyebrow = "AI and the US job market", head = HEAD, lock } = {}) => `
    <div style="display:flex;align-items:center;gap:.45em;flex:0 0 auto">
      ${lock ? `<div class="lockup" style="height:1.1em;flex:0 0 auto">${logo(lock)}</div><div style="width:1px;align-self:stretch;background:currentColor;opacity:.18"></div>` : ""}
      <div><div class="eyebrow">${eyebrow}</div><h1 style="white-space:nowrap">${head}</h1></div></div>
    <div style="flex:0 0 auto;margin-left:.5em"><span class="url">jobexposureindex.com</span></div>`,
  // Logo, headline, card and call to action stacked, for portrait and square posts
  stack: ({ cta = "Get the free weekly report" } = {}) => `
    <div class="lockup" style="height:.42em">${logo("logo-horizontal")}</div>
    <div style="padding:.4em 0"><div class="eyebrow">AI and the US job market</div>
    <h1 style="font-size:1.25em">How exposed is <em>your</em> <em>job</em> to AI?</h1>
    <p class="sub">Look up any US job and see which of its tasks AI can already do, which it can't, and what to learn next.</p>
    <div class="card" style="margin-top:.5em">${meter()}<div style="height:.18em"></div>${tasks}</div></div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:.3em">
      <span style="font-family:'Space Grotesk';font-weight:600;font-size:.24em">${cta} →</span><span class="url">jobexposureindex.com</span></div>`,
  // Newsletter header on ink
  report: () => `
    <div style="display:flex;align-items:center;gap:.4em;flex:0 0 auto">
      <div class="lockup" style="height:1.1em;flex:0 0 auto">${logo("mark-paper")}</div>
      <div><div class="eyebrow">Free · one email a week</div><h1 style="white-space:nowrap">The Weekly Exposure Report</h1></div></div>
    <div style="flex:0 0 auto;margin-left:.5em;text-align:right;font-family:'JetBrains Mono';font-size:.2em;color:#9AA0A8;line-height:1.6">jobexposureindex.com<br>report@jobexposureindex.com</div>`,
};

// Profile images: the mark's bars on ink, sized so they sit inside a circle crop
const avatar = (theme) => theme === "dark"
  ? `<div class="canvas ink" style="width:100%;height:100%;display:grid;place-items:center">
       <div style="width:62%;height:62%">${logo("mark-bars").replace("<svg ", '<svg style="width:100%;height:100%;transform:translate(-1.56%,0.78%)" ')}</div></div>`
  : `<div class="canvas paper" style="width:100%;height:100%;display:grid;place-items:center">
       <div style="width:62%;height:62%">${logo("mark").replace("<svg ", '<svg style="width:100%;height:100%" ')}</div></div>`;

// [output path, width, height, spec]
// Banner spec: layout, safe box [x, y, w, h] that stays clear of profile-photo overlap and crops, theme, options
const banner = (layout, safe, opts = {}) => ({ kind: "banner", layout, safe, theme: opts.theme || "paper", opts });
const prof = (theme = "dark") => ({ kind: "avatar", theme });

const ASSETS = [
  ["profile/profile-dark-1080.png", 1080, 1080, prof("dark")],
  ["profile/profile-paper-1080.png", 1080, 1080, prof("paper")],

  ["x/profile-400.png", 400, 400, prof()],
  ["x/header-1500x500.png", 1500, 500, banner("two", [440, 70, 990, 330])],

  ["bluesky/avatar-1000.png", 1000, 1000, prof()],
  ["bluesky/banner-3000x1000.png", 3000, 1000, banner("two", [880, 150, 1960, 640])],

  ["linkedin/company-logo-400.png", 400, 400, prof()],
  ["linkedin/company-cover-1128x191.png", 1128, 191, banner("row", [290, 34, 800, 118])],
  ["linkedin/personal-banner-1584x396.png", 1584, 396, banner("two", [560, 60, 960, 260])],

  ["facebook/profile-720.png", 720, 720, prof()],
  ["facebook/cover-1640x624.png", 1640, 624, banner("two", [300, 90, 1040, 400])],

  ["instagram/profile-1080.png", 1080, 1080, prof()],
  ["instagram/post-1080x1350.png", 1080, 1350, banner("stack", [90, 90, 900, 1170])],
  ["instagram/story-1080x1920.png", 1080, 1920, banner("stack", [90, 270, 900, 1380])],

  ["threads/profile-1080.png", 1080, 1080, prof()],

  ["tiktok/profile-1080.png", 1080, 1080, prof()],

  ["youtube/profile-800.png", 800, 800, prof()],
  ["youtube/banner-2560x1440.png", 2560, 1440, banner("two", [527, 528, 1506, 383])],
  ["youtube/watermark-150.png", 150, 150, { kind: "mark" }],

  ["pinterest/profile-1080.png", 1080, 1080, prof()],
  ["pinterest/pin-1000x1500.png", 1000, 1500, banner("stack", [80, 90, 840, 1320])],

  ["reddit/avatar-256.png", 256, 256, prof()],
  ["reddit/banner-1920x384.png", 1920, 384, banner("row", [340, 60, 1240, 264])],

  ["mastodon/avatar-400.png", 400, 400, prof()],
  ["mastodon/header-1500x500.png", 1500, 500, banner("two", [440, 70, 990, 330])],

  ["newsletter/email-header-1200x300.png", 1200, 300, banner("report", [64, 56, 1072, 188], { theme: "ink" })],
  ["newsletter/email-header-paper-1200x300.png", 1200, 300, banner("row", [64, 56, 1072, 188], { lock: "mark", head: "The Weekly Exposure Report", eyebrow: "Free · one email a week" })],

  ["logo/png/logo-horizontal-1200.png", 1200, 0, { kind: "svg", name: "logo-horizontal" }],
  ["logo/png/logo-horizontal-white-1200.png", 1200, 0, { kind: "svg", name: "logo-horizontal-white" }],
  ["logo/png/logo-inline-1600.png", 1600, 0, { kind: "svg", name: "logo-inline" }],
  ["logo/png/logo-inline-white-1600.png", 1600, 0, { kind: "svg", name: "logo-inline-white" }],
  ["logo/png/logo-stacked-800.png", 800, 0, { kind: "svg", name: "logo-stacked" }],
  ["logo/png/logo-stacked-white-800.png", 800, 0, { kind: "svg", name: "logo-stacked-white" }],
  ["logo/png/mark-1024.png", 1024, 1024, { kind: "svg", name: "mark" }],
  ["logo/png/mark-512.png", 512, 512, { kind: "svg", name: "mark" }],
  ["logo/png/mark-bars-1024.png", 1024, 1024, { kind: "svg", name: "mark-bars" }],
  ["newsletter/email-signature-600.png", 600, 0, { kind: "svg", name: "logo-horizontal" }],
];

function page(w, h, spec) {
  if (spec.kind === "avatar") return avatar(spec.theme);
  if (spec.kind === "mark") return logo("mark").replace("<svg ", '<svg style="width:100%;height:100%;display:block" ');
  if (spec.kind === "svg") return logo(spec.name).replace("<svg ", '<svg style="width:100%;height:auto;display:block" ');
  const [x, y, sw, sh] = spec.safe;
  const strip = Math.max(6, Math.round(h * 0.012));
  return `<div class="canvas ${spec.theme}" style="width:${w}px;height:${h}px">
    <div class="safe ${spec.layout === "stack" ? "stack" : "row"}" id="safe" style="left:${x}px;top:${y}px;width:${sw}px;height:${sh}px">
      ${layouts[spec.layout](spec.opts)}</div>
    <div class="strip" style="height:${strip}px"></div></div>`;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const tab = await ctx.newPage();
for (const [out, w, h, spec] of ASSETS) {
  const transparent = spec.kind === "svg" || spec.kind === "mark";
  let height = h;
  if (spec.kind === "svg" && !h) {
    const m = logo(spec.name).match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    height = Math.round((w * +m[2]) / +m[1]);
  }
  await tab.setViewportSize({ width: w, height });
  await tab.setContent(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>${css}
    html, body { width: ${w}px; height: ${height}px; ${transparent ? "background: transparent;" : ""} }</style></head>
    <body>${page(w, height, spec)}</body></html>`, { waitUntil: "networkidle" });
  await tab.evaluate(() => document.fonts.ready);
  if (spec.kind === "banner") {
    // Largest base size at which the content fits the safe box
    await tab.evaluate(() => {
      const safe = document.getElementById("safe");
      const fits = () => safe.scrollWidth <= safe.clientWidth + 1 && safe.scrollHeight <= safe.clientHeight + 1 &&
        [...safe.children].every((c) => c.getBoundingClientRect().right <= safe.getBoundingClientRect().right + 1);
      let lo = 4, hi = safe.clientHeight * 1.2;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        safe.style.fontSize = mid + "px";
        if (fits()) lo = mid; else hi = mid;
      }
      safe.style.fontSize = lo + "px";
    });
  }
  const file = join(BRAND, out);
  mkdirSync(dirname(file), { recursive: true });
  await tab.screenshot({ path: file, omitBackground: transparent });
  console.log(out);
}
await browser.close();
