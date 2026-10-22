# AGENTS.md

Multi-account social-media video generator ("1section"). Scheduler rotates through Buffer accounts and content categories, generating AI-written short-form videos (1080x1350, 20s = 15s content + 5s dark CTA end card) and posting them to Buffer. Express + EJS dashboard at `/`. State persisted in **SQLite** (`db.sqlite`).

## Commands
- `npm run dev` — nodemon, local dev (`server.js` with scheduler)
- `npm start` — `NODE_ENV=production node server.js`
- `node render-all.mjs` — render **one sample unified video with dummy data** (no AI / Buffer, no DB). The fast way to validate the template offline.

## Requirements / gotchas
- Rendering shells out to a **globally-installed `hyperframes` CLI**: `npx hyperframes render builder -c _render.html ...` (services/renderer.mjs). **Not** an npm dep. Requires `ffmpeg`. Render has a hard 300s timeout. A 20s video (600 frames) takes ~50-120s to render depending on load.
- `builder/_render.html`, `builder/_bgm.mp3`, `output/`, and `db.sqlite*` are **gitignored** artifacts. `_render.html` is the fully-composed template written per render; `_bgm.mp3` is a 20s fade-out clip cut from a random `music/*.mp3`.
- **`better-sqlite3` is a native addon** — on a fresh install run `npm install` then `npm rebuild better-sqlite3` if the binding is missing (package.json has `allowScripts` set, but install scripts can be blocked by npm's allow-list).
- `db.sqlite` uses WAL journaling; `db.mjs` initializes schema on import. DB path overridable via `DB_PATH` env.
- Buffer publishing requires `PUBLIC_URL` (set in `.env`) — each account's own `buffer_token` is stored in the DB, not `.env`.

## Rotation model (the core "content grid")
Each scheduled run posts **one** (account, category) pair, advancing like a flattened grid:
`acc1:cat1 → acc2:cat1 → … → accN:cat1 → acc1:cat2 → acc2:cat2 → …` then resets.
- Implemented via a saved `rotation` setting `{contentIndex, accountIndex}` in `scheduler/pipeline` (`pipeline.js` `nextSlot()` + the advance logic in `runPipeline`).
- Category per account is picked as `account_categories[contentIndex % len]`; account as `accounts[accountIndex % len]`.
- Posts are **deduped** per account (same trimmed content already posted = skipped).

## Data model (`db.mjs` → SQLite)
- `settings` — key/value: `rotation`, `videos_per_day`, `tz`, `window_start`, `window_end`, etc.
- `accounts` — name + `buffer_token` + position (rotation order).
- `categories` — global list: name + `default_prompt`.
- `account_categories` — per-account instance of a category: `prompt` (per-account override, falls back to category `default_prompt`), position. THIS is what drives what content each account posts.
- `videos` — one row per generated post: account/category, `hook`, `content`, `caption`, `content_json`, `video_path`, `status` (pending/success/failed), `attempts`, `last_error`. Persisted so captions/content survive failures.

## Pipeline flow (`pipeline.js`)
`nextSlot()` picks account+category → `generatePost` (OpenRouter) returns `{hook, content, caption, content_json}` → dedupe check → `generateVideo` (unified template) → `uploadWithRetry` (Buffer, up to `RETRY_ATTEMPTS`=3 with `RETRY_DELAY_MS` backoff) → video row `success`/`failed`. Manual retry via `/api/videos/:id/retry` re-uploads an existing rendered file (or re-runs the slot if never rendered).

## Builder / render pipeline
- **`builder/unified.html` is the ONLY template** (all 12 old per-type templates were removed: stat, steps, compare, mythfact, quote, QnA, story, tips, formula, tierlist, checklist, warning). Do NOT recreate per-type templates.
- Uses the custom mustache-like engine (`renderTemplate` in services/renderer.mjs): `{{hook}}`, `{{content}}`, `{{category}}`, `{{account}}`, `{{account_link}}`, `{{account_link_head}}`, `{{account_link_tail}}`, `{{conclusion}}`, `{{niche}}` and a random light `{{bg_fill}}` (paper tint). `content` is `\n`-joined; rendered with `white-space:pre-wrap`.
- Composition root: `<div id="root" data-composition-id="unified" data-start="0" data-width="1080" data-height="1350" data-duration="20">` with TWO timed clips: the content slide `data-start="0" data-duration="15"` and the CTA end card `data-start="15" data-duration="5"`. Hyperframes keys clip visibility off `data-start`, so the switch is a hard cut at 15s. Content layout: topbar [category badge] (spacer) [@account handle] → [hook] → [content box] → centered footer: link icon + split-typography account `link` (`finance` bold, `.1section.com` muted). Textured paper bg via inline SVG `feTurbulence`.
- CTA end card: full-bleed near-black background with a faint grid. Everything is horizontally centered and the whole stack is vertically centered. Monochrome (white/gray text, no accent colors). Structure top→bottom: `1section` wordmark with the niche (`finance`) underneath → "THE BOTTOM LINE" eyebrow with side rules + AI `conclusion` → "FOLLOW FOR MORE" + `@account` → "Want a deeper breakdown?" + link pill (the domain is one unbroken string).
- `renderPost({hook, content, category, account, account_link, conclusion}, outputPath)` in renderer writes the filled `_render.html` then spawns hyperframes. `videogen.generateVideo` caps concurrency via `RENDER_CONCURRENCY` (default 1); output file is `<account>-<epoch>.mp4`.

## OpenRouter content contract
`services/openrouter.js` `generatePost({accountName, categoryName, prompt})` → AI returns strict JSON `{hook, content, caption, conclusion}`. `content` is multi-line Markdown: short (under ~45 words) and shape-varied per post (sections `###`/`####`, one-level blockquotes, compact tables, lists/checklists, separators, a code block only for formulas). `conclusion` is one plain-text takeaway sentence (max ~18 words) printed on the CTA card. An explicit `OUTPUT_CONTRACT` is appended to every request (so the field is generated even when the DB holds an older base-prompt revision). The per-account-category `prompt` (editable in the dashboard) customizes the generator. Caption auto-appends `#1section`.

Supported Markdown (CSS in `builder/unified.html`): h1–h6, bold/italic/strike/underline/`<mark>`/`<small>`/`<kbd>`/sub/sup, inline code (dark pill, white text), code blocks, paragraphs + `<br>`, `---`, one-level blockquotes (nested renders muted), nested `ul`/`ol`/task lists, tables with `:---`/`:---:`/`---:` alignment, links, images. Not supported by design: Mermaid, LaTeX math, raw HTML beyond those tags.

Arrow chains are auto-detected by `chainifyMarkdown()` and wrapped in a centered bordered card (`.chain`): either `A → B → C` (one line, or several short lines) or steps ending in `↓` (one per line, or `A ↓ B ↓ C`). This is the "sequence" layout the category prompts lean on, so steps should stay 2–5 words.

## Server / API
`server.js` serves the EJS dashboard (`views/index.ejs`) + REST API:
- `/api/accounts` (GET/POST/PUT/DELETE, `/reorder`), `/api/categories` (CRUD)
- `/api/accounts/:id/categories` (GET list; PUT full-replace mapping; `/…/:categoryId/prompt` to set a prompt)
- `/api/videos` (list by `?account_id=`), `/api/videos/:id/retry`, `/api/videos/:id` (DELETE)
- `/api/settings` (GET/PUT) — `videos_per_day`, `window_start`, `window_end`, `tz`
- `/api/generate` (POST) — run one pipeline slot now (used by the dashboard button)
- `/api/analytics?days=30` (GET) — **read-only** dashboard analytics: Buffer `aggregatedPostMetrics` per account (posts, views, reactions, comments, engagement rate) + local DB stats (generated/success/failed, 14-day activity, category mix). Implemented in `services/analytics.mjs`; 5-min metric cache, 1-hour channel cache, accounts fetched with concurrency 4. Never writes state.
- Static: `/videos/*` (output dir), `/music/*`

## Dashboard (`views/index.ejs`)
Single-file EJS dashboard (no frontend build): dark sidebar (accounts, settings, categories, music) + light main area with KPI cards, 14-day activity bars, category mix and a per-account channel table (real Buffer metrics). Selecting an account opens a panel with Videos and Categories & prompts tabs (prompt accordions). All data flows through the REST API above; the UI never mutates state except through those endpoints.

## Scheduler
`cron`-based, `videos_per_day` equally spaced across the `window_start`–`window_end` window in `tz` (scheduler.js `buildSchedule`/`startScheduler`). Set `DISABLE_SCHEDULER=1` to run without cron. Times recomputed from settings each boot.
