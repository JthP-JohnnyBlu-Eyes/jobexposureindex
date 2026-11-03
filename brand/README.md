# Brand kit

Logos, profile images and banners for every social account, in the launch page's look: paper background `#F6F3EC`, ink `#14171C`, the four exposure colours, Space Grotesk headlines, Inter body text and JetBrains Mono labels.

Each platform folder holds the files to upload there, already at that platform's size. Banners keep the text inside the area the platform never covers or crops, so the profile photo, mobile crop and TV crop all leave it alone.

## Logo

The mark is the site's favicon: four rising bars from low exposure (teal) to high exposure (red) on an ink tile.

| File | Use |
| --- | --- |
| `logo/mark.svg` | Primary mark, ink tile. Favicon, app icon, anywhere small. |
| `logo/mark-paper.svg` | Paper tile, for dark backgrounds. |
| `logo/mark-bars.svg` | Bars only, no tile. |
| `logo/mark-mono-ink.svg`, `logo/mark-mono-white.svg` | One-colour bars, for print or embossing. |
| `logo/logo-horizontal.svg` | Mark with the two-line name, as in the site header. The default logo. |
| `logo/logo-inline.svg` | Mark with the name on one line, for tight horizontal spaces. |
| `logo/logo-stacked.svg` | Mark above the name, for square spaces. |
| `*-white.svg` | The same lockups for dark backgrounds (white name, paper tile). |
| `logo/png/` | PNG exports of the above with transparent backgrounds. |

The name is outlined in the SVGs, so they look right without the font installed. Leave clear space around the logo of at least half the mark's height, and don't recolour the bars: their order is the exposure scale.

## Profiles and banners

The profile image is the bars on ink (`profile/profile-dark-1080.png`). They sit inside the middle of the square, so circle crops don't clip them. `profile/profile-paper-1080.png` is a light alternative.

| Platform | Profile image | Banner and other files |
| --- | --- | --- |
| X | `x/profile-400.png` | `x/header-1500x500.png` |
| Bluesky | `bluesky/avatar-1000.png` | `bluesky/banner-3000x1000.png` |
| LinkedIn page | `linkedin/company-logo-400.png` | `linkedin/company-cover-1128x191.png` |
| LinkedIn profile | | `linkedin/personal-banner-1584x396.png` |
| Facebook | `facebook/profile-720.png` | `facebook/cover-1640x624.png` |
| Instagram | `instagram/profile-1080.png` | `instagram/post-1080x1350.png` (launch post), `instagram/story-1080x1920.png` |
| Threads | `threads/profile-1080.png` | |
| TikTok | `tiktok/profile-1080.png` | |
| YouTube | `youtube/profile-800.png` | `youtube/banner-2560x1440.png`, `youtube/watermark-150.png` (video watermark) |
| Pinterest | `pinterest/profile-1080.png` | `pinterest/pin-1000x1500.png` |
| Reddit | `reddit/avatar-256.png` | `reddit/banner-1920x384.png` |
| Mastodon | `mastodon/avatar-400.png` | `mastodon/header-1500x500.png` |
| Newsletter (Kit) | | `newsletter/email-header-1200x300.png` (ink), `newsletter/email-header-paper-1200x300.png`, `newsletter/email-signature-600.png` (show at 200 px wide) |

The site's link preview image stays at `public/og.png`.

## Rebuilding

Change the logo or wording in the scripts in `tools/`, then rebuild:

```sh
pip install fonttools uharfbuzz
curl -L -o /tmp/SpaceGrotesk-Bold.ttf https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj4PVksj.ttf
python3 brand/tools/build_logos.py /tmp/SpaceGrotesk-Bold.ttf   # SVG logos
node brand/tools/render.mjs                                       # every PNG (needs Playwright with Chromium)
```

`render.mjs` lists every file with its size and the safe area its text has to stay inside, so a new platform is one more line in its `ASSETS` list.
