# Handoff — Found rizz (type & foundry index)

Written 2026-11-24 when the owner moved Claude accounts. Read this together with `README.md`, which documents how to run and configure everything.

- **Repo:** https://github.com/adam89asseraf-lab/foundries (public)
- **Live site:** https://adam89asseraf-lab.github.io/foundries/ (GitHub Pages)
- **Branches:**
  - `main`: everything that is live.
  - `uniform-specimens`: unfinished work, see "In progress" below.
- **Design:** Figma file `7J30UXQ9UxdziRxxmPCWOT` (GUTS team). It has the Components section and the Fonts desktop, Fonts mobile and Foundries desktop screens.
- **Votes database:** Supabase project `lulglxebjchreghaexjd` (https://lulglxebjchreghaexjd.supabase.co, Tokyo, free plan).

## What we built

- **Site** (`site/index.html`): a single static file with no framework.
  - **Three tabs:** Fonts, Foundries and Libraries.
  - **Fonts tab:**
    - filters: search, a foundry dropdown, category chips, a "styles" slider and a price-per-weight range slider;
    - personality sliders, which stay hidden until fonts have mood scores;
    - sorts, including "Most voted";
    - endless scroll;
    - an upvote (heart) button on every card.
  - **Title:** "Found rizz" cycles through 9 typefaces every 800ms. Each face is scaled to the same x-height and shifted onto the same baseline, both measured at runtime.
  - **Design tokens:** these follow the Figma file.
- **Data:** `foundries.yaml` (hand-edited source list) → crawler → `data/data.json` (one record per line) and `public/shots/` (WebP screenshots plus thumbnails). The Pages build (`scripts/build-site.mjs`) merges the YAML into the data at deploy time, so name, tag and price edits go live without a crawl.
- **Crawler** (`crawler/crawl.mjs`, Node + Playwright): homepages → catalogue discovery → per-font capture → personality. Per-foundry YAML options:
  - `catalogUrl`
  - `fontLinkPattern`
  - `fontUrls`: a hand-written list; `#anchor` URLs are shot at that section of the page
  - `exclude`
  - `fonts` (per-font overrides)
  - `capture: image | page | top`
  - `source: google-fonts | fontshare`
  - `paginate`
  - `nameStrip`
  - `price`
  - `rescan: true`
- **Automation** (`.github/workflows/crawl.yml` plus `pages.yml`):
  - The crawl runs nightly at 00:17 UTC and does a weekly release check on Sundays at 19:13 UTC.
  - It commits `data/`, `foundries.yaml` and `public/shots/`, then redeploys Pages.
  - The weekly check opens a GitHub issue listing new releases.
- **Votes:** Supabase. The SQL is in `supabase/votes.sql`.
  - Votes are anonymous: one per browser per font, keyed by a random UUID kept in localStorage.
  - Visitors can only call the `vote()` and `unvote()` functions and read the `vote_counts` view. The table itself is locked by row-level security.
  - The public anon key is embedded in `site/index.html` (`const VOTES`). That is intended: the key is designed to be public.
- **Coverage:** 89 entries (foundries, libraries and typefaces) and 2,185 fonts. Every foundry has at least one font, and about 97% of fonts have a category.

## Decisions and why

- **GitHub Pages and a public repo:** free hosting and free Actions minutes, with no server to run.
- **Rules for categories, not an LLM:** they're cheaper and deterministic. The Haiku fallback exists but is off.
  - About 650 categories were assigned by eye from contact sheets and written straight into `data.json`. Recaptures keep an existing category.
- **Prices set by hand in the YAML** ("basic price per weight"): scraping prices was unreliable. When a foundry has a clear pattern, one foundry-wide price is used instead of checking every font.
- **Personality sliders** use Claude Haiku (`claude-haiku-5-5`) rating each screenshot. They need an `ANTHROPIC_API_KEY` Actions secret, which **has not been added yet**, so the sliders stay hidden.
- **Google Fonts:** a curated set (`limit: 50` plus an `include:` list) instead of the whole catalogue. **Fontshare:** the full catalogue. Both are rendered as our own specimen pages.
- **Single typefaces** (`kind: Typeface`) appear only in the Fonts list. Libraries have their own tab.
- **Gumroad and Future Fonts** are captured from the product cover image, because the font only exists as artwork there.

## In progress: uniform specimens (branch `uniform-specimens`)

**Goal:** every font card shows the same background (#ededea), the same ink (#121214) and the same words: "Hamburgefonts" plus "The quick brown fox jumps over the lazy dog 0123". Hebrew fonts show Hebrew.

**How it works** (`crawler/uniform.mjs`), on the font's own page, without downloading any font file:
1. `detectFace` finds the product's webfont. It prefers a family named like the font and skips the site's own interface fonts.
2. `renderUniform` draws the sample full-screen in that face, at regular weight and upright style, with faking disabled.
3. `fallbackGlyphs` asks Chrome over the DevTools protocol (`CSS.getPlatformFontsForNode`) whether any glyph came from a fallback font. Only a fully covered sample is saved; otherwise the old screenshot stays.

**Status:**
- **The pilot works:** `scripts/uniform-pilot.mjs` writes to a temp folder. 24 of 24 tuned samples came out right, and about 25 of 32 random fonts. The failures are image-only fonts or links that aren't fonts.
- **The crawler phase is written but not yet run or tested:** `--uniform` in `crawl.mjs`, which also runs by default in the nightly crawl. **Test it before merging to `main`**, because merging makes the next nightly crawl re-shoot about 2,000 fonts. To test:
  ```bash
  node crawler/crawl.mjs --uniform --only klim --limit 5
  ```
  Then look at `public/shots/fonts/klim--*.thumb.webp`, or run `node scripts/contact-sheet.mjs <dir>` on a folder of thumbnails.
- **Before rolling out:**
  - Skip the two non-font entries, `limitype--all` and `booton--buy`. In `foundries.yaml`, use `fonts: { all: { skip: true } }` under limitype and `fonts: { buy: { skip: true } }` under booton.
  - Check `lift--spinelo`, which shows a thin white strip at the bottom of its specimen.
  - Run the full pass locally in the background:
    ```bash
    node crawler/crawl.mjs --uniform --max-minutes 240
    ```
  - Then commit the shots and data.
  - Maybe add a separate `--uniform --max-minutes N` step to `crawl.yml` instead of relying on the default phase list.

## Other open items

- **`ANTHROPIC_API_KEY`:** add it under GitHub Settings → Secrets → Actions to turn on the personality sliders and auto-categorise new fonts.
- **205TF:** 8 of its 62 font pages return HTTP 404 to the crawler, including Album, Garaje and Zénith.
- **Unpriced foundries** (no `price:` in the YAML): Weltkern, Nouvelle Noire, Bad Type Club, CoType, Lift, General Type, Edito, Formerly Known, Studio Feixen, Sociotype, Zetafonts, OH no, SilverStag, Superior, Studio Few, a.Foundry, Power, Dirtyline and the Gumroad sellers.
  - Weltkern only shows prices after a company-size form. Don't submit forms on foundry sites.
- **72 fonts without a category:** mostly fonts with no screenshot yet.
- **Figma:** the masthead on the Figma screens still says "Found it!" while the site says "Found rizz". The Font card component has the foundry name underlined, but the screens and the site don't.

## Gotchas

- **Concurrent writes to `data.json`:** the nightly Action commits `data/data.json`. Always `git pull --rebase` before pushing, and never run two crawls at once.
- **Rescans:**
  - `rescan: true` in the YAML is cleared automatically after the run.
  - A rescan also clears a previous discovery failure.
  - Changing an entry's `url` triggers a rescan.
- **Pages deploys:** they sometimes fail with "No artifacts", and `pages.yml` retries once. A data-only change goes live 1–3 minutes after the push.
- **Supabase free plan:** projects pause after about a week without traffic. If votes stop working, resume the project from the Supabase dashboard.
- **Font naming in cover mode:** the crawler renames a font from the page title, except generic titles like "Notes" or "Shop". Use the `nameStrip` and `fontUrls` names when a site's titles are noisy.
- **Local preview:** `npm run serve`, then open http://localhost:4173. The launch config is called "foundries".
- **Shell:** `zsh` does not word-split `$VAR`. Use `${=VAR}` when passing a list of ids.
- **Figma MCP:** use `use_figma` with `return` to get values back. Instance children can't be resized individually; change the component instead.
