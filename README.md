# jobexposureindex.com

Website for jobexposureindex.com: a free index of how exposed US jobs are to AI, built on public O*NET and BLS data, with a weekly email report and automated posts to X, Bluesky and LinkedIn.

The site is plain static HTML. `public/index.html` is the launch page. Cloudflare Workers serves the `public` folder as static assets, and `wrangler.jsonc` routes every path on jobexposureindex.com and www.jobexposureindex.com to the Worker, which redirects www to the bare domain.

## Setup

1. **Kit form.** Both signup boxes post to Kit form 10103045. To use another form, change that number in `public/index.html` (two places).
2. **Deploy.** In Cloudflare, go to Workers & Pages, Create, Import a repository, and pick this repo. Every push to `main` then deploys.
3. **Email.** Turn on Cloudflare Email Routing for the domain and forward `report@jobexposureindex.com` to your inbox. The privacy and terms pages use that address.
