# Foundries

A public index of type foundries and their typefaces, with screenshots kept up to date by a crawler that runs in GitHub Actions. There's no AI per screenshot, and it doesn't need anyone's laptop to be awake.

- **Site:** `site/index.html`, one static page that reads `data/data.json` and `shots/…`. No framework, no build step.
- **Source list:** `foundries.yaml`, which you edit.
- **Crawler:** `crawler/` (Node + Playwright). It writes `data/data.json` and `public/shots/`.
- **Automation:** `.github/workflows/crawl.yml` (nightly + weekly), which deploys with `pages.yml`.

## Add a foundry

Edit [`foundries.yaml`](foundries.yaml) on GitHub and add an entry:

```yaml
  - id: grilli            # stable slug; screenshot files are named after it
    name: Grilli Type
    url: https://www.grillitype.com/
    kind: Foundry         # Foundry | Typeface | Library
    tags: [ Swiss ]
    note: optional
    order: 89
```

- **Foundry:** the crawler screenshots the homepage, finds the catalogue and screenshots every font.
- **Typeface:** the page itself is the one font. It appears only in the Fonts list (labelled with its maker from `by`), not as a card in the Foundries list.
- **Library:** homepage screenshot only. Libraries have their own tab on the site.

Name, tag and note edits show up on the site within a minute or two, because the Pages deploy merges the YAML. New entries are crawled on the next nightly run. Removing an entry removes it and its screenshots.

## Force a rescan

Add `rescan: true` to the entry. The next run re-shoots the homepage, rediscovers the catalogue and re-captures every font of that foundry, then deletes the flag from the YAML itself. Changing an entry's `url` triggers the same rescan.

## Overrides

All overrides are optional and go on the foundry entry:

| Field | What it does |
|---|---|
| `skip: true` | Never crawl this entry. It still shows on the page. |
| `catalogUrl` | The page that lists all fonts, when it isn't the homepage or a nav link called Fonts/Typefaces/Shop/… |
| `fontLinkPattern` | A regex every font link must match, e.g. `"/typefaces/[^/]+$"`. Use it when auto-discovery picks the wrong group of links. |
| `exclude` | A list of regexes. Matching links (URL or link text) are ignored. Trials, licences, EULAs, blog posts, gift cards, merch and bundles are already left out. |
| `fonts` | Per-font overrides, keyed by the font's slug (the part after `<id>--` in its id). |

```yaml
    fonts:
      areal: { category: Sans }
      diatype: { category: Sans, styles: 46 }
      some-bundle: { skip: true }
      odd-slug: { name: "Proper Name", variable: true, free: false }
```

A manual `category` always wins over the crawler's guess. Categories are Sans, Serif, Slab, Mono, Display and Script.

## How capture works

- **Browser:** headless Chromium at 1440×900 with `deviceScaleFactor: 2`. Each shot is saved as `<name>.webp` (1600×1000, q82) plus `<name>.thumb.webp` (800×500) for the grid.
- **Before every shot:** cookie and consent banners are hidden with CSS (never accepted), animations are finished, muted videos are started, the script waits for `document.fonts.ready`, then waits a further 1.5 s.
- **Font pages:** the type snippet scrolls to the largest visible text made of real words. Then a quality check looks for:
  - text of 48px or larger in view;
  - no image, video or canvas covering the centre of the screen;
  - a non-generic `font-family`.
- **If the check fails:** the crawler scrolls 650px and retries, up to 3 times, then tries a type-tester field. It keeps the best attempt and marks it `quality: "low"`.
- **Discovery:** same-site links are grouped by parent path, and the crawler picks the group whose path looks like `font|type|famil|product|collection|catalog|retail` with the most links.
- **Politeness:** 4 foundries in parallel, at most one page load every ~2 s per domain, a real user agent and 2 retries. Sites that block bots are marked `scan: "failed"` with the reason and shown as a name tile. They're retried after 7 days.
- **Categorising:**
  - Rules read the font's name, the catalogue card, the page headings and, only if those say nothing, the body text.
  - A Claude Haiku fallback exists but is off. To turn it on, add the `ANTHROPIC_API_KEY` secret and set the repository variable `FOUNDRIES_HAIKU=1`.

## Run locally

```bash
npm install
npx playwright install chromium
node crawler/crawl.mjs --only klim --limit 5     # test on one foundry
npm run serve                                    # preview at http://localhost:4173
```

Crawler flags:

| Flag | |
|---|---|
| *(none)* | The nightly run: homepages + discovery + capture of whatever is pending |
| `--homepages` / `--discover` / `--capture` | Run only those phases |
| `--release-check` | Re-run discovery on every catalogue. New links get `newSince` and the foundry gets `newReleases`, and `release-report.md` is written |
| `--limit N` | Cap each phase at N items |
| `--only a,b` | Only these foundry ids (a prefix works too: `--only klim`) |
| `--max-minutes M` | Stop starting new work after M minutes |

The crawler saves `data/data.json` every 25 items, so an interrupted run keeps its progress. Each run only does pending work:
- new foundries;
- queued fonts;
- failed items last tried more than 7 days ago.

## Schedule

GitHub cron runs in UTC with no daylight saving, so the Israel times drift by an hour in summer.

| Run | Cron (UTC) | Israel time |
|---|---|---|
| Nightly, 150 fonts | `17 0 * * *` | 02:17 winter / 03:17 summer |
| Weekly release check + capture | `13 19 * * 0` | Sunday 21:13 winter / 22:13 summer |

Each run commits `data/` and `public/shots/` only when something changed, then redeploys Pages. The release check opens a GitHub issue listing new releases. Run either one by hand from **Actions → Crawl → Run workflow**.

## One-time setup

1. Create a public repo and push this folder to it.
2. Go to **Settings → Pages → Source** and pick **GitHub Actions**.
3. Go to **Settings → Actions → General → Workflow permissions** and pick **Read and write**.
4. Run **Actions → Crawl** once by hand.

### Shops (Gumroad and similar)

On Gumroad the font only exists as artwork in the product's cover image (the page's live text is Gumroad's own UI font), so Gumroad fonts are captured from the cover image itself, downloaded at full size and fitted to 16:10. Products whose page never mentions fonts (templates, icon sets, mockups) are marked `scan: "excluded"` and hidden. For another shop that works the same way, add `capture: image` to its entry; `capture: page` forces a normal page screenshot.

### Google Fonts

The `google-fonts` entry has `source: google-fonts` and `limit: 50`: instead of crawling a website, the crawler reads Google's public font metadata, takes the 50 most popular families, and renders each one as its own specimen page via the Google Fonts CSS API (family name large, then a sample line in its lightest, regular and heaviest weights; fonts for Japanese, Korean, Chinese, Arabic, Hebrew, Thai and so on use their own script). Category, number of styles and variable come straight from Google's metadata, and every Google font is free. Change `limit` in `foundries.yaml` to include more or fewer: families that drop out of the list are removed with their screenshots on the next run. Add `includeNew: true` to also include every family Google added in the last 30 days (marked New).

To add specific Google families regardless of popularity, list them under `include:` on the same entry (exact Google Fonts names, e.g. `- Instrument Serif`); they're added on the next run and stay even when they're not in the top 50. Unknown names are reported in the crawl log.

### Fontshare

The `fontshare` entry has `source: fontshare`: the crawler reads Fontshare's public API (`api.fontshare.com/v2/fonts`) and lists its **whole catalogue** (100 families), rendered as specimens through Fontshare's CSS API, the same way as Google Fonts. All Fontshare fonts are free (`price: free`). New Fontshare families are added by the weekly check.

## Prices

Each font can show a **basic price per weight**: the price of one style with the smallest desktop licence. Foundries publish prices in too many different ways to scrape reliably, so prices are set by hand in `foundries.yaml`:

```yaml
  - id: grilli
    price: 80 USD          # applies to every font from this foundry
    fonts:
      gt-maru: { price: 60 USD }   # per-font override
  - id: google-fonts
    price: free
```

Formats: `60 USD`, `€45`, `75 NZD`, `free`. The card shows the foundry's own currency ("€45 / weight"); a rough USD conversion is only used for the "Price, low to high" sort. Fonts without a price just don't show one. `node scripts/price-evidence.mjs` scans foundry pages for clear "per style / styles from" statements to help fill this in.

## Personality

The Fonts view has four **personality** sliders: Calm ↔ Loud, Serious ↔ Playful, Classic ↔ Futuristic, Clean ↔ Rough. Each font gets a 0–100 score on each, from Claude Haiku looking at the font's screenshot once (`crawler/personality.mjs`); fonts are re-rated only when their screenshot changes. This runs in the nightly workflow when the repository has an `ANTHROPIC_API_KEY` secret (Settings → Secrets and variables → Actions); without it the step skips itself and the sliders stay hidden. Rating the whole index costs roughly a dollar; after that only new fonts are rated. Locally: `ANTHROPIC_API_KEY=… node crawler/crawl.mjs --personality`.

## Votes

Each font card has an upvote button (one vote per browser per font, click again to undo) and the Fonts view gets a **Most voted** sort. Votes are stored in a free [Supabase](https://supabase.com) project, because GitHub Pages can't store anything:

1. Create a free Supabase project.
2. In **SQL Editor**, paste [`supabase/votes.sql`](supabase/votes.sql) and run it. This creates the `votes` table, the public `vote_counts` totals, and `vote()`/`unvote()` functions. Visitors can only call those and read totals.
3. In **Project Settings → API**, copy the **Project URL** and the **anon public** key, and paste them into `const VOTES = { url: "", key: "" }` near the top of the script in `site/index.html`. The anon key is designed to be public.

While `VOTES` is empty, the vote buttons and the sort stay hidden.
