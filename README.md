# jobexposureindex.com

Website for jobexposureindex.com: a free index of how exposed US jobs are to AI, built on public O*NET and BLS data, with a weekly email report and automated posts to X, Bluesky and LinkedIn.

The site is plain static HTML. `public/index.html` is the launch page. Cloudflare Workers serves the `public` folder as static assets, and `wrangler.jsonc` attaches jobexposureindex.com and www.jobexposureindex.com to the Worker as custom domains, so Cloudflare creates their DNS records on deploy. The Worker redirects www to the bare domain.

## Setup

1. **Kit form.** Both signup boxes post to Kit form 10103045. To use another form, change that number in `public/index.html` (two places).
2. **Deploy.** In Cloudflare, go to Workers & Pages, Create, Import a repository, and pick this repo. Every push to `main` then deploys.
3. **Email.** Turn on Cloudflare Email Routing for the domain and forward `report@jobexposureindex.com` to your inbox. The privacy and terms pages use that address.

## The index

`scripts/build-index.mjs` builds every page under `public/jobs/`, `public/method.html`, `public/data/jobs.json`, the sitemap and the homepage top 10 from the files in `data/`:

- `occ_level.csv` (exposure scores: `dv_rating_beta` × 100) and `tasks.tsv` (task ratings), from [GPTs are GPTs](https://github.com/openai/GPTs-are-GPTs) (MIT, see `data/LICENSE-GPTs-are-GPTs.txt`), built on O*NET tasks (CC BY 4.0).
- `aei_tasks.csv`, `aei_occupations.csv`, `aei_release.txt`: O*NET tasks seen in real Claude usage, summarised from the newest [Anthropic Economic Index](https://huggingface.co/datasets/Anthropic/EconomicIndex) release (CC BY) by `scripts/process-aei.py`.
- `raw/bls_oews_national.csv`: US employment and median pay from the latest BLS OEWS release, fetched by `scripts/fetch-sources.sh`.

`.github/workflows/refresh-data.yml` runs every Monday (or by hand from the Actions tab): it fetches the sources, rebuilds the pages and commits when anything changed, and Cloudflare deploys the push.

Share cards (`public/cards/<slug>.jpg`, the link preview for each job page) are drawn by `scripts/build-cards.mjs` with Playwright. It only redraws cards whose score changed, so run it after the index build whenever scores change.

To rebuild locally after changing templates: `node scripts/build-index.mjs`, then commit the output.
