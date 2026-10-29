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
- Posts are **deduped** per account (same trimmed content already posted or rendered-and-ready = skipped).

## Data model (`db.mjs` → SQLite)
- `settings` — key/value: `rotation`, `videos_per_day`, `tz`, `window_start`, `window_end`, `publish_enabled`, etc.
- `accounts` — name + `buffer_token` + position (rotation order).
- `categories` — global list: name + `default_prompt`.
- `account_categories` — per-account instance of a category: `prompt` (per-account override, falls back to category `default_prompt`), position. THIS is what drives what content each account posts.
- `videos` — one row per generated post: account/category, `hook`, `content`, `caption`, `content_json`, `video_path`, `status` (`pending`/`ready`/`success`/`failed`), `attempts`, `last_error`. `ready` means the file is rendered but not published. Persisted so captions/content survive failures.

## Pipeline flow (`pipeline.js`)
`nextSlot()` picks account+category → `generatePost` (OpenRouter) returns `{hook, content, caption, content_json}` → dedupe check → `generateVideo` (unified template) → `uploadWithRetry` (Buffer, up to `RETRY_ATTEMPTS`=3 with `RETRY_DELAY_MS` backoff) → video row `success`/`ready`/`failed`. Manual retry via `/api/videos/:id/retry` re-uploads an existing rendered file (or re-runs the slot if never rendered).

**Publishing switch.** `settings.publish_enabled` (default `1`) is the master Buffer delivery switch. When `0`, `generateAndPost` still runs the AI and renderer but stops before Buffer: the row is saved as `ready` with `posted_at` NULL and `attempts` 0, and the rotation still advances. `uploadWithRetry` and `runManualRetry` also respect the switch, so retrying a `ready` video while publishing is off leaves it untouched. When publishing is turned back on, Retry on a `ready` row uploads the existing file without re-rendering. Dedupe treats `ready` and `success` as already-used content.

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
`server.js` serves the EJS dashboard (`views/index.ejs`) + REST API. The dashboard and all `/api/*` routes are protected by HTTP Basic Auth (`DASHBOARD_USER` / `DASHBOARD_PASSWORD` in `.env`); `/videos/*` stays public because Buffer fetches rendered files, and `/health` stays public for uptime checks.
- `/api/accounts` (GET/POST/PUT/DELETE, `/reorder`), `/api/categories` (CRUD)
- `/api/accounts/:id/categories` (GET list; PUT full-replace mapping; `/…/:categoryId/prompt` to set a prompt)
- `/api/videos` (list by `?account_id=`), `/api/videos/:id/retry`, `/api/videos/:id` (DELETE)
- `/api/settings` (GET/PUT) — `videos_per_day`, `window_start`, `window_end`, `tz`, `publish_enabled`
- `/api/generate` (POST) — run one pipeline slot now (used by the dashboard button)
- `/api/analytics?days=30` (GET) — **read-only** dashboard analytics: Buffer `aggregatedPostMetrics` per account (posts, views, reactions, comments, engagement rate) + local DB stats (generated/posted/ready/failed, 14-day activity, category mix). Implemented in `services/analytics.mjs`; 5-min metric cache, 1-hour channel cache, accounts fetched with concurrency 4. Never writes state.
- `/api/analytics/full?days=30` (GET) — **read-only** full analytics for the `/analytics` page. Per Buffer account: account/organization metadata, every channel, aggregated metrics (overall + per channel), and the latest 5 sent posts with every metric Buffer exposes. Also includes the latest 5 generated posts per account from SQLite (`content_json` parsed). Implemented in `services/analytics-full.mjs`; 5-min snapshot cache, 1-hour account/channel cache, 2 accounts in parallel. Never writes state.
- Static: `/videos/*` (output dir), `/music/*`, `/css/*`, `/js/*` (shared dashboard assets in `public/`)

## Dashboard (`views/`)
Multi-page EJS dashboard (no frontend build), one concern per page, shared shell in `views/partials/head.ejs` + `foot.ejs` and a single design system in `public/css/app.css` (+ `public/js/app.js` exposing the global `UI` namespace: `api`, `toast`, `confirm`, `generateNow`, formatters). Pages:
- `/` (`overview.ejs`) — KPI row + 14-day activity + category mix + Buffer channel table (all from `/api/analytics`), recent videos and a read-only "next in rotation" card (`nextSlot()` preview).
- `/accounts` (`accounts.ejs`) — account cards with per-account stats, add/edit modal, delete, ↑/↓ reorder (`/api/accounts/reorder`).
- `/accounts/:id` (`account.ejs`) — profile, stats, latest videos, category prompt summary.
- `/accounts/:id/prompts` (`prompts.ejs`) — per-account category prompt overrides (accordions, save / reset to default).
- `/videos` (`videos.ejs`) — all videos with account/status filters (Posted / Ready / Failed / Pending), client-side search, view/retry/delete; newest 60 by default (`?limit=500` for all).
- `/categories` (`categories.ejs`) — global categories + default prompts, override/video counts, CRUD.
- `/settings` (`settings.ejs`) — publishing on/off switch, cadence (videos/day, window, tz), base AI prompt, rotation + runtime info. The sidebar footer mirrors the publishing state and links here.
- `/music` (`music.ejs`) — BGM library: upload, preview, rename, delete.
- `/analytics` (`analytics.ejs`) — unchanged deep-dive page (own markup/CSS); only its sidebar links were widened.

Server-side pages are read-only renders from the `store`; every mutation still goes through the REST API below. `views/index.ejs` was removed when the dashboard was split.

The AI base prompt (`ai_base_prompt` setting) is editable on `/settings`; it is read by `services/openrouter.js` and falls back to `DEFAULT_BASE_PROMPT` when empty.

## Analytics page (`views/analytics.ejs`)
English-language, read-only page at `/analytics` (linked from the sidebar). Loads `/api/analytics/full` client-side with 7/30/90-day ranges and renders: totals from all Buffer accounts, an account-comparison bar chart (views/reactions/comments/posts/engagement), then a collapsible section per account with Buffer metadata, channels, every aggregated metric, all per-channel metric values as cards, the latest 5 sent posts with every metric value as cards, and the latest 5 SQLite-generated posts as pretty JSON. Every account exposes a Markdown audit download (`accountMarkdown`) plus a global audit (`auditMarkdown`) with key values, channels, aggregated metrics, per-channel metric values, 5 latest posts and the 5 generated JSON records; JSON downloads remain available per account and for all accounts. Same Basic Auth gate as the rest of the dashboard.

## Scheduler
`cron`-based, `videos_per_day` equally spaced across the `window_start`–`window_end` window in `tz` (scheduler.js `buildSchedule`/`startScheduler`). Set `DISABLE_SCHEDULER=1` to run without cron. Times recomputed from settings each boot.
