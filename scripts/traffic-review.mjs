// Weekly traffic review from Cloudflare Web Analytics, with bots left out.
// Runs every Monday on GitHub Actions (.github/workflows/traffic-review.yml) with the
// CLOUDFLARE_API_TOKEN secret (a read-only token with "Account Analytics: Read").
//
//   node scripts/traffic-review.mjs              review the last 7 full days, open a GitHub issue
//   node scripts/traffic-review.mjs --dry-run    print the review only
//   node scripts/traffic-review.mjs --days 28    review a longer period
//
// Every site in the Cloudflare account that has Web Analytics gets its own section
// (jobexposureindex.com, skillhalflife.com, qbitoro.com, ...). For each site: human visits and
// page views compared with the period before, visits per day, top pages, where visitors came
// from, countries, devices and Core Web Vitals (how fast the pages feel).
//
// The script asks Cloudflare which fields its analytics API offers before it queries them, so a
// field Cloudflare renames or drops is skipped and noted instead of failing the whole review.

import { appendFileSync } from "node:fs";

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const API = process.env.CLOUDFLARE_API_BASE || "https://api.cloudflare.com/client/v4";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const DAYS = args.includes("--days") ? Number(args[args.indexOf("--days") + 1]) : 7;
const TOP = 10;
const notes = [];

if (!TOKEN) fail("The CLOUDFLARE_API_TOKEN secret is missing. See README.md, \"Weekly traffic review\".");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

// ---------- Cloudflare API ----------

async function rest(path) {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const why = (body.errors ?? []).map((e) => e.message).join("; ") || res.statusText;
    fail(`Cloudflare said no to ${path} (${res.status}): ${why}`);
  }
  return body.result;
}

async function gql(query, variables = {}) {
  const res = await fetch(API + "/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors?.length) {
    const why = (body.errors ?? []).map((e) => e.message).join("; ") || res.statusText;
    throw new Error(`Cloudflare analytics query failed (${res.status}): ${why}`);
  }
  return body.data;
}

// ---------- find out what the analytics API offers ----------

const typeCache = new Map();
const unwrap = (t) => (t.ofType ? unwrap(t.ofType) : t.name);

async function fieldsOf(typeName) {
  if (typeCache.has(typeName)) return typeCache.get(typeName);
  const data = await gql(
    `query($n: String!) { __type(name: $n) {
      fields { name type { name ofType { name ofType { name ofType { name } } } }
        args { name type { name ofType { name ofType { name } } } } }
      inputFields { name }
    } }`,
    { n: typeName },
  );
  const t = data.__type ?? {};
  const out = new Map();
  for (const f of t.fields ?? []) out.set(f.name, { type: unwrap(f.type), args: Object.fromEntries(f.args.map((a) => [a.name, unwrap(a.type)])) });
  for (const f of t.inputFields ?? []) out.set(f.name, {});
  typeCache.set(typeName, out);
  return out;
}

async function dataset(name) {
  const root = (await gql(`{ __schema { queryType { name } } }`)).__schema.queryType.name;
  const viewer = (await fieldsOf(root)).get("viewer");
  const accounts = (await fieldsOf(viewer.type)).get("accounts");
  const ds = (await fieldsOf(accounts.type)).get(name);
  if (!ds) return null;
  const fields = await fieldsOf(ds.type);
  const sub = async (k) => (fields.has(k) ? [...(await fieldsOf(fields.get(k).type)).keys()] : []);
  return {
    filters: new Set((await fieldsOf(ds.args.filter)).keys()),
    dimensions: new Set(await sub("dimensions")),
    sums: new Set(await sub("sum")),
    quantiles: new Set(await sub("quantiles")),
    hasCount: fields.has("count"),
  };
}

// ---------- dates ----------

const day = (d) => d.toISOString().slice(0, 10);
const todayUTC = new Date(day(new Date()) + "T00:00:00Z");
const shift = (d, n) => new Date(d.getTime() + n * 86400000);
const period = { from: day(shift(todayUTC, -DAYS)), to: day(todayUTC) }; // to is exclusive
const before = { from: day(shift(todayUTC, -2 * DAYS)), to: period.from };

// ---------- queries ----------

let PAGES, VITALS;

function filterFor(ds, range, host, humans = true) {
  const f = { date_geq: range.from, date_lt: range.to };
  if (host) f.requestHost = host;
  if (humans && ds.filters.has("bot")) f.bot = 0;
  return f;
}

async function groups(datasetName, ds, { range, host, dims = [], humans = true, limit = TOP, order }) {
  const sum = ds.sums.has("visits") ? "sum { visits }" : "";
  const dimsQ = dims.length ? `dimensions { ${dims.join(" ")} }` : "";
  const orderBy = order ?? (sum ? "sum_visits_DESC" : "count_DESC");
  const q = `query($acc: string!, $f: ${ds.filterType}) { viewer { accounts(filter: { accountTag: $acc }) {
    g: ${datasetName}(limit: ${limit}, filter: $f, ${dims.length ? `orderBy: [${orderBy}]` : ""}) { count ${sum} ${dimsQ} } } } }`;
  return gql(q, { acc: ACCOUNT_ID, f: filterFor(ds, range, host, humans) })
    .then((d) => d.viewer.accounts[0]?.g ?? []);
}

const visitsOf = (rows) => rows.reduce((s, r) => s + (r.sum?.visits ?? 0), 0);
const viewsOf = (rows) => rows.reduce((s, r) => s + (r.count ?? 0), 0);

// ---------- formatting ----------

const n = (x) => Math.round(x).toLocaleString("en-US");
function change(now, then) {
  if (!then) return now ? "new" : "no change";
  const p = Math.round(((now - then) / then) * 100);
  return p === 0 ? "no change" : `${p > 0 ? "+" : ""}${p}%`;
}
function table(head, rows) {
  if (!rows.length) return "_Nothing recorded._\n";
  return [`| ${head.join(" | ")} |`, `| ${head.map((_, i) => (i ? "---:" : "---")).join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n") + "\n";
}

// ---------- the review ----------

let ACCOUNT_ID = ACCOUNT;

async function main() {
  if (!ACCOUNT_ID) {
    const accounts = await rest("/accounts?per_page=50");
    // A token with only Account Analytics: Read may not be allowed to list accounts. Then the
    // account ID has to come from the CLOUDFLARE_ACCOUNT_ID secret.
    if (!accounts?.length) fail("This token can't list Cloudflare accounts. Add the repository secret CLOUDFLARE_ACCOUNT_ID (the Account ID from the Cloudflare dashboard). See README.md, \"Weekly traffic review\".");
    ACCOUNT_ID = accounts[0].id;
    if (accounts.length > 1) notes.push(`The token can see ${accounts.length} accounts; this review uses "${accounts[0].name}".`);
  }

  PAGES = await dataset("rumPageloadEventsAdaptiveGroups");
  VITALS = await dataset("rumWebVitalsEventsAdaptiveGroups");
  if (!PAGES) fail("Cloudflare's analytics API has no Web Analytics data (rumPageloadEventsAdaptiveGroups) for this token.");
  PAGES.filterType = await filterTypeName("rumPageloadEventsAdaptiveGroups");
  if (VITALS) VITALS.filterType = await filterTypeName("rumWebVitalsEventsAdaptiveGroups");
  if (!PAGES.filters.has("bot")) notes.push("Cloudflare no longer offers a bot filter on this data, so the numbers below include bots.");

  // Every site with traffic this period, humans and everything.
  const hostsAll = await groups("rumPageloadEventsAdaptiveGroups", PAGES, { range: period, dims: ["requestHost"], humans: false, limit: 50 });
  const hostsHuman = await groups("rumPageloadEventsAdaptiveGroups", PAGES, { range: period, dims: ["requestHost"], limit: 50 });
  const hosts = [...new Set([...hostsHuman, ...hostsAll].map((r) => r.dimensions.requestHost))].filter(Boolean);

  const title = `Traffic review: ${period.from} to ${day(shift(todayUTC, -1))}`;
  let md = `# ${title}\n\nHuman visitors only (Cloudflare's bot detection is on), last ${DAYS} full days compared with the ${DAYS} days before. All times UTC.\n\n`;

  // Overview across sites.
  const overview = [];
  for (const h of hosts) {
    const all = hostsAll.find((r) => r.dimensions.requestHost === h);
    const hum = hostsHuman.find((r) => r.dimensions.requestHost === h);
    overview.push([h, n(hum?.sum?.visits ?? 0), n(hum?.count ?? 0), n(all?.count ?? 0)]);
  }
  md += `## All sites\n\n` + table(["Site", "Human visits", "Human page views", "Page views incl. bots"], overview) + "\n";

  for (const h of hosts) md += await siteSection(h);

  if (notes.length) md += `## Notes\n\n${notes.map((x) => `- ${x}`).join("\n")}\n`;
  md += `\n_Made by scripts/traffic-review.mjs from Cloudflare Web Analytics._\n`;

  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  if (!dryRun) await openIssue(title, md);
}

async function filterTypeName(datasetName) {
  const root = (await gql(`{ __schema { queryType { name } } }`)).__schema.queryType.name;
  const viewer = (await fieldsOf(root)).get("viewer");
  const accounts = (await fieldsOf(viewer.type)).get("accounts");
  return (await fieldsOf(accounts.type)).get(datasetName).args.filter;
}

async function safe(label, fn) {
  try {
    return await fn();
  } catch (e) {
    notes.push(`${label}: skipped (${e.message})`);
    return null;
  }
}

async function siteSection(host) {
  const P = "rumPageloadEventsAdaptiveGroups";
  const has = (d) => PAGES.dimensions.has(d);
  let md = `## ${host}\n\n`;

  const now = await groups(P, PAGES, { range: period, host, limit: 1 });
  const prev = await groups(P, PAGES, { range: before, host, limit: 1 });
  const v1 = visitsOf(now), v0 = visitsOf(prev), p1 = viewsOf(now), p0 = viewsOf(prev);
  md += table(["", "This period", "Period before", "Change"], [
    ["Visits", n(v1), n(v0), change(v1, v0)],
    ["Page views", n(p1), n(p0), change(p1, p0)],
    ["Pages per visit", v1 ? (p1 / v1).toFixed(1) : "-", v0 ? (p0 / v0).toFixed(1) : "-", ""],
  ]) + "\n";

  if (has("date")) {
    const rows = await safe(`${host} visits per day`, () => groups(P, PAGES, { range: period, host, dims: ["date"], limit: 100, order: "date_ASC" }));
    if (rows) md += `### Visits per day\n\n` + table(["Day", "Visits", "Page views"], rows.map((r) => [r.dimensions.date, n(r.sum?.visits ?? 0), n(r.count)])) + "\n";
  }

  const tops = [
    ["requestPath", "Top pages", "Page"],
    ["refererHost", "Where visitors came from", "Source"],
    ["countryName", "Countries", "Country"],
    ["deviceType", "Devices", "Device"],
  ];
  for (const [dim, heading, col] of tops) {
    if (!has(dim)) continue;
    const rows = await safe(`${host} ${heading.toLowerCase()}`, () => groups(P, PAGES, { range: period, host, dims: [dim], order: "count_DESC" }));
    if (!rows) continue;
    const label = (v) => (v === "" || v == null ? (dim === "refererHost" ? "(direct or unknown)" : "(unknown)") : String(v).replace(/\|/g, "\\|"));
    md += `### ${heading}\n\n` + table([col, "Page views", "Visits"], rows.map((r) => [label(r.dimensions[dim]), n(r.count), n(r.sum?.visits ?? 0)])) + "\n";
  }

  if (VITALS) md += (await safe(`${host} Core Web Vitals`, () => vitalsSection(host))) ?? "";
  return md;
}

async function vitalsSection(host) {
  const V = "rumWebVitalsEventsAdaptiveGroups";
  const metrics = [
    ["LCP", "Largest Contentful Paint (main content shows)", "largestContentfulPaint", "lcp", (x) => `${(x / 1000).toFixed(2)} s`, (x) => (x <= 2500 ? "Good" : x <= 4000 ? "Needs work" : "Poor")],
    ["INP", "Interaction to Next Paint (reacts to clicks)", "interactionToNextPaint", "inp", (x) => `${Math.round(x)} ms`, (x) => (x <= 200 ? "Good" : x <= 500 ? "Needs work" : "Poor")],
    ["CLS", "Cumulative Layout Shift (page stays still)", "cumulativeLayoutShift", "cls", (x) => x.toFixed(3), (x) => (x <= 0.1 ? "Good" : x <= 0.25 ? "Needs work" : "Poor")],
    ["FCP", "First Contentful Paint (first thing shows)", "firstContentfulPaint", "fcp", (x) => `${(x / 1000).toFixed(2)} s`, (x) => (x <= 1800 ? "Good" : x <= 3000 ? "Needs work" : "Poor")],
  ];
  const q = metrics.map((m) => `${m[2]}P75`).filter((f) => VITALS.quantiles.has(f));
  const s = metrics.flatMap((m) => ["Good", "NeedsImprovement", "Poor", "Total"].map((k) => m[3] + k)).filter((f) => VITALS.sums.has(f));
  if (!q.length && !s.length) return "";
  const query = `query($acc: string!, $f: ${VITALS.filterType}) { viewer { accounts(filter: { accountTag: $acc }) {
    g: ${V}(limit: 1, filter: $f) { count ${q.length ? `quantiles { ${q.join(" ")} }` : ""} ${s.length ? `sum { ${s.join(" ")} }` : ""} } } } }`;
  const row = (await gql(query, { acc: ACCOUNT_ID, f: filterFor(VITALS, period, host) })).viewer.accounts[0]?.g?.[0];
  if (!row || !row.count) return `### Speed (Core Web Vitals)\n\n_No speed measurements from human visitors this period._\n\n`;
  const rows = [];
  for (const [short, name, field, pre, fmt, grade] of metrics) {
    const p75 = row.quantiles?.[`${field}P75`];
    const good = row.sum?.[`${pre}Good`], total = row.sum?.[`${pre}Total`] ?? ((row.sum?.[`${pre}Good`] ?? 0) + (row.sum?.[`${pre}NeedsImprovement`] ?? 0) + (row.sum?.[`${pre}Poor`] ?? 0));
    if (p75 == null && !total) continue;
    rows.push([`${short}: ${name}`, p75 != null ? fmt(p75) : "-", p75 != null ? grade(p75) : "-", total ? `${Math.round((100 * (good ?? 0)) / total)}%` : "-"]);
  }
  return `### Speed (Core Web Vitals)\n\nThe typical slow-end visit (75th percentile), the way Google scores it.\n\n` + table(["Measure", "75% of visits within", "Rating", "Visits rated Good"], rows) + "\n";
}

async function openIssue(title, body) {
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return console.error("No GITHUB_TOKEN/GITHUB_REPOSITORY, so no issue was opened.");
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({ title, body: body.slice(0, 65000), labels: ["traffic-review"] }),
  });
  if (!res.ok) fail(`Could not open the GitHub issue (${res.status}): ${await res.text()}`);
  console.error(`Opened ${(await res.json()).html_url}`);
}

main().catch((e) => fail(e.stack || String(e)));
