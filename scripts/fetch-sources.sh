#!/usr/bin/env bash
# Downloads the raw source files into data/raw/: the latest BLS OEWS national file and the
# task-level files from the Anthropic Economic Index on Hugging Face. Runs on GitHub Actions.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/raw
UA="Mozilla/5.0 (compatible; jobexposureindex.com; report@jobexposureindex.com)"

# BLS OEWS national estimates: try the newest release first.
year=$(date -u +%y)
for y in $year $((10#$year - 1)) $((10#$year - 2)); do
  y=$(printf "%02d" "$y")
  if curl -sSfL --retry 3 -A "$UA" -o /tmp/oesm.zip "https://www.bls.gov/oes/special-requests/oesm${y}nat.zip"; then
    echo "BLS OEWS May 20$y"
    rm -rf /tmp/oesm && mkdir /tmp/oesm && unzip -q /tmp/oesm.zip -d /tmp/oesm
    f=$(find /tmp/oesm -iname 'national_M20*_dl.xlsx' | head -1)
    python3 -c "
import sys, pandas as pd
df = pd.read_excel(sys.argv[1], dtype=str)
df.columns = [c.upper() for c in df.columns]
df.to_csv('data/raw/bls_oews_national.csv', index=False)
open('data/raw/bls_oews_release.txt','w').write('May 20' + sys.argv[2] + '\n')
" "$f" "$y"
    break
  fi
done

# Anthropic Economic Index: list every file, keep the small CSVs that map to O*NET tasks.
HF=https://huggingface.co/api/datasets/Anthropic/EconomicIndex/tree/main
curl -sSfL --retry 3 "$HF?recursive=true" -o data/raw/aei_tree.json
curl -sSfL --retry 3 -o data/raw/aei_README.md https://huggingface.co/datasets/Anthropic/EconomicIndex/resolve/main/README.md || true
python3 - <<'PY'
import json, subprocess, os
tree = json.load(open('data/raw/aei_tree.json'))
os.makedirs('data/raw/aei', exist_ok=True)
for f in tree:
    p = f.get('path', '')
    if f.get('type') != 'file' or not p.endswith('.csv'): continue
    if f.get('size', 0) > 40_000_000: continue
    if not any(k in p.lower() for k in ('task', 'onet', 'occupation', 'soc')): continue
    out = 'data/raw/aei/' + p.replace('/', '__')
    subprocess.run(['curl', '-sSfL', '--retry', '3', '-o', out,
                    'https://huggingface.co/datasets/Anthropic/EconomicIndex/resolve/main/' + p], check=True)
    print('AEI', p, f.get('size'))
PY
ls -la data/raw data/raw/aei
