// Schedules today's "job of the day" post on X, Bluesky and LinkedIn through Buffer.
// Runs every day on GitHub Actions (.github/workflows/social.yml) with the BUFFER_API_KEY secret.
//
//   node scripts/post-daily.mjs                 schedule today's post for 14:00 UTC
//   node scripts/post-daily.mjs --dry-run       print the texts, send nothing
//   node scripts/post-daily.mjs --date 2026-11-02 --dry-run
//   node scripts/post-daily.mjs --soon          schedule for 15 minutes from now (for testing)
//
// Each day is recorded in data/social/log.json, so a day is never posted twice.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const SITE = "https://jobexposureindex.com";
const API = "https://api.buffer.com";
const POST_HOUR_UTC = 14; // 10:00 in New York, 15:00 in Amsterdam (winter)
const START = Date.UTC(2026, 9, 28); // first day of the rotation
const MIN_WORKERS = 20000; // post about jobs enough people actually do

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const soon = args.includes("--soon");
const dateArg = args.includes("--date") ? args[args.indexOf("--date") + 1] : null;
const today = dateArg ?? new Date().toISOString().slice(0, 10);

const { total, period, jobs } = JSON.parse(readFileSync(ROOT + "data/social-jobs.json", "utf8"));

// ---------- pick the job ----------

// Stable shuffle: order eligible jobs by a hash of their slug, then walk the list one per day.
function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}
const pool = jobs.filter((j) => j.emp >= MIN_WORKERS).sort((a, b) => hash(a.slug) - hash(b.slug) || a.slug.localeCompare(b.slug));
const day = Math.floor((Date.parse(today + "T00:00:00Z") - START) / 86400000);
const job = pool[((day % pool.length) + pool.length) % pool.length];

// ---------- write the texts ----------

const url = `${SITE}/jobs/${job.slug}`;
const card = `${SITE}/cards/${job.slug}.jpg`;
const lower = job.title.toLowerCase();
const fmt = (n) => n.toLocaleString("en-US");
const hooks = [
  `Will AI replace ${lower}?`,
  `How exposed are ${lower} to AI?`,
  `Job of the day: ${job.title}`,
  `${job.title}: how much of the job can AI already do?`,
];
const hook = hooks[((day % hooks.length) + hooks.length) % hooks.length];
const useLine = `${job.inUse} of ${job.tasks} tasks already show up in real AI use`;

// X counts every link as 23 characters, whatever its length.
function xText() {
  const variants = [
    [hook, "", `AI exposure score: ${job.score}/100 (${job.band.toLowerCase()})`, `#${job.rank} of ${total} US jobs`, useLine, "", url],
    [hook, "", `AI exposure score: ${job.score}/100 (${job.band.toLowerCase()})`, `#${job.rank} of ${total} US jobs`, "", url],
    [`Job of the day: ${job.title}`, "", `AI exposure: ${job.score}/100`, "", url],
  ];
  for (const v of variants) {
    const t = v.join("\n");
    if (t.length - url.length + 23 <= 280) return t;
  }
  return `AI exposure ${job.score}/100 ${url}`;
}

// Bluesky allows 300 characters; the link travels as a card, so the text needs no URL.
function blueskyText(withUrl) {
  const tail = withUrl ? `\n\n${url}` : "";
  const variants = [
    [hook, "", `AI exposure score: ${job.score}/100 (${job.band.toLowerCase()}), #${job.rank} of ${total} US jobs.`, `${useLine}.`],
    [hook, "", `AI exposure score: ${job.score}/100, #${job.rank} of ${total} US jobs.`],
  ];
  for (const v of variants) {
    const t = v.join("\n") + tail;
    if ([...t].length <= 300) return t;
  }
  return `Job of the day: AI exposure ${job.score}/100${tail}`;
}

function linkedinText(withUrl) {
  const lines = [
    hook,
    "",
    `${job.title} score ${job.score}/100 on the Job Exposure Index (${job.band.toLowerCase()} exposure), #${job.rank} of ${total} US occupations.`,
    "",
  ];
  if (job.exposedTask) lines.push(`• Most exposed task: "${job.exposedTask}"`);
  if (job.safeTask) lines.push(`• Hardest for AI: "${job.safeTask}"`);
  lines.push(`• ${useLine} (Anthropic Economic Index, ${period})`);
  if (job.emp) lines.push(`• ${fmt(job.emp)} people do this job in the US${job.pay ? `, median pay $${fmt(job.pay)}` : ""}`);
  lines.push("", "Exposure means the work is likely to change, not that the job will disappear.", "", "Do you work in this field? What has AI changed for you so far?");
  if (withUrl) lines.push("", `Full breakdown: ${url}`);
  lines.push("", "#AI #FutureOfWork #Careers");
  return lines.join("\n");
}

const linkCard = {
  url,
  title: `Will AI replace ${lower}? AI exposure ${job.score}/100`,
  description: `See which ${lower} tasks AI can and can't do.`,
  thumbnail: { url: card },
};

// Each service gets a rich post first, and a plain-text fallback if Buffer rejects it.
const plans = {
  twitter: [
    { text: xText(), assets: [{ image: { url: card } }] },
    { text: xText() },
  ],
  bluesky: [
    { text: blueskyText(false), metadata: { bluesky: { linkAttachment: linkCard } } },
    { text: blueskyText(true) },
  ],
  linkedin: [
    { text: linkedinText(false), metadata: { linkedin: { linkAttachment: linkCard } } },
    { text: linkedinText(true) },
  ],
};

// ---------- send ----------

const now = Date.now();
let dueAt = new Date(Date.parse(today + "T00:00:00Z") + POST_HOUR_UTC * 3600000);
if (soon || dueAt.getTime() < now + 10 * 60000) dueAt = new Date(now + 15 * 60000);

console.log(`Day ${day}: ${job.title} (${job.score}/100), due ${dueAt.toISOString()}\n`);
for (const [service, [rich]] of Object.entries(plans)) console.log(`--- ${service} ---\n${rich.text}\n`);
if (dryRun) process.exit(0);

const logFile = ROOT + "data/social/log.json";
mkdirSync(ROOT + "data/social", { recursive: true });
const log = existsSync(logFile) ? JSON.parse(readFileSync(logFile, "utf8")) : {};
const done = log[today]?.results ?? {};
const todo = Object.keys(plans).filter((s) => !done[s]?.id);
if (!todo.length) { console.log(`Already posted for ${today}`); process.exit(0); }

const key = process.env.BUFFER_API_KEY;
if (!key) { console.error("BUFFER_API_KEY is not set"); process.exit(1); }

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) throw new Error(`Buffer HTTP ${res.status}: ${JSON.stringify(body.errors ?? body).slice(0, 400)}`);
  return body.data;
}

const channels = {};
const orgs = await gql(`query { account { organizations { id } } }`);
for (const org of orgs.account.organizations) {
  const data = await gql(`query ($id: OrganizationId!) { channels(input: { organizationId: $id }) { id service } }`, { id: org.id });
  for (const ch of data.channels.flat()) channels[String(ch.service).toLowerCase()] = ch.id;
}
if (channels.x && !channels.twitter) channels.twitter = channels.x;
console.log("Connected:", Object.keys(channels).join(", ") || "none");

const results = { ...done };
for (const service of todo) {
  if (!channels[service]) { results[service] = { error: "channel not connected" }; continue; }
  for (const [i, plan] of plans[service].entries()) {
    try {
      const data = await gql(
        `mutation ($input: CreatePostInput!) {
          createPost(input: $input) {
            ... on PostActionSuccess { post { id dueAt } }
            ... on MutationError { message }
          }
        }`,
        { input: { channelId: channels[service], schedulingType: "automatic", mode: "customScheduled", dueAt: dueAt.toISOString(), ...plan } },
      );
      if (data.createPost?.message) throw new Error(data.createPost.message);
      results[service] = { id: data.createPost.post.id, dueAt: data.createPost.post.dueAt, ...(i ? { fallback: true } : {}) };
      console.log(`${service}: scheduled ${results[service].id}${i ? " (plain-text fallback)" : ""}`);
      break;
    } catch (e) {
      console.log(`${service}: attempt ${i + 1} failed: ${e.message}`);
      results[service] = { error: e.message };
    }
  }
}

log[today] = { job: job.slug, dueAt: dueAt.toISOString(), results };
writeFileSync(logFile, JSON.stringify(log, null, 1) + "\n");
const failed = Object.entries(results).filter(([, r]) => !r.id);
if (failed.length) { console.error("Not scheduled:", failed.map(([s, r]) => `${s} (${r.error})`).join("; ")); process.exitCode = 1; }
