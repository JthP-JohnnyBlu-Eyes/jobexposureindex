// Builds the Job Exposure Index pages from the files in data/:
//   public/jobs/index.html      every occupation, searchable and sortable
//   public/jobs/<slug>.html     one page per occupation, with its tasks
//   public/data/jobs.json       title, slug and score for the homepage search
//   public/sitemap.xml
// and refreshes the top-10 list on public/index.html between the top10 markers.
// Run with: node scripts/build-index.mjs

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const SITE = "https://jobexposureindex.com";
const TODAY = new Date().toISOString().slice(0, 10);
const KIT_FORM = "10103045";

// ---------- data ----------

function parseCSV(text, sep = ",") {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const read = (f) => readFileSync(ROOT + f, "utf8");
const occ = parseCSV(read("data/occ_level.csv"));
const tasks = parseCSV(read("data/tasks.tsv"), "\t");
// BLS OEWS national file, refreshed by scripts/fetch-sources.sh.
const bls = new Map(parseCSV(read("data/raw/bls_oews_national.csv")).map((r) => [r.OCC_CODE, {
  code: r.OCC_CODE, title: r.OCC_TITLE, group: r.O_GROUP, employment: r.TOT_EMP, median_annual: r.A_MEDIAN, median_hourly: r.H_MEDIAN,
}]));
const BLS_RELEASE = read("data/raw/bls_oews_release.txt").trim();

// Anthropic Economic Index: O*NET tasks seen in real Claude usage, refreshed by scripts/process-aei.py.
const aeiRows = parseCSV(read("data/aei_tasks.csv"));
const aeiById = new Map(aeiRows.map((r) => [r.node_external_id, r]));
const aeiByName = new Map(aeiRows.map((r) => [r.node_name.trim().toLowerCase(), r]));
const [AEI_RELEASE, AEI_START, AEI_END] = read("data/aei_release.txt").trim().split("\n");
const monthName = (d) => new Date(d + "T00:00:00Z").toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
// date_end is exclusive, so the last month covered is the one before it.
const AEI_PERIOD = (() => {
  const end = new Date(AEI_END + "T00:00:00Z"); end.setUTCDate(0);
  const a = monthName(AEI_START), b = monthName(end.toISOString().slice(0, 10));
  return a === b ? a : a.split(" ")[1] === b.split(" ")[1] ? `${a.split(" ")[0]}–${b}` : `${a} – ${b}`;
})();

// SOC major groups, e.g. "15" -> "Computer and Mathematical"
const groups = new Map();
for (const r of bls.values()) if (r.group === "major") groups.set(r.code.slice(0, 2), r.title.replace(/ Occupations$/, ""));

const slugify = (s) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function band(score) {
  if (score >= 80) return { key: "very-high", label: "Very high" };
  if (score >= 60) return { key: "high", label: "High" };
  if (score >= 40) return { key: "elevated", label: "Elevated" };
  if (score >= 20) return { key: "moderate", label: "Moderate" };
  return { key: "low", label: "Low" };
}

// BLS figures: the detailed SOC code, else its broad group (SOC 2018 codes BLS merged in 2021).
function blsFor(code) {
  const soc = code.slice(0, 7);
  const exact = bls.get(soc);
  if (exact && exact.group === "detailed") return exact;
  const broad = bls.get(soc.slice(0, 6) + "0");
  if (broad) return broad;
  return exact ?? null;
}

const tasksBy = new Map();
for (const t of tasks) {
  t.inUse = aeiById.has(t.task_id) || aeiByName.has(t.task.trim().toLowerCase());
  if (!tasksBy.has(t.code)) tasksBy.set(t.code, []);
  tasksBy.get(t.code).push(t);
}

const jobs = occ.map((o) => {
  const code = o["O*NET-SOC Code"];
  const beta = Number(o.dv_rating_beta);
  const score = Math.round(beta * 100);
  const ts = tasksBy.get(code) ?? [];
  const n = (e) => ts.filter((t) => t.exposure === e).length;
  const b = blsFor(code);
  const emp = b && /^\d+$/.test(b.employment) ? Number(b.employment) : null;
  let pay = null, payNote = "";
  if (b) {
    if (/^\d+$/.test(b.median_annual)) pay = Number(b.median_annual);
    else if (b.median_annual === "#") { pay = 208000; payNote = "or more"; }
    else if (/^[\d.]+$/.test(b.median_hourly)) { pay = Math.round(Number(b.median_hourly) * 2080); payNote = "full-time equivalent"; }
  }
  return {
    code, title: o.Title, slug: slugify(o.Title), beta, score, band: band(score),
    major: code.slice(0, 2), minor: code.slice(0, 4),
    tasks: ts, e1: n("E1"), e2: n("E2"), e0: n("E0"), inUse: ts.filter((t) => t.inUse).length,
    bls: b, emp, pay, payNote, blsIsGroup: b ? b.code !== code.slice(0, 7) || !sameTitle(b.title, o.Title) : false,
  };
});

function sameTitle(a, b) { return a.toLowerCase().replace(/[^a-z]/g, "") === b.toLowerCase().replace(/[^a-z]/g, ""); }

// Rank: 1 = most exposed; ties share a rank.
jobs.sort((a, b) => b.beta - a.beta || a.title.localeCompare(b.title));
jobs.forEach((j, i) => { j.rank = i > 0 && jobs[i - 1].beta === j.beta ? jobs[i - 1].rank : i + 1; });
const TOTAL = jobs.length;
if (new Set(jobs.map((j) => j.slug)).size !== TOTAL) throw new Error("duplicate slugs");

// ---------- helpers ----------

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n) => n.toLocaleString("en-US");
const money = (n) => "$" + fmt(n);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="12" fill="#14171C"/><rect x="12" y="38" width="8" height="14" rx="1.5" fill="#3FA796"/><rect x="24" y="30" width="8" height="22" rx="1.5" fill="#E3B341"/><rect x="36" y="20" width="8" height="32" rx="1.5" fill="#E8743B"/><rect x="48" y="11" width="6" height="41" rx="1.5" fill="#D9473A"/></svg>`;

function page({ title, desc, path, current, body, jsonld }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#F6F3EC">
<link rel="canonical" href="${SITE}${path}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:site_name" content="Job Exposure Index">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/assets/site.css">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>\n` : ""}</head>
<body>
<div class="wrap">
  <header class="top">
    <a class="brand" href="/" aria-label="Job Exposure Index home">${LOGO}<span>Job Exposure<br>Index</span></a>
    <nav aria-label="Main"><a class="keep" href="/jobs/"${current === "jobs" ? ' aria-current="page"' : ""}>All jobs</a><a href="/method.html"${current === "method" ? ' aria-current="page"' : ""}>Method</a><a class="cta" href="#subscribe">Get the weekly report</a></nav>
  </header>
  <main>
${body}
    <section class="closing" id="subscribe">
      <div class="eyebrow" style="color:#F0A07A">The weekly exposure report</div>
      <h2>Know what's changing before it reaches your job.</h2>
      <p class="sub">One short email a week: which jobs are most exposed, the research worth knowing about, and one practical step you can take.</p>
      <form class="signup" action="https://app.kit.com/forms/${KIT_FORM}/subscriptions" method="post" novalidate>
        <label class="sr" for="signup-email">Email address</label>
        <input id="signup-email" name="email_address" type="email" placeholder="you@example.com" autocomplete="email" required>
        <button type="submit">Subscribe free</button>
      </form>
      <p class="note" aria-live="polite">Free · one email a week · unsubscribe anytime</p>
    </section>
  </main>
  <footer>
    <div class="row">
      <span>© 2026 Job Exposure Index</span>
      <nav aria-label="Footer"><a href="/jobs/">All jobs</a><a href="/method.html">Method</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></nav>
    </div>
    <p class="disc">Information only, not career, legal or financial advice. Exposure means AI could change how a job is done; it does not mean the job will disappear. Task data from the O*NET database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), used under the <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> license; O*NET® is a trademark of USDOL/ETA. Exposure ratings from Eloundou, Manning, Mishkin and Rock, "GPTs are GPTs" (2023). Real-world use from the Anthropic Economic Index (CC BY). Employment and pay from the BLS Occupational Employment and Wage Statistics, ${BLS_RELEASE}.</p>
  </footer>
</div>
<script src="/assets/signup.js" defer></script>
</body>
</html>
`;
}

const mini = (j) => `<span class="mini band-${j.band.key}"><span class="bar"><i style="width:${Math.max(j.score, 2)}%"></i></span><b>${j.score}</b></span>`;
const pill = (j) => `<span class="pill band-${j.band.key}">${j.band.label}</span>`;

// ---------- job pages ----------

const KIND = { E1: "AI can speed this up on its own", E2: "AI can speed this up with extra software", E0: "Little or no AI speed-up" };

function jobPage(j) {
  const b = j.bls;
  const groupName = groups.get(j.major) ?? "Other";
  const n = j.tasks.length;
  const order = { E1: 0, E2: 1, E0: 2 };
  const ts = [...j.tasks].sort((a, c) => order[a.exposure] - order[c.exposure] || (a.type === "Core" ? 0 : 1) - (c.type === "Core" ? 0 : 1));
  const lower = jobs.filter((o) => o.minor === j.minor && o.score <= j.score - 10).sort((a, c) => c.score - a.score).slice(0, 6);
  const lowerAny = lower.length ? lower : jobs.filter((o) => o.major === j.major && o.score <= j.score - 10).sort((a, c) => c.score - a.score).slice(0, 6);
  const field = jobs.filter((o) => o.minor === j.minor && o !== j).slice(0, 8);
  const empNote = j.blsIsGroup && b ? `for ${esc(b.title)}` : `BLS, ${BLS_RELEASE}`;
  const desc = `${j.title}: AI exposure score ${j.score}/100 (${j.band.label.toLowerCase()}), ranked #${j.rank} of ${TOTAL} US jobs. See which tasks AI can and can't do.`;

  const body = `
    <article>
      <p class="crumbs"><a href="/">Home</a> / <a href="/jobs/">All jobs</a> / <a href="/jobs/?group=${j.major}">${esc(groupName)}</a></p>
      <div class="eyebrow" style="margin-top:28px">AI exposure score</div>
      <h1>${esc(j.title)}</h1>
      <p class="lede">${esc(j.title)} score <b>${j.score} out of 100</b>, which is ${j.band.label.toLowerCase()} exposure to AI. That ranks #${j.rank} of ${TOTAL} US occupations, where #1 is the most exposed. Of the ${n} tasks in this job, AI could speed up ${j.e1} on its own and ${j.e2} more with extra software built on top of it. ${j.inUse ? `In ${AEI_PERIOD}, ${j.inUse} of these tasks showed up in real conversations with Claude, Anthropic's AI assistant.` : `None of its tasks showed up in real AI use in ${AEI_PERIOD}.`}</p>

      <div class="scorecard band-${j.band.key}">
        <div>
          <div class="big">${j.score}<small>/ 100</small></div>
          <div style="margin-top:12px">${pill(j)}</div>
          <div class="scale" role="img" aria-label="Score ${j.score} on a scale from 0, low exposure, to 100, high exposure"><div class="pin" style="left:${j.score}%"></div></div>
          <div class="scale-ends" aria-hidden="true"><span>Low exposure</span><span>High exposure</span></div>
        </div>
        <dl class="facts">
          <div><dt>Rank</dt><dd>#${j.rank}<small>of ${TOTAL} jobs</small></dd></div>
          <div><dt>US workers</dt><dd>${j.emp ? fmt(j.emp) : "n/a"}<small>${j.emp ? empNote : "not published by BLS"}</small></dd></div>
          <div><dt>Median pay</dt><dd>${j.pay ? money(j.pay) + (j.payNote === "or more" ? "+" : "") : "n/a"}<small>${j.pay ? (j.payNote === "full-time equivalent" ? "a year, full-time equivalent" : "a year") : "not published by BLS"}</small></dd></div>
          <div><dt>In real AI use</dt><dd>${j.inUse} of ${n}<small>tasks, ${AEI_PERIOD}</small></dd></div>
        </dl>
      </div>
    </article>

    <section class="block" style="margin-top:56px">
      <h2>Task by task</h2>
      <p class="sub">Each task this job involves, as listed by O*NET, rated on whether a large language model like GPT-4 could cut the time it takes by at least half at the same quality. Tasks marked <b class="seen">Seen in real AI use</b> appeared in conversations with Claude in ${AEI_PERIOD} (<a href="https://www.anthropic.com/economic-index">Anthropic Economic Index</a>).</p>
      <div class="split3" style="grid-template-columns:${j.e1 || 0}fr ${j.e2 || 0}fr ${j.e0 || 0}fr" role="img" aria-label="${pct(j.e1, n)}% of tasks exposed directly, ${pct(j.e2, n)}% with extra software, ${pct(j.e0, n)}% not exposed"><span class="e1"></span><span class="e2"></span><span class="e0"></span></div>
      <ul class="legend">
        <li><i class="e1"></i>${KIND.E1}: ${j.e1} (${pct(j.e1, n)}%)</li>
        <li><i class="e2"></i>${KIND.E2}: ${j.e2} (${pct(j.e2, n)}%)</li>
        <li><i class="e0"></i>${KIND.E0}: ${j.e0} (${pct(j.e0, n)}%)</li>
      </ul>
      <ul class="tasks">
${ts.map((t) => `        <li><i class="${t.exposure.toLowerCase()}" aria-hidden="true"></i><span>${esc(t.task)}<span class="kind">${KIND[t.exposure]}${t.type ? " · " + esc(t.type.toLowerCase()) + " task" : ""}${t.inUse ? ' · <b class="seen">Seen in real AI use</b>' : ""}</span></span></li>`).join("\n")}
      </ul>
    </section>

    <section class="block">
      <div class="grid2">
        <div>
          <h2>Similar jobs, lower exposure</h2>
          <p class="sub">Related occupations that score at least 10 points lower.</p>
          ${lowerAny.length ? `<ul class="rel">\n${lowerAny.map((o) => `            <li><a href="/jobs/${o.slug}">${esc(o.title)}</a>${mini(o)}</li>`).join("\n")}\n          </ul>` : `<p class="sub">This job is already among the least exposed in its field.</p>`}
        </div>
        <div>
          <h2>Other jobs in this field</h2>
          <p class="sub">${esc(groupName)} occupations close to this one.</p>
          ${field.length ? `<ul class="rel">\n${field.map((o) => `            <li><a href="/jobs/${o.slug}">${esc(o.title)}</a>${mini(o)}</li>`).join("\n")}\n          </ul>` : `<p class="sub"><a href="/jobs/?group=${j.major}">See all ${esc(groupName)} jobs</a></p>`}
        </div>
      </div>
    </section>

    <section class="block">
      <div class="note-box">
        <p><b>How to read this score.</b> Exposure measures how much of the work AI could speed up, not whether the job will disappear. A highly exposed job can change shape, with people spending less time on routine tasks and more on the rest. The score counts tasks AI can speed up on its own in full, and tasks that need extra software at half weight.</p>
        <p>The ratings come from published research based on GPT-4 (2023). To show what's happening now, each task is also checked against the latest Anthropic Economic Index, which records which tasks people actually use AI for. That data is refreshed automatically when Anthropic publishes a new release. <a href="/method.html">Read the full method</a>.</p>
      </div>
    </section>
`;
  return page({
    title: `${j.title}: AI exposure score ${j.score}/100 · Job Exposure Index`,
    desc, path: `/jobs/${j.slug}`, current: "jobs", body,
    jsonld: {
      "@context": "https://schema.org", "@type": "Occupation", name: j.title,
      occupationalCategory: j.code, description: desc,
      ...(j.pay && !j.payNote ? { estimatedSalary: { "@type": "MonetaryAmountDistribution", name: "base", currency: "USD", duration: "P1Y", median: j.pay } } : {}),
      occupationLocation: { "@type": "Country", name: "United States" },
    },
  });
}

// ---------- all jobs page ----------

function listPage() {
  const opts = [...groups.entries()].filter(([k]) => jobs.some((j) => j.major === k)).sort((a, b) => a[1].localeCompare(b[1]));
  const body = `
    <div class="eyebrow" style="margin-top:20px">The index</div>
    <h1>All ${TOTAL} US jobs, ranked by AI exposure</h1>
    <p class="lede">Search for your job, or browse by field. The score runs from 0 (AI can speed up almost none of the tasks) to 100 (AI can speed up almost all of them). <a href="/method.html">How scores work</a>.</p>
    <div class="tools">
      <label class="sr" for="q">Search jobs</label>
      <input id="q" type="search" placeholder="Search, e.g. accountant, nurse, driver" autocomplete="off">
      <label class="sr" for="group">Field</label>
      <select id="group"><option value="">All fields</option>${opts.map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select>
    </div>
    <p class="count" id="count" aria-live="polite">${TOTAL} jobs</p>
    <div class="table-scroll">
      <table id="jobs">
        <thead><tr><th>#</th><th><button type="button" data-sort="title">Job</button></th><th><button type="button" data-sort="score" aria-pressed="true">Exposure ↓</button></th><th class="hide-sm">Level</th><th class="n hide-sm"><button type="button" data-sort="use">In use</button></th><th class="n hide-sm"><button type="button" data-sort="emp">US workers</button></th><th class="n hide-sm"><button type="button" data-sort="pay">Median pay</button></th></tr></thead>
        <tbody>
${jobs.map((j) => `          <tr data-g="${j.major}" data-score="${j.beta}" data-use="${j.inUse / Math.max(j.tasks.length, 1)}" data-emp="${j.emp ?? -1}" data-pay="${j.pay ?? -1}" data-title="${esc(j.title.toLowerCase())}"><td class="rk">${j.rank}</td><td><a href="/jobs/${j.slug}">${esc(j.title)}</a><span class="grp">${esc(groups.get(j.major) ?? "")}</span></td><td>${mini(j)}</td><td class="hide-sm">${pill(j)}</td><td class="n hide-sm">${pct(j.inUse, j.tasks.length)}%</td><td class="n hide-sm">${j.emp ? fmt(j.emp) : "–"}</td><td class="n hide-sm">${j.pay ? money(j.pay) + (j.payNote === "or more" ? "+" : "") : "–"}</td></tr>`).join("\n")}
        </tbody>
      </table>
    </div>
    <p class="count" style="margin-top:14px">In use: share of the job's tasks seen in real conversations with Claude, ${AEI_PERIOD} (Anthropic Economic Index). US workers and median pay: BLS, ${BLS_RELEASE}. Where BLS reports a broader group, its figures are shown.</p>
    <script src="/assets/jobs-table.js" defer></script>
`;
  return page({
    title: `All ${TOTAL} US jobs ranked by AI exposure · Job Exposure Index`,
    desc: `Every US occupation ranked by how exposed it is to AI, from the most exposed to the least. Search your job and see which of its tasks AI can do.`,
    path: "/jobs/", current: "jobs", body,
  });
}

// ---------- method page ----------

function methodPage() {
  const counts = ["very-high", "high", "elevated", "moderate", "low"].map((k) => [k, jobs.filter((j) => j.band.key === k).length]);
  const label = { "very-high": "Very high (80–100)", high: "High (60–79)", elevated: "Elevated (40–59)", moderate: "Moderate (20–39)", low: "Low (0–19)" };
  const body = `
    <div class="eyebrow" style="margin-top:20px">Method</div>
    <h1>How the Job Exposure Index works</h1>
    <p class="lede">The index scores ${TOTAL} US occupations from 0 to 100 on how much of their work AI could speed up. Here is exactly where the numbers come from, and what they do and don't mean.</p>

    <section class="block" style="margin-top:40px">
      <div class="grid2">
        <div>
          <h2>1. The tasks</h2>
          <p class="sub">Every occupation starts from its task list in <a href="https://www.onetcenter.org/">O*NET</a>, the US Department of Labor's database of what people in each job actually do. For example, accountants "prepare detailed reports on audit findings". In total the index covers ${fmt(tasks.length)} tasks.</p>
        </div>
        <div>
          <h2>2. The ratings</h2>
          <p class="sub">Each task was rated in the study <a href="https://arxiv.org/abs/2303.10130">"GPTs are GPTs"</a> by Eloundou, Manning, Mishkin and Rock (OpenAI and the University of Pennsylvania, 2023), which used GPT-4 to rate every O*NET task, checked against human raters. We use their published ratings unchanged.</p>
        </div>
      </div>
    </section>

    <section class="block">
      <h2>3. Three kinds of task</h2>
      <p class="sub">A task counts as exposed if a large language model could cut the time it takes by at least half, at the same quality.</p>
      <ul class="legend" style="margin-top:18px;flex-direction:column;gap:10px">
        <li><i class="e1"></i><b>${KIND.E1}.</b>&nbsp;A chat assistant alone could do it at least twice as fast.</li>
        <li><i class="e2"></i><b>${KIND.E2}.</b>&nbsp;It needs software built around the AI, such as access to company data or tools.</li>
        <li><i class="e0"></i><b>${KIND.E0}.</b>&nbsp;Physical work, or tasks where AI wouldn't save meaningful time.</li>
      </ul>
      <p class="sub" style="margin-top:18px">The score counts the first kind in full and the second at half weight: <b>score = (direct tasks + ½ × software tasks) ÷ all tasks × 100</b>. This is the study's main measure, called β.</p>
    </section>

    <section class="block">
      <div class="grid2">
        <div>
          <h2>4. Levels</h2>
          <ul class="rel">
${counts.map(([k, n]) => `            <li><span><span class="pill band-${k}">${label[k]}</span></span><span>${n} jobs</span></li>`).join("\n")}
          </ul>
        </div>
        <div>
          <h2>6. Jobs and pay</h2>
          <p class="sub">The number of US workers and median annual pay come from the Bureau of Labor Statistics' <a href="https://www.bls.gov/oes/">Occupational Employment and Wage Statistics</a>, ${BLS_RELEASE}, the latest release. It refreshes automatically when BLS publishes a new year. Where BLS only reports a broader group, we show that group's figures and say so.</p>
        </div>
      </div>
    </section>

    <section class="block">
      <h2>5. Real-world use</h2>
      <p class="sub">The exposure score says what AI <i>could</i> do. To show what people are <i>actually</i> doing with it, each task is checked against the <a href="https://www.anthropic.com/economic-index">Anthropic Economic Index</a>, which maps millions of anonymised conversations with Claude to the same O*NET tasks. The current data covers ${AEI_PERIOD} (release ${esc(AEI_RELEASE.replace("release_", "").replace(/_/g, "-"))}); ${fmt(tasks.filter((t) => t.inUse).length)} of the ${fmt(tasks.length)} tasks appear in it. A task counts as "seen in real AI use" when it appears in the published data. It reflects one AI assistant, so tasks done with other tools won't show up, and a task that doesn't appear may still be done with AI elsewhere.</p>
      <p class="sub">A GitHub job checks for new Economic Index and BLS releases every week and rebuilds the site when they change.</p>
    </section>

    <section class="block">
      <h2>What the score doesn't tell you</h2>
      <div class="note-box" style="margin-top:16px">
        <p><b>Exposure is not job loss.</b> A high score means AI could change how the work is done. Whether that leads to fewer jobs, different jobs or more productive ones depends on employers, demand and regulation.</p>
        <p><b>The exposure ratings reflect GPT-4 in 2023.</b> AI has improved since, and tools now do more on their own. The real-world use data above is refreshed as Anthropic publishes it, and the weekly report covers what changes.</p>
        <p><b>Jobs vary.</b> Two people with the same job title can do very different work. Use the task list on each job page to see which parts apply to you.</p>
      </div>
    </section>

    <section class="block">
      <h2>Sources and licences</h2>
      <p class="sub">Task data: O*NET database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), used under the <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> licence. Exposure ratings: Eloundou, T., Manning, S., Mishkin, P. and Rock, D. (2023), "GPTs are GPTs: An Early Look at the Labor Market Impact Potential of Large Language Models", <a href="https://github.com/openai/GPTs-are-GPTs">data published under the MIT licence</a>. Real-world use: Anthropic Economic Index, ${esc(AEI_RELEASE.replace("release_", "").replace(/_/g, "-"))} release, used under CC BY. Employment and pay: BLS OEWS, ${BLS_RELEASE} (public domain).</p>
    </section>
`;
  return page({
    title: "Method: how the Job Exposure Index scores jobs",
    desc: "How the Job Exposure Index scores US jobs on AI exposure: O*NET tasks, GPT-4 task ratings from published research, and BLS employment and pay data.",
    path: "/method.html", current: "method", body,
  });
}

// ---------- write ----------

rmSync(ROOT + "public/jobs", { recursive: true, force: true });
mkdirSync(ROOT + "public/jobs", { recursive: true });
mkdirSync(ROOT + "public/data", { recursive: true });
for (const j of jobs) writeFileSync(ROOT + `public/jobs/${j.slug}.html`, jobPage(j));
writeFileSync(ROOT + "public/jobs/index.html", listPage());
writeFileSync(ROOT + "public/method.html", methodPage());
writeFileSync(ROOT + "public/data/jobs.json", JSON.stringify(jobs.map((j) => ({ t: j.title, s: j.slug, x: j.score, b: j.band.key }))));

// Homepage top 10
const top = jobs.slice(0, 10);
const homeFile = ROOT + "public/index.html";
const home = read("public/index.html");
const topHtml = `<!-- top10:start -->
          <ol class="toplist">
${top.map((j) => `            <li><a href="/jobs/${j.slug}">${esc(j.title)}</a>${mini(j)}</li>`).join("\n")}
          </ol>
          <!-- top10:end -->`;
writeFileSync(homeFile, home.replace(/<!-- top10:start -->[\s\S]*?<!-- top10:end -->/, topHtml));

const urls = ["/", "/jobs/", "/method.html", "/privacy.html", "/terms.html", ...jobs.map((j) => `/jobs/${j.slug}`)];
writeFileSync(ROOT + "public/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${TODAY}</lastmod></url>`).join("\n")}
</urlset>
`);

console.log(`Built ${TOTAL} job pages. No BLS match: ${jobs.filter((j) => !j.bls).length}. Missing employment: ${jobs.filter((j) => !j.emp).length}.`);
