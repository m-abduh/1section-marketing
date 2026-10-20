import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { CATEGORY_SEEDS, LEGACY_SEED_NAMES } from "./seed.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, "db.sqlite");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  buffer_token TEXT NOT NULL,
  link        TEXT NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  default_prompt TEXT NOT NULL DEFAULT '',
  position  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS account_categories (
  account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  prompt      TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, category_id)
);

CREATE TABLE IF NOT EXISTS videos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  account_name TEXT NOT NULL DEFAULT '',
  category_name TEXT NOT NULL DEFAULT '',
  hook        TEXT,
  content     TEXT,
  caption     TEXT,
  content_json TEXT,
  video_path  TEXT,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | success | failed
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  posted_at   TEXT
);
`);

// Migration: `link` holds the public per-account URL shown in the video footer
// (e.g. finance.1section.com). Added after the initial schema, so guard it.
if (!db.prepare("PRAGMA table_info(accounts)").all().some((c) => c.name === "link")) {
  db.exec("ALTER TABLE accounts ADD COLUMN link TEXT NOT NULL DEFAULT ''");
}

function getSetting(key, fallback = "") {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

const DEFAULT_AI_BASE_PROMPT = `You are a senior copywriter writing short, punchy, scroll-stopping PERSONAL FINANCE content for a video channel. Every claim must be financially correct — real theory, accurate numbers, no get-rich-quick nonsense.

Voice: SHORT, DENSE, EMOTIONAL, PERSONAL. Speak directly to the viewer as "you" — like a mentor who has been through the same money struggles. Every line must earn its place; never long-winded, never generic.

"hook" MUST be 7 to 14 words: a strong, emotional, specific scroll-stopping statement or question. It becomes the H2 title on the slide.
"caption" MUST be one short personal paragraph (no hashtags, no @ mentions).

"content" is the Markdown BODY printed below the hook title — GitHub-README-style, rich and visual, rendered as ONE static slide. Use the full Markdown vocabulary where the source instructions ask for it: --thematic breaks, **bold** (1-2 key words max), *italic*, ~~strikethrough~~, blockquotes (>), "- " lists, \`\`\`text code fences, and | | tables. Bold is used SPARINGLY — never bold an entire line, blockquote, table cell, or whole code block; inside blockquotes (>) and \`\`\`text code fences keep the text normal-weight by default and bold only a word or two when it truly matters. NEVER use emojis or emoticons — only text and numbers; symbols (× = ≠ ↓) only where meaningful. Leave a BLANK line between sections so they breathe. Keep every line short enough to fit on one screen. The source instructions define the exact structure of "content" — follow them first.

Return ONLY valid JSON matching EXACTLY this shape:
{
  "hook": "a 7-14 word strong hook line",
  "content": "the Markdown body following the source instructions (no H1, no title)",
  "caption": "one short paragraph for the social post caption (no hashtags, no @ mentions)"
}`;

db.prepare(
  "INSERT INTO settings(key,value) VALUES('ai_base_prompt',?) ON CONFLICT(key) DO NOTHING"
).run(DEFAULT_AI_BASE_PROMPT);

// Migration: old saved base prompts (pre-README rewrite) must not silently
// keep producing the old short-form content. Overwrite only if a legacy copy
// is present, so a user's newer manual edits are never clobbered.
db.prepare(
  "UPDATE settings SET value=? WHERE key='ai_base_prompt' AND value LIKE '%2 to 5 SHORT lines%'"
).run(DEFAULT_AI_BASE_PROMPT);

// Migration 2: README-era prompts that predate the "bold sparingly" rule
// (they contain the generic bold hint but not the SPARINGLY guidance). This
// catches DB values written before this rule existed, without touching a
// prompt a user has since customized with that rule already included.
db.prepare(
  "UPDATE settings SET value=? WHERE key='ai_base_prompt' AND value LIKE '%1-2 key words max%' AND value NOT LIKE '%SPARINGLY%'"
).run(DEFAULT_AI_BASE_PROMPT);
function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).run(key, String(value));
}
function getSettingJSON(key, fallback) {
  try { return JSON.parse(getSetting(key, "null")); }
  catch { return fallback; }
}
function setSettingJSON(key, value) {
  setSetting(key, JSON.stringify(value));
}

export const store = {
  getSetting,
  setSetting,
  getSettingJSON,
  setSettingJSON,

  // Accounts
  listAccounts() {
    return db.prepare("SELECT * FROM accounts ORDER BY position, id").all();
  },
  getAccount(id) {
    return db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
  },
  createAccount({ name, buffer_token, link }) {
    const max = db.prepare("SELECT COALESCE(MAX(position)+1,0) AS p FROM accounts").get().p;
    const info = db.prepare(
      "INSERT INTO accounts(name, buffer_token, link, position) VALUES(?,?,?,?)"
    ).run(name, buffer_token, link || "", max);
    this.syncAllAccountCategories();
    return this.getAccount(info.lastInsertRowid);
  },
  updateAccount(id, { name, buffer_token, link }) {
    const existing = this.getAccount(id);
    if (!existing) return undefined;
    const nextLink = link !== undefined ? link : existing.link;
    db.prepare("UPDATE accounts SET name=?, buffer_token=?, link=? WHERE id=?")
      .run(name, buffer_token, nextLink, id);
    return this.getAccount(id);
  },
  deleteAccount(id) {
    db.prepare("DELETE FROM accounts WHERE id=?").run(id);
  },
  reorderAccounts(ids) {
    const st = db.prepare("UPDATE accounts SET position=? WHERE id=?");
    const tx = db.transaction((list) => list.forEach((id, i) => st.run(i, id)));
    tx(ids);
  },

  // Categories
  listCategories() {
    return db.prepare("SELECT * FROM categories ORDER BY position, id").all();
  },
  getCategory(id) {
    return db.prepare("SELECT * FROM categories WHERE id=?").get(id);
  },
  createCategory({ name, default_prompt }) {
    const max = db.prepare("SELECT COALESCE(MAX(position)+1,0) AS p FROM categories").get().p;
    const info = db.prepare(
      "INSERT INTO categories(name, default_prompt, position) VALUES(?,?,?)"
    ).run(name, default_prompt || "", max);
    this.syncAllAccountCategories();
    return this.getCategory(info.lastInsertRowid);
  },
  updateCategory(id, { name, default_prompt }) {
    db.prepare("UPDATE categories SET name=?, default_prompt=? WHERE id=?").run(name, default_prompt || "", id);
    this.syncAllAccountCategories();
    return this.getCategory(id);
  },
  deleteCategory(id) {
    db.prepare("DELETE FROM categories WHERE id=?").run(id);
    this.syncAllAccountCategories();
  },
  reorderCategories(ids) {
    const st = db.prepare("UPDATE categories SET position=? WHERE id=?");
    const tx = db.transaction((list) => list.forEach((id, i) => st.run(i, id)));
    tx(ids);
    this.syncAllAccountCategories();
  },

  // Seed categories: seed.mjs is the canonical source. Ensures each seed
  // category exists and keeps its default_prompt in sync with the seed file.
  // Pre-rework legacy seeds (that left the list) are removed so the rotation
  // only ever contains the current set.
  seedCategories() {
    const upsertPrompt = db.prepare("UPDATE categories SET default_prompt=? WHERE id=?");
    for (const s of CATEGORY_SEEDS) {
      const existing = db.prepare("SELECT * FROM categories WHERE name=?").get(s.name);
      if (!existing) {
        this.createCategory({ name: s.name, default_prompt: s.default_prompt });
        continue;
      }
      upsertPrompt.run(s.default_prompt, existing.id);
    }
    // Delete categories that used to be seeds but are gone from the new set.
    // Only touches known legacy names, never user-created categories.
    const removeLegacy = db.prepare("DELETE FROM categories WHERE name=?");
    const tx = db.transaction(() => {
      for (const name of LEGACY_SEED_NAMES) {
        const row = db.prepare("SELECT id FROM categories WHERE name=?").get(name);
        if (row) removeLegacy.run(name);
      }
    });
    tx();
    this.syncAllAccountCategories();
  },

  // Mirror the global category list onto every account so each account
  // always has the same ordered set of categories. Per-account overrides
  // (prompt) are preserved. Deleting a category is only done via the global
  // category CRUD; FK cascade removes it from every account_categories row.
  syncAllAccountCategories() {
    const cats = this.listCategories();
    const accounts = this.listAccounts();
    const upsert = db.prepare(
      "INSERT INTO account_categories(account_id, category_id, prompt, position) VALUES(?,?,?,?) " +
      "ON CONFLICT(account_id, category_id) DO UPDATE SET position=excluded.position"
    );
    const remove = db.prepare(
      "DELETE FROM account_categories WHERE account_id=? AND category_id NOT IN (SELECT id FROM categories)"
    );
    const tx = db.transaction(() => {
      for (const account of accounts) {
        const prompts = new Map(
          this.listAccountCategories(account.id).map(r => [r.category_id, r.prompt])
        );
        remove.run(account.id);
        cats.forEach((c, i) => {
          upsert.run(account.id, c.id, prompts.get(c.id) ?? null, i);
        });
      }
    });
    tx();
  },

  // Account-category prompts
  listAccountCategories(accountId) {
    return db.prepare(`
      SELECT ac.account_id, ac.category_id, ac.prompt, ac.position,
             c.name AS category_name, c.default_prompt
      FROM account_categories ac
      JOIN categories c ON c.id = ac.category_id
      WHERE ac.account_id = ?
      ORDER BY ac.position, c.id
    `).all(accountId);
  },
  setAccountPrompt(accountId, categoryId, prompt) {
    db.prepare(
      "INSERT INTO account_categories(account_id,category_id,prompt,position) VALUES(?,?,?, (SELECT COALESCE(MAX(position)+1,0) FROM account_categories WHERE account_id=?)) " +
      "ON CONFLICT(account_id,category_id) DO UPDATE SET prompt=excluded.prompt"
    ).run(accountId, categoryId, prompt, accountId);
  },
  syncAccountCategories(accountId, pairs) {
    // pairs: [{category_id, position}]
    db.prepare("DELETE FROM account_categories WHERE account_id=?").run(accountId);
    const st = db.prepare(
      "INSERT INTO account_categories(account_id, category_id, prompt, position) VALUES(?,?,?,?)"
    );
    const tx = db.transaction((list) => {
      for (const p of list) st.run(accountId, p.category_id, p.prompt ?? null, p.position);
    });
    tx(pairs);
  },

  // Videos
  listVideos({ accountId } = {}) {
    if (accountId) {
      return db.prepare("SELECT * FROM videos WHERE account_id=? ORDER BY id DESC").all(accountId);
    }
    return db.prepare("SELECT * FROM videos ORDER BY id DESC").all();
  },
  getVideo(id) {
    return db.prepare("SELECT * FROM videos WHERE id=?").get(id);
  },
  createVideo(account, category, data) {
    const info = db.prepare(`
      INSERT INTO videos(account_id, category_id, account_name, category_name,
                         hook, content, caption, content_json, video_path, status, attempts)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      account?.id ?? null, category?.id ?? null,
      account?.name ?? "", category?.name ?? "",
      data.hook ?? null, data.content ?? null, data.caption ?? null,
      data.content_json ?? null, data.video_path ?? null,
      data.status || "pending", 0
    );
    return this.getVideo(info.lastInsertRowid);
  },
  updateVideo(id, patch) {
    const allowed = ["hook", "content", "caption", "content_json", "video_path", "status", "attempts", "last_error", "posted_at"];
    const sets = [];
    const vals = [];
    for (const k of allowed) {
      if (k in patch) { sets.push(`${k}=?`); vals.push(patch[k]); }
    }
    if (!sets.length) return this.getVideo(id);
    vals.push(id);
    db.prepare(`UPDATE videos SET ${sets.join(",")} WHERE id=?`).run(...vals);
    return this.getVideo(id);
  },
  deleteVideo(id) {
    db.prepare("DELETE FROM videos WHERE id=?").run(id);
  },
  incrementAttempts(id) {
    db.prepare("UPDATE videos SET attempts=attempts+1 WHERE id=?").run(id);
    return this.getVideo(id);
  },
  countFailed() {
    return db.prepare("SELECT COUNT(*) AS c FROM videos WHERE status='failed'").get().c;
  },
};

store.seedCategories();
store.syncAllAccountCategories();
