# Handoff — Found rizz (type & foundry index)

Written 2026-11-24 when the owner moved Claude accounts; updated 2026-11-25 and again 2026-11-27, after a second account move. Start with “Current state — 2026-11-27” just below; the older sections are kept for history. Read this together with `README.md`, which documents how to run and configure everything.

- **Repo:** https://github.com/adam89asseraf-lab/foundries (public)
- **Live site:** https://adam89asseraf-lab.github.io/foundries/ (GitHub Pages)
- **Branch:** `main` (the `uniform-specimens` branch is merged).
- **Design:** Figma file `7J30UXQ9UxdziRxxmPCWOT` (GUTS team). It has the Components section and the Fonts desktop, Fonts mobile and Foundries desktop screens.
- **Votes database:** Supabase project `lulglxebjchreghaexjd` (https://lulglxebjchreghaexjd.supabase.co, Tokyo, free plan).

## Current state — 2026-11-27

**Coverage:** 104 entries in `foundries.yaml` and 2,480 fonts in `data/data.json` (the nightly crawl on 2026-11-27 captured 2,421 of them). About 1,470 fonts have uniform specimens, and about 1,460 have script coverage for the language filter.

**Paused (`skip: true`):** only Kyiv Type Foundry (its pages give no clean specimen, just scrolled pages with text and buttons) and DDOTT (headless Chrome is refused). Good Type, Fontef, RAG, Non Foundry, Optimo and Spoke were fixed and re-crawled on 2026-11-26.

### Session summary — 2026-11-26

**Main site (`site/index.html`)**
- **Four tabs:** Fonts, Foundries, Libraries and **Play**. The tabs are 36px tall as in Figma, and their counts are hidden on phones.
- **Layout from the updated Figma pages (auto-layout spacing):**
  - Fonts toolbar: row 1 has search, foundry, language and sort; row 2 has the category grid (All, Free, categories, Variable), grid size, styles, price and reset.
  - Foundries toolbar: search, sort and grid size in one row. The tag row only shows active tags, and clicking a tag on a card filters by it.
  - Phones: centred masthead, a round expand button on screenshots, and the status line under the list.
- **Filters:**
  - The foundry and language filters are type-ahead multi-selects with chips, and the foundry filter is kept in the URL.
  - The foundry picker's first option selects all liked foundries. When all of them are picked, they show as one "♥ Liked foundries N" chip.
  - **Language filter:** Latin, Extended Latin, Cyrillic, Greek, Hebrew, Arabic and more. The data comes from the new `--scripts` crawl phase, which checks which writing systems each font's webfont draws.
  - All also turns off Free, Variable and New releases.
- **Sort:** "Most popular" is the default. It combines Tier List averages (pulled towards B) with hearts.
- **Grid-size toggle:** 2/3/4/5 columns.
- **Compare:** each font card has a compare toggle; you can pick up to 6 fonts.
  - The tray at the bottom opens a full-screen side-by-side view with category, styles, variable, price and votes.
  - **Your own sentence:** free fonts draw it live. For paid fonts, confirming the sentence queues it in Supabase (`supabase/previews.sql`). That starts `.github/workflows/previews.yml`, where `crawler/previews.mjs` draws it on the foundry's own page in the webfont the uniform specimen found, and uploads a 1600×640 picture. The same sentence and font are drawn only once.
  - Clicking a specimen opens the full-screen viewer; ← → step through the compared fonts.
- **Full-screen viewer:** it has a heart, and L likes or unlikes the font or foundry on screen.
- **Font cards:** an "Examine font" bar slides up on hover. It's always shown on touch screens.
- **Title animation:** a pause/play button sits above the title. It remembers the choice, and the animation starts paused under reduced motion.

**Play (`site/play.html`, opened from the Play tab)**
- **Tier List (default game):** rank one foundry's fonts from S to D.
  - The lobby shows 9 foundry cards. Ranking shows specimen-only cards in 98px rows and a one-line unranked strip, and the result screen shows your tiers next to the crowd's average.
  - Cards are 339×108 in tiers and 329×93 unranked. Hovering a card zooms into the specimen and follows the pointer.
  - Tiers are saved anonymously in Supabase (`supabase/tiers.sql`).
- **Casting Call (real votes since 2026-11-27):** one role and 4 fonts from one category (2×2 grid); you pick the star and the flop. See "Casting Call votes" below.
- **Type Quiz and Font Bracket were removed on 2026-11-27.** The owner chose to keep only Tier List and Casting Call. The code is in git history before that date.

**Crawler**
- **Dinamo fix:** Dinamo keeps its `@font-face` styles in `<body>`, and emptying the page used to delete them. Style tags now move to `<head>` first, both for specimens and for paid-font previews.
  - 45 of 46 Dinamo fonts and 88 earlier failures now have uniform specimens.
  - A Foundry keeps its old screenshots, because its site CSS breaks the specimen layout.

### Casting Call votes (2026-11-27)

- **SQL:** `supabase/casting.sql`. **The owner must run it once in the Supabase SQL Editor.** Until then, rounds still work: every font shows as "New face", you get +25 per round, and a toast says the casting didn't save.
- **What's stored:** one row per browser, role and set of 4 fonts, with the star and the flop (best–worst scaling). The `cast_vote()` RPC checks that there are exactly 4 different fonts and that the star and flop are two of them. Playing the same set again replaces the earlier answer.
- **Public views:**
  - `cast_scores`: per role and font, how many times it was shown, picked as the star, and picked as the flop.
  - `cast_font_scores`: the same summed over all roles.
- **Reveal:** compares you with everyone who played before you. A font counts once it has been shown 3 times (`MIN_CROWD`) in that role, and the crowd's star and flop are only decided when at least 2 of the 4 fonts count.
  - Crowd score = (star − flop) / (shown + 1).
  - Points: 100 for matching the star, 50 for the flop, 10 for neither, and 25 when there's no crowd yet.
- **Matchmaking:** each round has up to 2 fonts the crowd has already judged for that role, so there is something to match. The rest are drawn with weight 1 / (1 + shown in this role + 0.25 × shown in all roles), which favours fonts with few votes.

**Tidy-up on 2026-11-27**
- Pulled the nightly crawl.
- Deleted the stray Kyiv font screenshots, which came from before it was paused.
- Committed the crawler's `.pre` backups (see Gotchas) and removed two whose fonts no longer exist.

### Next up
- **Play:**
  - Run `supabase/casting.sql` in Supabase (owner).
  - The nightly crawl should turn `cast_font_scores` into per-font scores in `data.json`, which drive badges and a "Best for…" filter. Casting could also feed the "Most popular" sort.
- **Figma:** the Games page (`49:572`) still has the Casting Call wireframes. Quiz and Bracket are dropped, so they don't need wireframes.
- **Kyiv and DDOTT:** both are still paused.
- **Older open items:** see "Other open items" below. The API key, 205TF 404s and unpriced foundries are all still open.

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

## Uniform specimens (done, live since 2026-11-25)

**What it does:** most font cards now show the same white background, the same ink (#121214) and the same words: "Quirky swamp tigers" plus "The quick brown fox jumps over the lazy dog 0123". Fonts that cover Hebrew show Hebrew.

**How it works** (`crawler/uniform.mjs`, the `--uniform` phase in `crawl.mjs`, which is part of the default nightly run):
1. On the font's own page, `detectFace` finds the product's webfont. It prefers a family named like the font, skips the site's interface fonts, and also checks type-tester inputs and loaded `FontFace`s.
2. The page is emptied, while its fonts stay loaded, so smooth-scroll and transform tricks can't move the layer.
3. The sample is drawn full-screen at regular weight and upright style, with faking disabled. `crawler/lib/specimen-frame.mjs` then crops it to a short 5:2 frame (1600×640, thumb 800×320) centred on the words, scaling down text that's too tall.
4. Chrome reports which fonts actually drew the glyphs (`CSS.getPlatformFontsForNode`). If any glyph came from a fallback font, the font keeps its old screenshot.

No font files are downloaded.

**Results:**
- About 1,090 fonts are uniform specimens: about 940 show "Quirky swamp tigers", about 150 Hebrew fonts show Hebrew, and a few dozen whose webfont lacks the new letters (mostly Dinamo) still show the first phrase, "Hamburgefonts".
- **Guard against the site's own font:** a face not named like the font that's used for 2+ fonts of one foundry is the site's interface font (Brandon Nickerson's Manrope, for example). The crawler refuses it, and the post-run check puts the earlier screenshot back from the `.pre.webp` backup it keeps for such faces.
- **Sibling faces:** a face whose name adds another design (mono, condensed, stencil…) is used only as a last resort, and italics are avoided when an upright style exists.
- About 800 fonts keep their earlier screenshot:
  - about 500 are image-only (Future Fonts, Gumroad and similar);
  - about 150 pages have no matching webfont (205TF, Shriftovik, Bad Type Club, Font of the Month);
  - about 105 webfonts are missing letters of the sample, usually because they're subsets.
- The fields `shot: "uniform"`, `uniformAt`, `uniformFace`, `uniformScript` and `uniformFail` record what happened to each font.

**Retries and new fonts:** failures are retried after 30 days, or right away after a recapture. New fonts get a uniform specimen in the same nightly run that captures them.

**Tools:**
- `scripts/uniform-pilot.mjs <outDir> ids…` renders samples to a folder without touching the data.
- `scripts/contact-sheet.mjs <dir>` makes a sheet for review.

## Session summary — 2026-11-25

Everything below is on `main` and live unless marked otherwise.

**Shipped**
- **Foundries and Libraries tabs:** 3-column grid, with 2 columns under 960px and 1 under 600px.
- **Foundry card:** matches the Figma update (node `3:21`):
  - 24/32/12px padding and 16px above the screenshot;
  - the price tag has the same light border as the other tags;
  - the note line is hidden (the owner chose to keep it hidden).
- **Font thumbnails:** a 5:2 frame on white.
  - `crawler/lib/specimen-frame.mjs` crops each uniform specimen to its words (1600×640, thumb 800×320) and shrinks text that's too tall.
  - All 1,090 existing specimens were recoloured from #ededea to white and reframed by `scripts/uniform-reframe.mjs` (one-off; marks fonts `uniformFrame: 2`). The crawler now renders on white and frames new specimens the same way.
  - Non-uniform screenshots are cropped from the top.
- **Foundry rating:** foundry and library cards have the heart vote.
  - Votes are stored in the existing Supabase `votes` table under `foundry:<id>`, so no new SQL was needed.
  - The Fonts tab's default “By foundry” order ranks foundries by votes, then board order. Uniform specimens still come first.
  - The Foundries tab has a “Most voted” sort.
- **Full-screen viewer:** ← → buttons, arrow keys, swipe and an “n / total” counter. It steps through the current tab's list in its current order and wraps at the ends.
- **New foundries:**
  - Pizza Typefaces, Ezer Type House, Nomad Type, Suitcase, Optimo, Blast, The Pyte Foundry, Spoke, SM Foundry and East of Rome.
  - Optimo replaces the old single-typeface entry Rand (votes on the old Rand card don't carry over).

**Paused or unfinished**
- **Paused foundries (`skip: true`):** Good Type Foundry, Fontef, RAG Design and Non Foundry. Their catalogues picked up licence, product or menu pages instead of fonts.
  - Their cards show, but `scripts/build-site.mjs` drops the fonts of paused foundries.
  - To fix one: set a `catalogUrl`/`fontLinkPattern` (or `fontUrls`), remove `skip`, set `rescan: true` and re-crawl.
- **Optimo:** only 7 fonts were found; the real catalogue is bigger.
- **Kyiv Type Foundry:** the homepage was captured, but no fonts were found yet, so it needs a catalogue setting.
- **DDOTT:** ddott.net fails in headless Chrome (`ERR_HTTP2_PROTOCOL_ERROR`), so it has no screenshot and no fonts.
- **Spoke:** its fonts are named “Buy Vieno”, “Buy Ompu”…, so it needs `nameStrip: "^Buy "`.
- **East of Rome:** font names are all caps (MARBLE, SCOOCH…); check whether to title-case them.
- **Not pushed yet:** the second crawl's results (Pyte, Kyiv, Spoke, SM, DDOTT, East of Rome) are in the local `data/data.json` and `public/shots/`, unreviewed.

**Rating game (design stage)**
- The owner picked three of the five ideas:
  - **Casting Call:** a wacky role and 4 fonts from one category; pick best and worst, and score by matching the crowd (best–worst scaling).
  - **Type Personality Quiz:** about 10 “which feels more like you” picks, ending in a shareable result card.
  - **Font Bracket:** a weekly 16-font themed knockout.
  - Not picked: Vibe Check and Price Is Right.
- Figma has a new page, **“Games — wireframes”** (id `49:572`):
  - Casting Call is done: 4 screens (lobby, round, reveal, wrap) plus notes. Its DM Mono specimens still clip and need a smaller size.
  - The Quiz and Bracket wireframes are still to do. Planned screens:
    - Quiz: intro, question, result, share card.
    - Bracket: bracket overview, matchup vote, champion and hall of fame.
- **Planned build:**
  - a fourth tab, “Play”;
  - a new Supabase table for game votes;
  - the nightly crawl turns votes into per-font scores in `data.json`, which drive badges and a “Best for…” filter;
  - matchmaking favours fonts with few votes.

## Other open items

- **`ANTHROPIC_API_KEY`:** add it under GitHub Settings → Secrets → Actions to turn on the personality sliders and auto-categorise new fonts.
- **205TF:** 8 of its 62 font pages return HTTP 404 to the crawler, including Album, Garaje and Zénith.
- **Unpriced foundries** (no `price:` in the YAML): Weltkern, Nouvelle Noire, Bad Type Club, CoType, Lift, General Type, Edito, Formerly Known, Studio Feixen, Sociotype, Zetafonts, OH no, SilverStag, Superior, Studio Few, a.Foundry, Power, Dirtyline and the Gumroad sellers.
  - Weltkern only shows prices after a company-size form. Don't submit forms on foundry sites.
- **72 fonts without a category:** mostly fonts with no screenshot yet.
- **Figma:** the masthead on the Figma screens still says "Found it!" while the site says "Found rizz". The Font card component has the foundry name underlined, but the screens and the site don't.

## Gotchas

- **`.pre.webp` files are undo backups. Keep them in git.**
  - Before drawing a uniform specimen with a face that isn't named like the font, the crawler copies the old screenshot to `<id>.pre.webp`.
  - If a later check finds that face on 2+ fonts of one foundry (the site's own font), it renames the backup back.
  - That check can happen in a later nightly run, so the Action commits these files along with `public/shots`. Don't add them to `.gitignore`.
  - A backup whose font no longer exists in `data.json` can be deleted.

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
