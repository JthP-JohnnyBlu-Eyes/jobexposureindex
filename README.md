# jobexposureindex.com

Website for jobexposureindex.com: a free index of how exposed US jobs are to AI, built on public O*NET and BLS data, with a weekly email report and automated posts to X, Bluesky and LinkedIn.

The site is plain static HTML. `public/index.html` is the launch page. Cloudflare Workers serves the `public` folder as static assets, and `wrangler.jsonc` attaches jobexposureindex.com and www.jobexposureindex.com to the Worker as custom domains, so Cloudflare creates their DNS records on deploy. The Worker redirects www to the bare domain.

## Setup

1. **Kit form.** Both signup boxes post to Kit form 10103045. To use another form, change that number in `public/index.html` (two places).
2. **Deploy.** In Cloudflare, go to Workers & Pages, Create, Import a repository, and pick this repo. Every push to `main` then deploys.
3. **Email.** Turn on Cloudflare Email Routing for the domain and forward `report@jobexposureindex.com` to your inbox. The privacy and terms pages use that address.

## The index

`scripts/build-index.mjs` builds every page under `public/jobs/`, `public/method.html`, `public/data/jobs.json`, the sitemap and the homepage top 10 from the files in `data/`:

- `occ_level.csv`: occupation-level exposure scores (the score is `dv_rating_beta` × 100) and `tasks.tsv`: task-level ratings, both from [GPTs are GPTs](https://github.com/openai/GPTs-are-GPTs) (MIT, see `data/LICENSE-GPTs-are-GPTs.txt`), built on O*NET tasks (CC BY 4.0).
- `bls_oews_may2021.csv`: US employment and median pay from BLS OEWS, May 2021.

After changing data or templates, run `node scripts/build-index.mjs` and commit the output.
