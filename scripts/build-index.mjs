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
// Every job page links to the Skill Half Life waitlist with its slug, so that site can show the job's score.
const SHL = "https://skillhalflife.com/";

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

const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#EDE8DE"/><rect x="12" y="38" width="8" height="14" rx="1.5" fill="#3FA796"/><rect x="24" y="30" width="8" height="22" rx="1.5" fill="#E3B341"/><rect x="36" y="20" width="8" height="32" rx="1.5" fill="#E8743B"/><rect x="48" y="11" width="6" height="41" rx="1.5" fill="#D9473A"/></svg>`;

function page({ title, desc, path, current, body, jsonld, image = "/og.png" }) {
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
<meta property="og:image" content="${SITE}${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/assets/site.css">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>\n` : ""}</head>
<body>
<div class="wrap">
  <header class="top">
    <a class="brand" href="/" aria-label="Job Exposure Index home">${LOGO}<span>Job Exposure<br>Index</span></a>
    <nav aria-label="Main"><a class="keep" href="/jobs/"${current === "jobs" ? ' aria-current="page"' : ""}>Explore jobs</a><a href="/method.html"${current === "method" ? ' aria-current="page"' : ""}>Methodology</a><a class="cta" href="#subscribe">Get the weekly report</a></nav>
  </header>
  <main>
${body}
    <section class="closing" id="subscribe">
      <div class="eyebrow" style="color:#F0A07A">The weekly exposure report</div>
      <h2>Know what's changing before it reaches your job.</h2>
      <p class="sub">One short email a week: which jobs are most exposed, the research worth knowing about, and one practical step you can take. Plus a free PDF report the moment you sign up.</p>
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
      <nav aria-label="Footer"><a href="/jobs/">Explore jobs</a><a href="/fields/">By field</a><a href="/lists/">Lists</a><a href="/lists/jobs-ai-cant-replace">Jobs AI can't replace</a><a href="/method.html">Methodology</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></nav>
    </div>
    <p class="disc">Information only, not career, legal or financial advice. Exposure means AI could change how a job is done; it does not mean the job will disappear. Task data from the O*NET database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), used under the <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> license; O*NET® is a trademark of USDOL/ETA. Exposure ratings from Eloundou, Manning, Mishkin and Rock, "GPTs are GPTs" (2023). Real-world use from the Anthropic Economic Index (CC BY). Employment and pay from the BLS Occupational Employment and Wage Statistics, ${BLS_RELEASE}.</p>
  </footer>
</div>
<script src="/assets/signup.js" defer></script>
<script src="/assets/share.js" defer></script>
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
  const desc = `Will AI replace ${j.title.toLowerCase()}? Their AI exposure score is ${j.score}/100 (${j.band.label.toLowerCase()}), #${j.rank} of ${TOTAL} US jobs. See which tasks AI can and can't do.`;
  const faq = jobFaq(j);

  const body = `
    <article>
      <p class="crumbs"><a href="/">Home</a> / <a href="/jobs/">All jobs</a> / <a href="/fields/${fieldSlug(j.major)}">${esc(groupName)}</a></p>
      <div class="eyebrow" style="margin-top:28px">AI exposure score</div>
      <h1>${esc(j.title)}</h1>
      <p class="lede">${esc(j.title)} score <b>${j.score} out of 100</b>, which is ${j.band.label.toLowerCase()} exposure to AI. That ranks #${j.rank} of ${TOTAL} US occupations, where #1 is the most exposed. Of the ${n} tasks in this job, AI could speed up ${j.e1} on its own and ${j.e2} more with extra software built on top of it. ${j.inUse ? `In ${AEI_PERIOD}, ${j.inUse} of these tasks showed up in real conversations with Claude, Anthropic's AI assistant.` : `None of its tasks showed up in real AI use in ${AEI_PERIOD}.`}</p>

      <div class="share" data-title="${esc(j.title)}" data-score="${j.score}">
        <span>Share this score:</span>
        <a class="sh" data-net="x" href="https://x.com/intent/post?text=${encodeURIComponent(shareText(j))}&amp;url=${encodeURIComponent(SITE + "/jobs/" + j.slug)}" target="_blank" rel="noopener">X</a>
        <a class="sh" data-net="bluesky" href="https://bsky.app/intent/compose?text=${encodeURIComponent(shareText(j) + " " + SITE + "/jobs/" + j.slug)}" target="_blank" rel="noopener">Bluesky</a>
        <a class="sh" data-net="linkedin" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SITE + "/jobs/" + j.slug)}" target="_blank" rel="noopener">LinkedIn</a>
        <button type="button" class="sh" data-copy="${SITE}/jobs/${j.slug}">Copy link</button>
      </div>

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

    ${inlineSignup(`Follow how AI is changing ${j.title.toLowerCase()} work.`, "job-signup")}

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

    <section class="next-step">
      <div>
        <div class="eyebrow">What you can do about it</div>
        <h2>Get a personal plan for what to learn next.</h2>
        <p>Skill Half Life turns this score into a 90-day plan for your situation: your realistic options, the skills that carry over, and training that fits your time and budget. Coming soon.</p>
      </div>
      <a class="go" href="${SHL}?job=${j.slug}&amp;utm_source=jobexposureindex&amp;utm_medium=job_page">See your options</a>
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
          ${field.length ? `<ul class="rel">\n${field.map((o) => `            <li><a href="/jobs/${o.slug}">${esc(o.title)}</a>${mini(o)}</li>`).join("\n")}\n          </ul>` : ""}
          <p class="sub" style="margin-top:14px"><a href="/fields/${fieldSlug(j.major)}">All ${esc(groupName.toLowerCase())} jobs and AI</a></p>
        </div>
      </div>
    </section>

    <section class="block">
      <h2>Questions about ${esc(j.title.toLowerCase())} and AI</h2>
      <div class="faq">
${faq.map(([q, a]) => `        <details${q === faq[0][0] ? " open" : ""}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n")}
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
    title: `Will AI replace ${j.title}? AI exposure ${j.score}/100 · Job Exposure Index`,
    desc, path: `/jobs/${j.slug}`, current: "jobs", body, image: `/cards/${j.slug}.jpg`,
    jsonld: [{
      "@context": "https://schema.org", "@type": "Occupation", name: j.title,
      occupationalCategory: j.code, description: desc,
      ...(j.pay && !j.payNote ? { estimatedSalary: { "@type": "MonetaryAmountDistribution", name: "base", currency: "USD", duration: "P1Y", median: j.pay } } : {}),
      occupationLocation: { "@type": "Country", name: "United States" },
    }, {
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    }],
  });
}

function shareText(j) {
  return `${j.title} scored ${j.score}/100 on the Job Exposure Index: ${j.band.label.toLowerCase()} exposure to AI. How exposed is your job?`;
}

// Plain-language questions and answers for each job page, built only from the job's own data.
function jobFaq(j) {
  const t = j.title.toLowerCase(), n = j.tasks.length;
  const pick = (e) => j.tasks.filter((x) => x.exposure === e).sort((a, c) => (a.type === "Core" ? 0 : 1) - (c.type === "Core" ? 0 : 1)).slice(0, 3).map((x) => x.task.replace(/\.$/, ""));
  const list = (xs) => xs.map((x) => `"${x}"`).join("; ");
  const exposed = pick("E1").length ? pick("E1") : pick("E2");
  const safe = pick("E0");
  const out = [
    [`Will AI replace ${t}?`,
      `${j.score >= 60 ? "Probably not entirely, but the job is likely to change a lot." : j.score >= 40 ? "Not entirely. Parts of the job are likely to change as AI takes over routine tasks." : "Unlikely. Most of the work is hard for today's AI to speed up."} ${j.title} score ${j.score} out of 100 (${j.band.label.toLowerCase()} exposure), #${j.rank} of ${TOTAL} US jobs. AI could speed up ${j.e1 + j.e2} of the job's ${n} tasks, ${j.e1} of them on its own${j.e0 ? `, while ${j.e0} see little or no speed-up` : ""}. Exposure means the work is likely to change, not that the job will disappear.`],
  ];
  if (exposed.length) out.push([`Which ${t} tasks can AI do?`, `The most exposed tasks include ${list(exposed)}.`]);
  out.push([`Which ${t} tasks are hardest for AI?`, safe.length ? `Tasks with little or no AI speed-up include ${list(safe)}.` : `Every task in this job has some AI exposure, though ${j.e2} of them need extra software built around the AI.`]);
  out.push([`Are people already using AI for this work?`, j.inUse
    ? `Yes. In ${AEI_PERIOD}, ${j.inUse} of the ${n} tasks showed up in real conversations with Claude, according to the Anthropic Economic Index.`
    : `Not much yet. None of the job's tasks showed up in real conversations with Claude in ${AEI_PERIOD}, according to the Anthropic Economic Index.`]);
  if (j.emp && j.pay) out.push([`How many people work as ${t}, and what do they earn?`,
    `About ${fmt(j.emp)} people in the US${j.blsIsGroup ? ` (figure for ${j.bls.title})` : ""}, with median pay of ${money(j.pay)}${j.payNote === "or more" ? " or more" : ""} a year (BLS, ${BLS_RELEASE}).`]);
  return out;
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

// ---------- fields (one page per SOC major group) ----------

const REPORT_PDF = "/downloads/ai-job-exposure-report.pdf";
const fieldSlug = (major) => slugify(groups.get(major) ?? "other");
const fieldList = [...groups.entries()].filter(([k]) => jobs.some((j) => j.major === k)).map(([major, name]) => {
  const js = jobs.filter((j) => j.major === major);
  const avg = Math.round(js.reduce((s, j) => s + j.score, 0) / js.length);
  const emp = js.reduce((s, j) => s + (j.emp ?? 0), 0);
  return { major, name, slug: fieldSlug(major), jobs: js, avg, emp, band: band(avg) };
}).sort((a, b) => b.avg - a.avg);
fieldList.forEach((f, i) => { f.rank = i + 1; });
const fieldOf = new Map(fieldList.map((f) => [f.major, f]));

// A sortable-looking but static table of jobs, used by field and list pages.
function jobTable(list, { numbered = true } = {}) {
  return `<div class="table-scroll">
      <table>
        <thead><tr>${numbered ? "<th>#</th>" : ""}<th>Job</th><th>Exposure</th><th class="hide-sm">Level</th><th class="n hide-sm">US workers</th><th class="n hide-sm">Median pay</th></tr></thead>
        <tbody>
${list.map((j, i) => `          <tr>${numbered ? `<td class="rk">${i + 1}</td>` : ""}<td><a href="/jobs/${j.slug}">${esc(j.title)}</a><span class="grp">${esc(groups.get(j.major) ?? "")}</span></td><td>${mini(j)}</td><td class="hide-sm">${pill(j)}</td><td class="n hide-sm">${j.emp ? fmt(j.emp) : "–"}</td><td class="n hide-sm">${j.pay ? money(j.pay) + (j.payNote === "or more" ? "+" : "") : "–"}</td></tr>`).join("\n")}
        </tbody>
      </table>
    </div>`;
}

const faqHtml = (faq) => `<div class="faq">
${faq.map(([q, a], i) => `        <details${i === 0 ? " open" : ""}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n")}
      </div>`;
const faqLd = (faq) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });

function fieldPage(f) {
  const sorted = [...f.jobs].sort((a, b) => b.beta - a.beta);
  const k = Math.min(5, Math.floor(sorted.length / 2)), least = [...sorted].reverse().slice(0, k), most = sorted.slice(0, k);
  const counts = ["very-high", "high", "elevated", "moderate", "low"].map((k) => [k, f.jobs.filter((j) => j.band.key === k).length]).filter(([, n]) => n);
  const label = { "very-high": "Very high", high: "High", elevated: "Elevated", moderate: "Moderate", low: "Low" };
  const lower = f.name.toLowerCase();
  const faq = [
    [`Will AI replace ${lower} jobs?`, `Not as a whole. The ${f.jobs.length} ${lower} jobs in the index have an average AI exposure score of ${f.avg} out of 100 (${f.band.label.toLowerCase()}), #${f.rank} of ${fieldList.length} fields. Exposure means parts of the work are likely to change, not that the jobs will disappear.`],
    [`Which ${lower} jobs are most exposed to AI?`, `${most.slice(0, 3).map((j) => `${j.title} (${j.score}/100)`).join(", ")}.`],
    [`Which ${lower} jobs are safest from AI?`, `${least.slice(0, 3).map((j) => `${j.title} (${j.score}/100)`).join(", ")}.`],
  ];
  if (f.emp) faq.push([`How many people work in ${lower} jobs?`, `About ${fmt(f.emp)} people in the US work in the jobs listed here (BLS, ${BLS_RELEASE}).`]);
  const desc = `Will AI replace ${lower} jobs? All ${f.jobs.length} ${lower} occupations ranked by AI exposure. Average score ${f.avg}/100, #${f.rank} of ${fieldList.length} fields.`;
  const body = `
    <p class="crumbs"><a href="/">Home</a> / <a href="/fields/">All fields</a></p>
    <div class="eyebrow" style="margin-top:28px">AI exposure by field</div>
    <h1>Will AI replace ${esc(lower)} jobs?</h1>
    <p class="lede">The ${f.jobs.length} ${esc(lower)} jobs in the index score <b>${f.avg} out of 100</b> on average, which is ${f.band.label.toLowerCase()} exposure to AI. That ranks the field #${f.rank} of ${fieldList.length}, where #1 is the most exposed.${f.emp ? ` Together these jobs employ about ${fmt(f.emp)} people in the US.` : ""}</p>
    <ul class="legend" style="margin-top:20px">
${counts.map(([k, n]) => `      <li><span class="pill band-${k}">${label[k]}</span>&nbsp;${n} job${n === 1 ? "" : "s"}</li>`).join("\n")}
    </ul>

    ${inlineSignup(`Follow how AI is changing ${lower} work.`, `fld-${f.slug}`)}

    <section class="block">
      <div class="grid2">
        <div>
          <h2>Most exposed</h2>
          <ul class="rel">
${most.map((o) => `            <li><a href="/jobs/${o.slug}">${esc(o.title)}</a>${mini(o)}</li>`).join("\n")}
          </ul>
        </div>
        <div>
          <h2>Least exposed</h2>
          <ul class="rel">
${least.map((o) => `            <li><a href="/jobs/${o.slug}">${esc(o.title)}</a>${mini(o)}</li>`).join("\n")}
          </ul>
        </div>
      </div>
    </section>

    <section class="block">
      <h2>All ${f.jobs.length} ${esc(lower)} jobs, most exposed first</h2>
      <p class="sub" style="margin-bottom:18px">Scores run from 0 (AI can speed up almost none of the tasks) to 100 (almost all of them). <a href="/method.html">How scores work</a>.</p>
      ${jobTable(sorted)}
    </section>

    <section class="block">
      <h2>Questions about ${esc(lower)} jobs and AI</h2>
      ${faqHtml(faq)}
    </section>

    <section class="block">
      <h2>Other fields</h2>
      <ul class="rel">
${fieldList.filter((o) => o !== f).map((o) => `        <li><a href="/fields/${o.slug}">${esc(o.name)}</a><span class="mini band-${o.band.key}"><span class="bar"><i style="width:${Math.max(o.avg, 2)}%"></i></span><b>${o.avg}</b></span></li>`).join("\n")}
      </ul>
    </section>
`;
  return page({ title: `Will AI replace ${f.name} jobs? AI exposure for ${f.jobs.length} jobs · Job Exposure Index`, desc, path: `/fields/${f.slug}`, current: "jobs", body, jsonld: [faqLd(faq)] });
}

function fieldsIndex() {
  const body = `
    <div class="eyebrow" style="margin-top:20px">AI exposure by field</div>
    <h1>Which fields are most exposed to AI?</h1>
    <p class="lede">All ${fieldList.length} job fields, ranked by the average AI exposure score of their jobs. Click a field to see every job in it.</p>
    <section class="block" style="margin-top:32px">
      <div class="table-scroll">
        <table>
          <thead><tr><th>#</th><th>Field</th><th>Average exposure</th><th class="n hide-sm">Jobs</th><th class="n hide-sm">US workers</th></tr></thead>
          <tbody>
${fieldList.map((f) => `            <tr><td class="rk">${f.rank}</td><td><a href="/fields/${f.slug}">${esc(f.name)}</a></td><td><span class="mini band-${f.band.key}"><span class="bar"><i style="width:${Math.max(f.avg, 2)}%"></i></span><b>${f.avg}</b></span></td><td class="n hide-sm">${f.jobs.length}</td><td class="n hide-sm">${f.emp ? fmt(f.emp) : "–"}</td></tr>`).join("\n")}
          </tbody>
        </table>
      </div>
    </section>
`;
  return page({ title: "AI exposure by field: which careers are most exposed to AI? · Job Exposure Index", desc: `All ${fieldList.length} US job fields ranked by how exposed their jobs are to AI, from computer and math jobs to construction and healthcare.`, path: "/fields/", current: "jobs", body });
}

// ---------- lists ----------

const withEmp = jobs.filter((j) => j.emp);
const LISTS = [
  {
    slug: "jobs-ai-cant-replace", short: "Jobs AI can't replace",
    title: "Jobs AI can't replace: the 50 least exposed US jobs",
    h1: "Jobs AI can't replace",
    lede: `The 50 US jobs where AI can speed up the least of the work, out of ${TOTAL}. Most involve hands-on physical work, care for people, or work in unpredictable places.`,
    jobs: [...jobs].sort((a, b) => a.beta - b.beta || (b.emp ?? 0) - (a.emp ?? 0)).slice(0, 50),
  },
  {
    slug: "ai-proof-jobs-that-pay-well", short: "AI-proof jobs that pay well",
    title: "AI-proof jobs that pay well: low AI exposure, $80,000+ a year",
    h1: "AI-proof jobs that pay well",
    lede: "Jobs with low or moderate AI exposure (a score under 40) and median pay of at least $80,000 a year, highest pay first.",
    jobs: jobs.filter((j) => j.score < 40 && j.pay >= 80000).sort((a, b) => b.pay - a.pay).slice(0, 50),
  },
  {
    slug: "common-jobs-safest-from-ai", short: "Common jobs safest from AI",
    title: "Common jobs safest from AI: the biggest US jobs with low AI exposure",
    h1: "Common jobs safest from AI",
    lede: "The jobs that employ the most people in the US while scoring under 30 for AI exposure. Good options if you want work that is both easy to find and hard to automate.",
    jobs: withEmp.filter((j) => j.score < 30).sort((a, b) => b.emp - a.emp).slice(0, 50),
  },
  {
    slug: "jobs-most-exposed-to-ai", short: "Jobs most exposed to AI",
    title: "Jobs most exposed to AI: the 50 highest-scoring US jobs",
    h1: "Jobs most exposed to AI",
    lede: `The 50 US jobs, out of ${TOTAL}, where AI could speed up the most of the work. High exposure means the job is likely to change, not that it will disappear.`,
    jobs: jobs.slice(0, 50),
  },
  {
    slug: "well-paid-jobs-most-exposed-to-ai", short: "Well-paid jobs most exposed to AI",
    title: "Well-paid jobs most exposed to AI: $100,000+ jobs with high exposure",
    h1: "Well-paid jobs most exposed to AI",
    lede: "Jobs paying a median of $100,000 or more a year that score 60 or higher for AI exposure. AI is reaching well-paid office work first.",
    jobs: jobs.filter((j) => j.score >= 60 && j.pay >= 100000).sort((a, b) => b.beta - a.beta).slice(0, 50),
  },
];

function listFaq(l) {
  const top = l.jobs.slice(0, 3).map((j) => `${j.title} (${j.score}/100)`).join(", ");
  return [
    [`${l.short}: which come first?`, `${top}. The full list has ${l.jobs.length} jobs.`],
    ["How is AI exposure measured?", "Each job's tasks, from the US Department of Labor's O*NET database, are rated on whether AI could do them at least twice as fast at the same quality. The score is the share of tasks AI can speed up, from 0 to 100."],
    ["Does a low score mean the job is safe forever?", "No. It means today's AI can speed up little of the work. Tools around the job can still change, so it pays to keep learning."],
  ];
}

function listPageFor(l) {
  const faq = listFaq(l);
  const body = `
    <p class="crumbs"><a href="/">Home</a> / <a href="/lists/">Lists</a></p>
    <div class="eyebrow" style="margin-top:28px">Job Exposure Index list</div>
    <h1>${esc(l.h1)}</h1>
    <p class="lede">${esc(l.lede)}</p>
    ${inlineSignup("Get the full report on the jobs AI is changing most.", `lst-${l.slug}`)}
    <section class="block">
      ${jobTable(l.jobs)}
      <p class="count" style="margin-top:14px">US workers and median pay: BLS, ${BLS_RELEASE}. Exposure scores: <a href="/method.html">how they work</a>.</p>
    </section>
    <section class="block">
      <h2>Questions</h2>
      ${faqHtml(faq)}
    </section>
    <section class="block">
      <h2>More lists</h2>
      <ul class="rel">
${LISTS.filter((o) => o !== l).map((o) => `        <li><a href="/lists/${o.slug}">${esc(o.short)}</a><span>${o.jobs.length} jobs</span></li>`).join("\n")}
        <li><a href="/fields/">AI exposure by field</a><span>${fieldList.length} fields</span></li>
      </ul>
    </section>
`;
  return page({
    title: `${l.title} · Job Exposure Index`, desc: `${l.lede}`.slice(0, 300), path: `/lists/${l.slug}`, current: "jobs", body,
    jsonld: [{ "@context": "https://schema.org", "@type": "ItemList", name: l.h1, numberOfItems: l.jobs.length, itemListElement: l.jobs.map((j, i) => ({ "@type": "ListItem", position: i + 1, name: j.title, url: `${SITE}/jobs/${j.slug}` })) }, faqLd(faq)],
  });
}

function listsIndex() {
  const body = `
    <div class="eyebrow" style="margin-top:20px">Lists</div>
    <h1>AI and jobs, in lists</h1>
    <p class="lede">Ready-made lists from the index: the jobs AI is least and most likely to change, and where pay and exposure meet.</p>
    <section class="block" style="margin-top:32px">
      <ul class="rel">
${LISTS.map((o) => `        <li><a href="/lists/${o.slug}">${esc(o.short)}</a><span>${o.jobs.length} jobs</span></li>`).join("\n")}
        <li><a href="/fields/">AI exposure by field</a><span>${fieldList.length} fields</span></li>
        <li><a href="/jobs/">All ${TOTAL} jobs, ranked</a><span>${TOTAL} jobs</span></li>
      </ul>
    </section>
`;
  return page({ title: "Lists: jobs AI can't replace, AI-proof jobs that pay well and more · Job Exposure Index", desc: "Lists of US jobs by AI exposure: jobs AI can't replace, AI-proof jobs that pay well, common jobs safest from AI, and the jobs most exposed.", path: "/lists/", current: "jobs", body });
}

// ---------- free report (HTML source for the PDF that subscribers get) ----------

function reportPage() {
  const month = new Date().toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const totalEmp = withEmp.reduce((s, j) => s + j.emp, 0);
  const highEmp = withEmp.filter((j) => j.score >= 60).reduce((s, j) => s + j.emp, 0);
  const lowEmp = withEmp.filter((j) => j.score < 30).reduce((s, j) => s + j.emp, 0);
  const tasksInUse = tasks.filter((t) => t.inUse).length;
  const big = withEmp.filter((j) => j.emp >= 10000);
  const row = (j) => `<tr><td>${esc(j.title)}</td><td class="n">${j.score}</td><td class="n">${j.emp ? fmt(j.emp) : "–"}</td><td class="n">${j.pay ? money(j.pay) + (j.payNote === "or more" ? "+" : "") : "–"}</td></tr>`;
  const table = (list) => `<table><thead><tr><th>Job</th><th class="n">Score</th><th class="n">US workers</th><th class="n">Median pay</th></tr></thead><tbody>${list.map(row).join("")}</tbody></table>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<title>The AI Job Exposure Report, ${month}</title>
<style>
@page { size: Letter; margin: 14mm 16mm; }
body { font: 11pt/1.5 "Helvetica Neue", Arial, sans-serif; color: #17202A; margin: 0; }
h1 { font-size: 28pt; line-height: 1.1; margin: 0 0 6pt; }
h2 { font-size: 16pt; margin: 22pt 0 6pt; break-after: avoid; }
p { margin: 0 0 8pt; }
.muted { color: #5B6573; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10pt; margin: 16pt 0; }
.kpis div { border: 1px solid #D9D4C7; border-radius: 6pt; padding: 10pt; }
.kpis b { display: block; font-size: 20pt; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 6pt; }
th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: #5B6573; border-bottom: 1.5pt solid #17202A; padding: 4pt; }
td { border-bottom: 1px solid #E5E1D6; padding: 2.5pt 4pt; }
.n { text-align: right; white-space: nowrap; }
tr { break-inside: avoid; }
ol li { margin-bottom: 6pt; }
.cover { border-bottom: 3pt solid #E8743B; padding-bottom: 12pt; }
.foot { font-size: 8.5pt; color: #5B6573; margin-top: 20pt; }
.new { break-before: page; }
</style></head><body>
<div class="cover">
  <p class="muted">Job Exposure Index · jobexposureindex.com</p>
  <h1>The AI Job Exposure Report</h1>
  <p class="muted">${month} · ${TOTAL} US jobs, ${fmt(tasks.length)} tasks</p>
</div>
<div class="kpis">
  <div><b>${pct(highEmp, totalEmp)}%</b>of US workers are in jobs with high or very high AI exposure (score 60+)</div>
  <div><b>${pct(lowEmp, totalEmp)}%</b>are in jobs with low exposure (score under 30)</div>
  <div><b>${fmt(tasksInUse)}</b>of ${fmt(tasks.length)} job tasks already show up in real AI use (${AEI_PERIOD})</div>
</div>
<p>Exposure measures how much of a job's work AI could speed up, from 0 to 100. A high score means the job is likely to change shape, not that it will disappear. Worker shares cover the ${fmt(withEmp.length)} jobs with published BLS employment figures.</p>

<h2>Exposure by field</h2>
<table><thead><tr><th>Field</th><th class="n">Average score</th><th class="n">Jobs</th><th class="n">US workers</th></tr></thead><tbody>
${fieldList.map((f) => `<tr><td>${esc(f.name)}</td><td class="n">${f.avg}</td><td class="n">${f.jobs.length}</td><td class="n">${f.emp ? fmt(f.emp) : "–"}</td></tr>`).join("")}
</tbody></table>

<h2>The 20 most exposed jobs</h2>
<p class="muted">Among jobs with at least 10,000 US workers.</p>
${table(big.slice().sort((a, b) => b.beta - a.beta).slice(0, 20))}

<h2 class="new">The 20 least exposed jobs</h2>
<p class="muted">Among jobs with at least 10,000 US workers; ties go to the jobs with the most workers.</p>
${table(big.slice().sort((a, b) => a.beta - b.beta || b.emp - a.emp).slice(0, 20))}

<h2 class="new">AI-resilient jobs that pay $80,000 or more</h2>
<p class="muted">Score under 40, highest median pay first.</p>
${table(LISTS[1].jobs.slice(0, 15))}

<h2>Five steps to stay ahead, whatever your score</h2>
<ol>
  <li><b>Look up your own job's tasks.</b> Your job page on jobexposureindex.com lists every task and whether AI can speed it up. Mark the ones you spend most time on.</li>
  <li><b>Use AI on your most exposed tasks first.</b> People who use AI for the routine parts of their job become more productive, and harder to replace.</li>
  <li><b>Grow the tasks AI finds hard.</b> Judgement, working with people, hands-on work and responsibility for outcomes hold their value longest.</li>
  <li><b>Know your nearby options.</b> Each job page lists similar jobs with lower exposure that use many of the same skills.</li>
  <li><b>Check in regularly.</b> AI changes fast. The weekly report tells you when something moves for your field.</li>
</ol>

<p class="foot">Sources: task data from O*NET (USDOL/ETA, CC BY 4.0); exposure ratings from Eloundou, Manning, Mishkin and Rock, "GPTs are GPTs" (2023); real-world use from the Anthropic Economic Index (CC BY); employment and pay from BLS OEWS, ${BLS_RELEASE}. Information only, not career, legal or financial advice. Full method: jobexposureindex.com/method.html</p>
</body></html>
`;
}

// Signup box that sits inside a page (job, field and list pages).
function inlineSignup(heading, id) {
  return `<section class="inline-signup">
      <div>
        <div class="eyebrow">Free report</div>
        <h2>${esc(heading)}</h2>
        <p>Subscribe to the weekly report and get <b>The AI Job Exposure Report (PDF)</b> right away: the most and least exposed jobs, exposure by field, and the AI-resilient jobs that pay well.</p>
      </div>
      <div>
        <form class="signup" action="https://app.kit.com/forms/${KIT_FORM}/subscriptions" method="post" novalidate>
          <label class="sr" for="${id}">Email address</label>
          <input id="${id}" name="email_address" type="email" placeholder="you@example.com" autocomplete="email" required>
          <button type="submit">Get the free report</button>
        </form>
        <p class="note" aria-live="polite">Free · one email a week · unsubscribe anytime</p>
      </div>
    </section>`;
}

// ---------- write ----------

rmSync(ROOT + "public/jobs", { recursive: true, force: true });
mkdirSync(ROOT + "public/jobs", { recursive: true });
mkdirSync(ROOT + "public/data", { recursive: true });
for (const j of jobs) writeFileSync(ROOT + `public/jobs/${j.slug}.html`, jobPage(j));
for (const dir of ["fields", "lists"]) { rmSync(ROOT + `public/${dir}`, { recursive: true, force: true }); mkdirSync(ROOT + `public/${dir}`, { recursive: true }); }
for (const f of fieldList) writeFileSync(ROOT + `public/fields/${f.slug}.html`, fieldPage(f));
writeFileSync(ROOT + "public/fields/index.html", fieldsIndex());
for (const l of LISTS) writeFileSync(ROOT + `public/lists/${l.slug}.html`, listPageFor(l));
writeFileSync(ROOT + "public/lists/index.html", listsIndex());
// Source of the free PDF report; scripts/build-report.mjs prints it to public/downloads/.
writeFileSync(ROOT + "data/report.html", reportPage());
writeFileSync(ROOT + "public/jobs/index.html", listPage());
writeFileSync(ROOT + "public/method.html", methodPage());
// Facts for the daily social posts (scripts/post-daily.mjs).
const firstTask = (j, e) => j.tasks.filter((t) => t.exposure === e).sort((a, c) => (a.type === "Core" ? 0 : 1) - (c.type === "Core" ? 0 : 1) || a.task.length - c.task.length)[0]?.task.replace(/\.$/, "") ?? null;
writeFileSync(ROOT + "data/social-jobs.json", JSON.stringify({
  total: TOTAL, period: AEI_PERIOD,
  jobs: jobs.map((j) => ({
    title: j.title, slug: j.slug, score: j.score, band: j.band.label, rank: j.rank,
    tasks: j.tasks.length, e1: j.e1, e2: j.e2, e0: j.e0, inUse: j.inUse, emp: j.emp, pay: j.payNote ? null : j.pay,
    exposedTask: firstTask(j, "E1") ?? firstTask(j, "E2"), safeTask: firstTask(j, "E0"),
  })),
}, null, 1));
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

const urls = ["/", "/jobs/", "/fields/", "/lists/", "/method.html", "/privacy.html", "/terms.html", ...LISTS.map((l) => `/lists/${l.slug}`), ...fieldList.map((f) => `/fields/${f.slug}`), ...jobs.map((j) => `/jobs/${j.slug}`)];
writeFileSync(ROOT + "public/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${TODAY}</lastmod></url>`).join("\n")}
</urlset>
`);

console.log(`Built ${TOTAL} job pages. No BLS match: ${jobs.filter((j) => !j.bls).length}. Missing employment: ${jobs.filter((j) => !j.emp).length}.`);
