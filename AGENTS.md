# AGENTS.md

Multi-account social-media video generator ("1section"). Scheduler rotates through Buffer accounts and content categories, generating AI-written short-form videos (1080x1350, 15s, static animated-free layout) and posting them to Buffer. Express + EJS dashboard at `/`. State persisted in **SQLite** (`db.sqlite`).

## Commands
- `npm run dev` — nodemon, local dev (`server.js` with scheduler)
- `npm start` — `NODE_ENV=production node server.js`
- `node render-all.mjs` — render **one sample unified video with dummy data** (no AI / Buffer, no DB). The fast way to validate the template offline.

## Requirements / gotchas
- Rendering shells out to a **globally-installed `hyperframes` CLI**: `npx hyperframes render builder -c _render.html ...` (services/renderer.mjs). **Not** an npm dep. Requires `ffmpeg`. Render has a hard 180s timeout. A single ~40s of footage takes ~40s+ to render.
- `builder/_render.html`, `builder/_bgm.mp3`, `output/`, and `db.sqlite*` are **gitignored** artifacts. `_render.html` is the fully-composed template written per render; `_bgm.mp3` is a 15s fade-out clip cut from a random `music/*.mp3`.
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
- Uses the custom mustache-like engine (`renderTemplate` in services/renderer.mjs): `{{hook}}`, `{{content}}`, `{{category}}`, `{{account}}`, `{{account_link}}` and a random bright `{{box_fill}}`/`{{text_color}}` palette (dark-blue/orange/green/yellow/purple/cyan/pink/lime). `content` is `\n`-joined; rendered with `white-space:pre-wrap`.
- Composition root: `<div id="root" data-composition-id="unified" data-start="0" data-width="1080" data-height="1350" data-duration="15">` with ONE `<section class="clip" data-start="0" data-duration="15">`. Static (empty GSAP timeline). Layout: topbar [category badge] (spacer) [@account handle] → [hook] → [content box] → centered footer: link icon + split-typography account `link` (`finance` bold, `.1section.com` muted) + short accent rule. Textured paper bg via inline SVG `feTurbulence`.
- `renderPost({hook, content, category, account, account_link}, outputPath)` in renderer writes the filled `_render.html` then spawns hyperframes. `videogen.generateVideo` caps concurrency via `RENDER_CONCURRENCY` (default 1); output file is `<account>-<epoch>.mp4`.

## OpenRouter content contract
`services/openrouter.js` `generatePost({accountName, categoryName, prompt})` → AI returns strict JSON `{hook, content, caption}`. `content` is 2–5 short lines joined by `\n`. The per-account-category `prompt` (editable in the dashboard) customizes the generator. Caption auto-appends `#1section`.

## Server / API
`server.js` serves the EJS dashboard (`views/index.ejs`) + REST API:
- `/api/accounts` (GET/POST/PUT/DELETE, `/reorder`), `/api/categories` (CRUD)
- `/api/accounts/:id/categories` (GET list; PUT full-replace mapping; `/…/:categoryId/prompt` to set a prompt)
- `/api/videos` (list by `?account_id=`), `/api/videos/:id/retry`, `/api/videos/:id` (DELETE)
- `/api/settings` (GET/PUT) — `videos_per_day`, `window_start`, `window_end`, `tz`
- Static: `/videos/*` (output dir), `/music/*`

## Scheduler
`cron`-based, `videos_per_day` equally spaced across the `window_start`–`window_end` window in `tz` (scheduler.js `buildSchedule`/`startScheduler`). Set `DISABLE_SCHEDULER=1` to run without cron. Times recomputed from settings each boot.
