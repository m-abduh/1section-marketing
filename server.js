import "dotenv/config";
import express from "express";
import multer from "multer";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readdirSync, statSync, unlinkSync, renameSync, existsSync } from "fs";
import { spawn } from "child_process";
import { createHash, timingSafeEqual } from "crypto";
import { startScheduler } from "./scheduler.js";
import { runPipeline } from "./pipeline.js";
import { store } from "./db.mjs";
import { getSettings } from "./scheduler.js";
import { nextSlot } from "./pipeline.js";
import { getAnalytics } from "./services/analytics.mjs";
import { getFullAnalytics } from "./services/analytics-full.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8000;
const MUSIC_DIR = join(__dirname, "music");
const AUDIO_RE = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;

function safeMusicName(name) {
  return String(name || "").replace(/[\\/:*?"<>|]/g, "").trim();
}

function probeDuration(filePath) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => {
      const s = parseFloat(out.trim());
      resolve(Number.isFinite(s) ? s : null);
    });
    p.on("error", () => resolve(null));
  });
}

const musicUpload = multer({
  storage: multer.diskStorage({
    destination: MUSIC_DIR,
    filename: (req, file, cb) => {
      let name = safeMusicName(file.originalname);
      if (!name || !AUDIO_RE.test(name)) return cb(new Error("Only audio files allowed (mp3, wav, m4a, aac, ogg, flac)"));
      const ext = name.match(/\.[^.]+$/)[0];
      const base = name.slice(0, -ext.length);
      let cand = name;
      let i = 1;
      while (existsSync(join(MUSIC_DIR, cand))) cand = `${base} (${i++})${ext}`;
      cb(null, cand);
    },
  }),
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!AUDIO_RE.test(file.originalname)) return cb(new Error("Only audio files allowed (mp3, wav, m4a, aac, ogg, flac)"));
    cb(null, true);
  },
});

app.set("view engine", "ejs");
app.set("views", join(__dirname, "views"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/videos", express.static(join(__dirname, "output"), { index: false, redirect: false }));

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Basic auth gate for the dashboard and API. Credentials live in .env so only
// internal users can open the dashboard. /videos stays public because Buffer
// needs to fetch the rendered files over PUBLIC_URL; /health stays public for
// uptime checks.
const DASH_USER = process.env.DASHBOARD_USER || "";
const DASH_PASS = process.env.DASHBOARD_PASSWORD || "";
const sha256 = (value) => createHash("sha256").update(String(value)).digest();
const sameValue = (a, b) => timingSafeEqual(sha256(a), sha256(b));

if (DASH_USER && DASH_PASS) {
  app.use((req, res, next) => {
    const header = req.headers.authorization || "";
    if (!/^Basic\s+/i.test(header)) return challenge(res);
    let decoded;
    try {
      decoded = Buffer.from(header.replace(/^Basic\s+/i, ""), "base64").toString("utf8");
    } catch {
      return challenge(res);
    }
    const sep = decoded.indexOf(":");
    if (sep < 0) return challenge(res);
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    if (sameValue(user, DASH_USER) && sameValue(pass, DASH_PASS)) return next();
    return challenge(res);
  });
} else {
  console.warn("[auth] DASHBOARD_USER / DASHBOARD_PASSWORD not set — dashboard is unprotected");
}

function challenge(res) {
  res.set("WWW-Authenticate", 'Basic realm="1section dashboard", charset="UTF-8"');
  return res.status(401).send("Authentication required");
}

app.use("/css", express.static(join(__dirname, "public/css")));
app.use("/js", express.static(join(__dirname, "public/js")));
app.use("/music", express.static(join(__dirname, "music"), { index: false, redirect: false }));

// ---------- Page helpers ----------
function navCounts() {
  return {
    accounts: store.listAccounts().length,
    categories: store.listCategories().length,
    videos: store.countVideos(),
  };
}

function videoStats(videos) {
  const stats = { generated: videos.length, success: 0, failed: 0, pending: 0, lastAt: null, successRate: 0 };
  for (const v of videos) {
    if (v.status === "success") stats.success++;
    else if (v.status === "failed") stats.failed++;
    else stats.pending++;
    if (v.created_at && (!stats.lastAt || v.created_at > stats.lastAt)) stats.lastAt = v.created_at;
  }
  stats.successRate = stats.generated ? Math.round((stats.success / stats.generated) * 100) : 0;
  return stats;
}

// Read-only peek at the next rotation slot (nextSlot never advances state).
function nextUp() {
  try {
    const slot = nextSlot();
    if (!slot) return null;
    return {
      account: slot.account.name,
      accountId: slot.account.id,
      category: slot.categoryRow.category_name,
    };
  } catch {
    return null;
  }
}

function page(active, title, extra = {}) {
  return { active, title, counts: navCounts(), ...extra };
}

function renderMissing(res) {
  return res.status(404).render("not-found", page("", "Not found"));
}

// ---------- Pages ----------
app.get("/", (req, res) => {
  const videos = store.listVideos();
  res.render("overview", page("overview", "Overview", {
    accounts: store.listAccounts(),
    categories: store.listCategories(),
    stats: videoStats(videos),
    recent: videos.slice(0, 6),
    next: nextUp(),
    settings: getSettings(),
  }));
});

app.get("/accounts", (req, res) => {
  const videos = store.listVideos();
  const rows = store.listAccounts().map((account) => {
    const { buffer_token, ...safe } = account;
    return {
      ...safe,
      tokenTail: (buffer_token || "").slice(-4),
      stats: videoStats(videos.filter((v) => v.account_id === account.id)),
      categoryCount: store.listAccountCategories(account.id).length,
    };
  });
  res.render("accounts", page("accounts", "Accounts", { rows }));
});

app.get("/accounts/:id", (req, res) => {
  const account = store.getAccount(Number(req.params.id));
  if (!account) return renderMissing(res);

  const { buffer_token, ...safe } = account;
  const videos = store.listVideos({ accountId: account.id });
  const categories = store.listAccountCategories(account.id);

  res.render("account", page("accounts", account.name, {
    account: safe,
    tokenTail: (buffer_token || "").slice(-4),
    stats: videoStats(videos),
    categories,
    customCount: categories.filter((r) => r.prompt && r.prompt.trim()).length,
    recent: videos.slice(0, 10),
  }));
});

app.get("/accounts/:id/prompts", (req, res) => {
  const account = store.getAccount(Number(req.params.id));
  if (!account) return renderMissing(res);

  const { buffer_token, ...safe } = account;
  const categories = store.listAccountCategories(account.id);

  res.render("prompts", page("accounts", `${account.name} · Prompts`, {
    account: safe,
    categories,
    customCount: categories.filter((r) => r.prompt && r.prompt.trim()).length,
  }));
});

app.get("/videos", (req, res) => {
  const accountId = Number(req.query.account) || null;
  const status = ["success", "failed", "pending"].includes(String(req.query.status)) ? String(req.query.status) : "";
  const limit = Math.min(500, Math.max(20, Number(req.query.limit) || 60));
  const all = store.listVideos(accountId ? { accountId } : undefined);
  const filtered = status ? all.filter((v) => v.status === status) : all;

  res.render("videos", page("videos", "Videos", {
    accounts: store.listAccounts(),
    videos: filtered.slice(0, limit),
    accountId,
    status,
    limit,
    total: filtered.length,
    statusCounts: {
      all: all.length,
      success: all.filter((v) => v.status === "success").length,
      failed: all.filter((v) => v.status === "failed").length,
      pending: all.filter((v) => v.status === "pending").length,
    },
  }));
});

app.get("/categories", (req, res) => {
  const accounts = store.listAccounts();
  const videos = store.listVideos();

  const overrides = new Map();
  for (const account of accounts) {
    for (const row of store.listAccountCategories(account.id)) {
      if (row.prompt && row.prompt.trim()) {
        overrides.set(row.category_id, (overrides.get(row.category_id) || 0) + 1);
      }
    }
  }

  const usage = new Map();
  for (const v of videos) {
    if (v.category_id) usage.set(v.category_id, (usage.get(v.category_id) || 0) + 1);
  }

  res.render("categories", page("categories", "Categories", {
    accountCount: accounts.length,
    categories: store.listCategories().map((c) => ({
      ...c,
      overrideCount: overrides.get(c.id) || 0,
      videoCount: usage.get(c.id) || 0,
    })),
  }));
});

app.get("/settings", (req, res) => {
  res.render("settings", page("settings", "Settings", {
    settings: getSettings(),
    config: {
      videos_per_day: store.getSetting("videos_per_day", "3"),
      tz: store.getSetting("tz", process.env.TZ || "America/New_York"),
      window_start: store.getSetting("window_start", "06:00"),
      window_end: store.getSetting("window_end", "22:00"),
      ai_base_prompt: store.getSetting("ai_base_prompt", ""),
    },
    rotation: store.getSettingJSON("rotation", null),
    next: nextUp(),
    publicUrl: process.env.PUBLIC_URL || "",
    aiModel: process.env.OPENROUTER_MODEL || "",
  }));
});

app.get("/music", (req, res) => {
  let files = [];
  try {
    files = readdirSync(MUSIC_DIR)
      .filter((f) => AUDIO_RE.test(f))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const st = statSync(join(MUSIC_DIR, name));
        return { name, size: st.size, mtime: st.mtimeMs };
      });
  } catch {}

  res.render("music", page("music", "Music", { files }));
});

app.get("/analytics", (req, res) => {
  res.render("analytics", page("analytics", "Analytics"));
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (req.method !== "GET") return next();
  if (req.accepts("html")) return renderMissing(res);
  next();
});

// Full read-only Buffer analytics + latest generated content per account.
app.get("/api/analytics/full", async (req, res) => {
  try {
    const raw = parseInt(req.query.days, 10);
    const days = Number.isFinite(raw) ? Math.min(90, Math.max(1, raw)) : 30;
    const refresh = req.query.refresh === "1";
    res.json(await getFullAnalytics(days, { refresh }));
  } catch (err) {
    console.error("[server] /api/analytics/full error:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Read-only channel analytics (Buffer aggregated metrics + local post stats).
app.get("/api/analytics", async (req, res) => {
  try {
    const raw = parseInt(req.query.days, 10);
    const days = Number.isFinite(raw) ? Math.min(90, Math.max(1, raw)) : 30;
    res.json(await getAnalytics(days));
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// ---------- Music ----------
app.get("/api/music", async (req, res) => {
  try {
    const names = readdirSync(MUSIC_DIR).filter((f) => AUDIO_RE.test(f)).sort((a, b) => a.localeCompare(b));
    const files = [];
    for (const name of names) {
      const st = statSync(join(MUSIC_DIR, name));
      files.push({ name, size: st.size, mtime: st.mtimeMs, duration: await probeDuration(join(MUSIC_DIR, name)) });
    }
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/music/upload", (req, res) => {
  musicUpload.array("files", 20)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const uploaded = req.files || [];
    res.json({ files: uploaded.map((f) => ({ name: f.filename, size: f.size })) });
  });
});

app.put("/api/music/:file", (req, res) => {
  const old = safeMusicName(req.params.file);
  const name = safeMusicName(req.body?.name || "");
  if (!old || !name || !AUDIO_RE.test(old) || !AUDIO_RE.test(name)) return res.status(400).json({ error: "invalid audio file name" });
  if (old === name) return res.json({ ok: true, name });
  const oldPath = join(MUSIC_DIR, old);
  const newPath = join(MUSIC_DIR, name);
  if (!existsSync(oldPath)) return res.status(404).json({ error: "not found" });
  if (existsSync(newPath)) return res.status(400).json({ error: "name already exists" });
  renameSync(oldPath, newPath);
  res.json({ ok: true, name });
});

app.delete("/api/music/:file", (req, res) => {
  const name = safeMusicName(req.params.file);
  if (!name || !AUDIO_RE.test(name)) return res.status(400).json({ error: "invalid audio file name" });
  const p = join(MUSIC_DIR, name);
  if (!existsSync(p)) return res.status(404).json({ error: "not found" });
  unlinkSync(p);
  res.json({ ok: true });
});

// ---------- Accounts ----------
app.get("/api/accounts", (req, res) => {
  res.json(store.listAccounts());
});

app.get("/api/accounts/:id", (req, res) => {
  const acc = store.getAccount(Number(req.params.id));
  if (!acc) return res.status(404).json({ error: "not found" });
  res.json(acc);
});

app.post("/api/accounts", (req, res) => {
  const { name, buffer_token, link } = req.body || {};
  if (!name || !buffer_token) return res.status(400).json({ error: "name and buffer_token required" });
  try {
    res.json(store.createAccount({ name: name.trim(), buffer_token: buffer_token.trim(), link: (link || "").trim() }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/api/accounts/:id", (req, res) => {
  const { name, buffer_token, link } = req.body || {};
  const existing = store.getAccount(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: "not found" });
  const updated = store.updateAccount(existing.id, {
    name: name !== undefined ? name : existing.name,
    buffer_token: buffer_token !== undefined ? buffer_token : existing.buffer_token,
    link: link !== undefined ? link.trim() : existing.link,
  });
  res.json(updated);
});

app.delete("/api/accounts/:id", (req, res) => {
  store.deleteAccount(Number(req.params.id));
  res.json({ ok: true });
});

app.post("/api/accounts/reorder", (req, res) => {
  store.reorderAccounts(req.body?.ids || []);
  res.json({ ok: true });
});

// ---------- Categories ----------
app.get("/api/categories", (req, res) => {
  res.json(store.listCategories());
});

app.post("/api/categories", (req, res) => {
  const { name, default_prompt } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });
  try {
    res.json(store.createCategory({ name: name.trim(), default_prompt: default_prompt || "" }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/api/categories/:id", (req, res) => {
  const { name, default_prompt } = req.body || {};
  const existing = store.getCategory(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: "not found" });
  res.json(store.updateCategory(existing.id, {
    name: name !== undefined ? name : existing.name,
    default_prompt: default_prompt !== undefined ? default_prompt : existing.default_prompt,
  }));
});

app.delete("/api/categories/:id", (req, res) => {
  store.deleteCategory(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Per-account category: prompts + enabled list ----------
app.get("/api/accounts/:id/categories", (req, res) => {
  res.json(store.listAccountCategories(Number(req.params.id)));
});

app.put("/api/accounts/:id/categories", (req, res) => {
  // body: { pairs: [{category_id, prompt}] } — full replace of that account's mapping
  const accountId = Number(req.params.id);
  const pairs = req.body?.pairs || [];
  const normalized = pairs.map((p, i) => ({
    category_id: Number(p.category_id),
    prompt: p.prompt ?? null,
    position: i,
  }));
  store.syncAccountCategories(accountId, normalized);
  res.json(store.listAccountCategories(accountId));
});

app.put("/api/accounts/:id/categories/:categoryId/prompt", (req, res) => {
  const accountId = Number(req.params.id);
  const categoryId = Number(req.params.categoryId);
  store.setAccountPrompt(accountId, categoryId, req.body?.prompt ?? "");
  res.json(store.listAccountCategories(accountId));
});

// ---------- Videos ----------
app.get("/api/videos", (req, res) => {
  const accountId = req.query.account_id ? Number(req.query.account_id) : undefined;
  res.json(store.listVideos({ accountId }));
});

app.get("/api/videos/:id", (req, res) => {
  const v = store.getVideo(Number(req.params.id));
  if (!v) return res.status(404).json({ error: "not found" });
  res.json(v);
});

app.post("/api/videos/:id/retry", async (req, res) => {
  const result = await runPipeline({ videoId: Number(req.params.id) });
  res.json(result);
});

app.delete("/api/videos/:id", (req, res) => {
  const v = store.getVideo(Number(req.params.id));
  if (v && v.video_path) {
    try { unlinkSync(v.video_path); } catch {}
  }
  store.deleteVideo(Number(req.params.id));
  res.json({ ok: true });
});

// Manually run the next rotation slot now (generate -> render -> post to Buffer)
app.post("/api/generate", async (req, res) => {
  try {
    const result = await runPipeline();
    res.json(result);
  } catch (err) {
    console.error("[server] /api/generate error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Settings ----------
app.get("/api/settings", (req, res) => {
  res.json({
    videos_per_day: store.getSetting("videos_per_day", "3"),
    tz: store.getSetting("tz", process.env.TZ || "America/New_York"),
    window_start: store.getSetting("window_start", "06:00"),
    window_end: store.getSetting("window_end", "22:00"),
    ai_base_prompt: store.getSetting("ai_base_prompt", ""),
    schedules: getSettings().schedules,
  });
});

app.put("/api/settings", (req, res) => {
  const body = req.body || {};
  if (body.videos_per_day !== undefined) store.setSetting("videos_per_day", body.videos_per_day);
  if (body.tz !== undefined) store.setSetting("tz", body.tz);
  if (body.window_start !== undefined) store.setSetting("window_start", body.window_start);
  if (body.window_end !== undefined) store.setSetting("window_end", body.window_end);
  if (body.ai_base_prompt !== undefined) store.setSetting("ai_base_prompt", body.ai_base_prompt);
  res.json(getSettings());
});

// Backward-compatible legacy endpoint
app.post("/generate", async (req, res) => {
  try {
    const result = await runPipeline({ videoId: req.body?.videoId });
    res.json(result);
  } catch (err) {
    console.error("[server] /generate error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/delete", (req, res) => {
  const { file } = req.body;
  if (!file) return res.status(400).json({ error: "Missing file name" });
  const safe = file.replace(/[^a-zA-Z0-9._-]/g, "");
  try {
    unlinkSync(join(__dirname, "output", safe));
    res.redirect("/");
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[server] Marketing backend on :${PORT}`);
  if (process.env.DISABLE_SCHEDULER !== "1") {
    startScheduler();
  }
});
