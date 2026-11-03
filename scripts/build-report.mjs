// Prints data/report.html (written by build-index.mjs) to public/downloads/ai-job-exposure-report.pdf,
// the free report every new subscriber can download. Needs Playwright with Chromium.
// Run: node scripts/build-index.mjs && node scripts/build-report.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname;
mkdirSync(ROOT + "public/downloads", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("file://" + ROOT + "data/report.html");
await page.pdf({ path: ROOT + "public/downloads/ai-job-exposure-report.pdf", format: "Letter", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log("Wrote public/downloads/ai-job-exposure-report.pdf");
