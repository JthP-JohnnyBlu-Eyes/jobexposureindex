"""Summarises the newest Anthropic Economic Index release into two small files in data/:

  aei_tasks.csv        O*NET tasks seen in Claude usage, with their share of usage
  aei_occupations.csv  SOC occupations, with their share of usage
  aei_release.txt      release name and the period it covers

The raw release files are hundreds of MB, so they are streamed from Hugging Face and
never committed. Runs on GitHub Actions; see .github/workflows/refresh-data.yml.
"""
import json, re, subprocess, sys
import pandas as pd

BASE = "https://huggingface.co/datasets/Anthropic/EconomicIndex/resolve/main/"
tree = json.load(open("data/raw/aei_tree.json"))

# Newest release whose files use the monthly schema (aei_<source>_<date>.csv).
files = [f["path"] for f in tree if f.get("type") == "file"]
pat = re.compile(r"^(release_\d{4}_\d{2}_\d{2})/data/aei_(claude_ai|1p_api)_[\d-]+\.csv$")
releases = {}
for p in files:
    m = pat.match(p)
    if m:
        releases.setdefault(m.group(1), {})[m.group(2)] = p
if not releases:
    sys.exit("No Economic Index release in the expected format")
release = max(releases)
print("Using", release, releases[release])

tasks, occs, period = [], [], set()
for source, path in sorted(releases[release].items()):
    local = f"/tmp/{source}.csv"
    subprocess.run(["curl", "-sSfL", "--retry", "3", "-o", local, BASE + path], check=True)
    cols = ["date_start", "date_end", "geo_id", "category_name", "hierarchy_level", "metric_id", "value", "node_name", "node_external_id"]
    for chunk in pd.read_csv(local, usecols=cols, dtype=str, chunksize=500_000):
        g = chunk[(chunk.geo_id == "GLOBAL") & (chunk.hierarchy_level == "0")]
        period.update(zip(g.date_start, g.date_end))
        t = g[(g.category_name == "onet") & g.metric_id.isin(["pct", "collaboration_bucket_automation_pct"])]
        tasks.append(t.assign(source=source))
        o = g[(g.category_name == "soc_occupation") & (g.metric_id == "pct")]
        occs.append(o.assign(source=source))

def wide(frames, index):
    df = pd.concat(frames)
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df["col"] = df.source + ":" + df.metric_id
    # Monthly rows: average across the months in the release.
    return df.pivot_table(index=index, columns="col", values="value", aggfunc="mean").reset_index()

wide(tasks, ["node_external_id", "node_name"]).to_csv("data/aei_tasks.csv", index=False, float_format="%.4f")
wide(occs, ["node_external_id", "node_name"]).to_csv("data/aei_occupations.csv", index=False, float_format="%.4f")
start = min(s for s, _ in period); end = max(e for _, e in period)
open("data/aei_release.txt", "w").write(f"{release}\n{start}\n{end}\n")
print("Period", start, end)
