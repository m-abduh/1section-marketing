import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILDER = join(__dirname, "..", "builder");
const COMP_PATH = join(BUILDER, "_render.html");
const MUSIC_DIR = join(__dirname, "..", "music");

function findMusic() {
  if (!existsSync(MUSIC_DIR)) return null;
  const files = readdirSync(MUSIC_DIR).filter(f => /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f));
  return files.length ? join(MUSIC_DIR, files[Math.floor(Math.random() * files.length)]) : null;
}

function renderTemplate(tpl, data) {
  tpl = tpl.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, key, block) => {
    const items = data[key];
    if (!Array.isArray(items)) return "";
    return items.map((item, idx) => {
      let out = block;
      out = out.replace(/\{\{@index\}\}/g, String(idx));
      out = out.replace(/\{\{@index1\}\}/g, String(idx + 1));
      out = out.replace(/\{\{\.\.\/(\w+)\}\}/g, (_, k) => (data[k] != null ? String(data[k]) : ""));
      if (typeof item === "string" || typeof item === "number") {
        return out.replace(/\{\{\.\}\}/g, String(item));
      }
      return out.replace(/\{\{(\w+)\}\}/g, (_, f) => (item[f] != null ? String(item[f]) : ""));
    }).join("");
  });
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => (data[key] != null ? String(data[key]) : ""));
}

// Single "reality card" layout (reference: 30_blok_realita_finance_1section.html)
// One pattern for all content; only theme colors vary (random, readable).
const REALITY_THEMES = [
  { bg: "#12141A", fg: "#F4F1EA", ac: "#F2B84B", muted: "rgba(244,241,234,.66)" },
  { bg: "#F4EFE6", fg: "#1F2A37", ac: "#D9622B", muted: "rgba(31,42,55,.58)" },
  { bg: "#0F4C5C", fg: "#F4F1EA", ac: "#F2B84B", muted: "rgba(244,241,234,.66)" },
  { bg: "#1B2A41", fg: "#F4F1EA", ac: "#7DD3FC", muted: "rgba(244,241,234,.64)" },
  { bg: "#1F2933", fg: "#F9FAFB", ac: "#F59E0B", muted: "rgba(249,250,251,.62)" },
  { bg: "#FAF7F2", fg: "#202124", ac: "#0F766E", muted: "rgba(32,33,36,.55)" },
  { bg: "#201A2B", fg: "#F5F3FF", ac: "#C4B5FD", muted: "rgba(245,243,255,.62)" },
  { bg: "#182418", fg: "#F3F7F0", ac: "#A3E635", muted: "rgba(243,247,240,.62)" },
];

function pickTheme(seedText) {
  return REALITY_THEMES[hashStr(seedText) % REALITY_THEMES.length];
}

// Back-compat export (old block IDs removed; renderer now uses single layout)
export const BLOCK_IDS = ["reality-card"];

const escapeHtml = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escAttr = (s) => escapeHtml(s);

function hashStr(s) {
  let h = 0;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function cleanText(s, max = 140) {
  let t = String(s == null ? "" : s)
    .replace(/[\u2013\u2014]/g, ", ")
    .replace(/\*\*|__|~~|`|#/g, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, (m) => m.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"))
    .replace(/[“”]/g, '"')
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (max && t.length > max) t = t.slice(0, max - 1).replace(/\s+\S*$/, "");
  return t;
}

function oneSentence(s, max = 120) {
  let t = cleanText(s, 0).replace(/\s*\n+\s*/g, " ").trim();
  if (!t) return "";
  const m = t.match(/(.+?[.!?])(\s|$)/);
  if (m) t = m[1].trim();
  t = t.replace(/[;:]+$/g, "").trim();
  if (max && t.length > max) t = t.slice(0, max - 1).replace(/[\s,;:.]+\S*$/, "");
  return t;
}

function fallbackConclusion(main, niche) {
  const plain = cleanText(String(main || "").replace(/\[\[|\]\]/g, ""), 90).replace(/[.!?]+$/g, "").trim();
  if (!plain) return `A quiet ${cleanText(niche, 24) || "life"} reality worth noticing.`;
  const words = plain.split(/\s+/).filter(Boolean);
  const short = words.slice(0, 7).join(" ");
  if (words.length <= 8) return `${plain} is a real pattern.`;
  return `${short} is the real pattern here.`;
}

function emphasizeCore(text) {
  const t = oneSentence(text, 120);
  if (!t) return "";
  if (/\[\[.+?\]\]/.test(t)) return t;
  const words = t.split(/\s+/);
  if (words.length <= 4) return `[[${t}]]`;
  const stop = new Set(["a","an","the","and","or","but","to","of","in","on","for","with","is","are","was","were","be","been","it","its","this","that","as","at","by","from","into","than","then","so","not","no","just","more","most","very","can","could","should","would","will","do","does","did","have","has","had","about","when","what","how","why","all","up","out","if","often","many","feel","feels","feeling","get","gets","getting"]);
  let best = -1;
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i].toLowerCase().replace(/[^a-z']/g, "");
    if (w.length >= 4 && !stop.has(w)) { best = i; break; }
  }
  if (best === -1) best = Math.max(0, words.length - 2);
  const start = Math.max(0, Math.min(best, words.length - 2));
  const before = words.slice(0, start).join(" ");
  const core = words.slice(start, start + 2).join(" ");
  const after = words.slice(start + 2).join(" ");
  return [before, `[[${core}]]`, after].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function splitContrast(text) {
  const t = cleanText(text, 160);
  const parts = t.split(/\s*(?:\?|,| but | yet | instead | while | rather than | not )\s*/i).map(s => cleanText(s, 60)).filter(Boolean);
  if (parts.length >= 2) return [parts[0], parts[parts.length - 1]];
  const words = t.split(/\s+/);
  if (words.length >= 6) {
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  }
  return [t, "Something feels off"];
}

function toRealityMain({ hook, content, caption }) {
  const raw = cleanText(content || hook || caption || "A quiet reality", 180);
  let t = oneSentence(raw, 110) || cleanText(raw, 110) || "A quiet reality";
  // remove "you/your" focus softly where possible
  t = t.replace(/\b[Yy]ou(?:'re| are| were| feel| think| keep| get| have| need| want)?\b/g, "").replace(/\b[Yy]our\b/g, "").replace(/\s{2,}/g, " ").replace(/^[,;:.\s]+|[,;:\s]+$/g, "").trim();
  t = oneSentence(t, 110) || t;
  if (!/[.!?]$/.test(t)) t += ".";
  // ensure a [[highlight]] for the key phrase
  if (!/\[\[.+?\]\]/.test(t)) {
    const words = t.replace(/[.!?]$/,"").split(/\s+/);
    if (words.length <= 4) t = `[[${words.join(" ")}]]${t.match(/[.!?]$/)?.[0] || "."}`;
    else {
      const stop = new Set(["a","an","the","and","or","but","to","of","in","on","for","with","is","are","was","were","be","been","it","its","this","that","as","at","by","from","into","than","then","so","not","just","more","most","very","can","could","should","would","will","do","does","did","have","has","had","when","what","how","why","all","up","out","if","many","feel","feels"]);
      let idx = -1;
      for (let i = words.length - 1; i >= 0; i--) { const w = words[i].toLowerCase().replace(/[^a-z']/g, ""); if (w.length >= 4 && !stop.has(w)) { idx = i; break; } }
      if (idx === -1) idx = Math.max(0, words.length - 3);
      const start = Math.max(0, Math.min(idx, words.length - 3));
      const before = words.slice(0, start).join(" ");
      const core = words.slice(start, start + 3).join(" ");
      const after = words.slice(start + 3).join(" ");
      t = [before, `[[${core}]]`, after].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() + (t.match(/[.!?]$/)?.[0] || ".");
    }
  }
  return t;
}

function normalizeVisual(raw, ctx) {
  // Legacy compatibility: accept old block payloads, but always return single reality-card main text.
  let parsed = raw;
  if (typeof raw === "string") { try { parsed = JSON.parse(raw); } catch { parsed = null; } }
  if (!parsed || typeof parsed !== "object") parsed = {};
  const b = (parsed.block && typeof parsed.block === "object") ? parsed.block : parsed;
  const candidate = b.main || b.text || b.sentence || b.question || b.right || b.actual || b.bottom || b.bubble_b || b.sub || (Array.isArray(b.parts) ? b.parts.join(" + ") : "") || [b.wrong || b.assumed || b.left || b.top, b.right || b.actual || b.bottom].filter(Boolean).join(" ") || ctx.content || ctx.hook || "";
  return { block_id: "reality-card", block: { main: toRealityMain({ hook: ctx.hook, content: candidate || ctx.content, caption: ctx.caption }) } };
}

function formatMoney(v, cur) {
  if (v == null || v === "") return "";
  if (typeof v === "string") {
    const s = v.replace(/\s+/g, " ").trim();
    if (!s) return "";
    if (/free/i.test(s) || /[$€£¥₹]|rp|idr|usd|eur|gbp/i.test(s)) return s;
    const n = Number(s.replace(/,/g, ""));
    if (Number.isFinite(n)) v = n; else return s;
  }
  if (typeof v !== "number" || !Number.isFinite(v)) return "";
  if (v === 0) return "Free";
  const c = String(cur || "USD").toUpperCase();
  const amount = Number.isInteger(v) && Math.abs(v) >= 100 ? v / 100 : v;
  const symbols = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", INR: "₹", IDR: "Rp " };
  const sym = symbols[c];
  const whole = Math.abs(amount - Math.round(amount)) < 0.001;
  const num = whole ? String(Math.round(amount)) : amount.toFixed(2).replace(/\.00$/, "");
  if (sym) return `${sym}${num}`;
  return `${c} ${num}`;
}

function buildPriceBlock({ price, compare_price, discount, currency }) {
  const cleanPrice = (v) => {
    if (v == null || v === "") return "";
    const s = String(v).replace(/\s+/g, " ").trim();
    if (!s) return "";
    if (/free/i.test(s)) return s;
    if (/[$€£¥₹]|rp|idr|usd|eur|gbp/i.test(s)) return s;
    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) ? formatMoney(n, currency) : s;
  };
  const cleanDiscount = (v) => {
    if (v == null || v === "") return "";
    let s = String(v).replace(/\s+/g, " ").trim().replace(/^[-–—]+/, "").trim();
    if (!s) return "";
    if (/save/i.test(s)) {
      const m = s.match(/\d+(?:\.\d+)?%?/);
      if (m) return `${m[0].endsWith("%") ? m[0] : `${m[0]}%`} OFF`;
      s = s.replace(/\bsave\b/gi, "").trim();
    }
    if (/off$/i.test(s)) return s.toUpperCase().replace(/%?\s*OFF$/i, (m) => (/%/.test(m) ? m.toUpperCase() : `% OFF`)).replace(/%%/g, "%");
    if (/off/i.test(s)) { const m = s.match(/\d+(?:\.\d+)?%?/); return m ? `${m[0].endsWith("%") ? m[0] : `${m[0]}%`} OFF` : s; }
    if (/%/.test(s)) { const m = s.match(/\d+(?:\.\d+)?%/); return m ? `${m[0]} OFF` : `${s} OFF`; }
    const n = Number(String(s).replace(/%/g, "").replace(/,/g, ""));
    return Number.isFinite(n) ? `${n}% OFF` : `${s} OFF`;
  };
  const toNum = (v) => {
    if (v == null || v === "") return NaN;
    if (typeof v === "number") return v;
    const n = Number(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  };
  let priceText = cleanPrice(price);
  let comparePriceText = cleanPrice(compare_price);
  let discountText = cleanDiscount(discount);
  const pNum = toNum(price), cNum = toNum(compare_price);
  if (!discountText && Number.isFinite(pNum) && Number.isFinite(cNum) && cNum > pNum) {
    const pct = Math.round((1 - pNum / cNum) * 100);
    if (pct > 0) discountText = `${pct}% OFF`;
  }
  if (Number.isFinite(pNum) && Number.isFinite(cNum) && cNum <= pNum) { comparePriceText = ""; discountText = ""; }
  if (!priceText && !comparePriceText && !discountText && price == null && compare_price == null && discount == null) {
    priceText = "$29"; comparePriceText = "$49"; discountText = "40% OFF";
  }
  const parts = [];
  if (priceText) parts.push(`<span class="sales-price">${escapeHtml(priceText)}</span>`);
  if (comparePriceText) parts.push(`<span class="sales-compare-price">${escapeHtml(comparePriceText)}</span>`);
  if (discountText) parts.push(`<span class="sales-discount">${escapeHtml(discountText)}</span>`);
  return parts.join("");
}

function cleanBenefits(rawPoints, { product_name, niche, hook }) {
  const out = [];
  const seen = new Set();
  const add = (p) => {
    let t = cleanText(p, 80).replace(/^(you(?:'ll| will| can)?\s+(?:get|have|learn|gain|be able to)\s+)/i, "").replace(/^(you(?:'ll| will| can)?\s+)/i, "").replace(/^[,;:.\s]+/, "");
    if (!t) return;
    t = t.charAt(0).toUpperCase() + t.slice(1);
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };
  for (const p of (Array.isArray(rawPoints) ? rawPoints : [])) { add(p); if (out.length >= 3) break; }
  if (out.length < 3) {
    const hint = shortWords(hook || niche || "this", 4, 34);
    for (const f of [
      hint ? `Make sense of ${hint.toLowerCase()}` : "See the real problem clearly",
      "Simple steps for real life",
      product_name ? `A calmer way forward with ${shortWords(product_name, 4, 28)}` : "A calmer next step",
    ]) { add(f); if (out.length >= 3) break; }
  }
  return out.slice(0, 3);
}

export async function renderPost(data, outputPath) {
  const htmlTpl = readFileSync(join(BUILDER, "unified.html"), "utf-8");
  const isSales = Boolean(data.sales_mode || data.mode === "sales" || data.category === "Sales CTA" || data.category === "Sales");
  const nicheLabel = String(data.niche || (String(data.account || "").replace(/^1section\./i, "").split(".").pop()) || "1section").trim();
  const nicheSlug = nicheLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "1section";
  const accountLink = String(data.account_link || `${nicheSlug}.1section.com`).trim();

  let payload;
  if (isSales) {
    const theme = pickTheme(`${accountLink}|sales|${data.product_name || data.hook || ""}|${Date.now()}`);
    const salesHeadline = oneSentence(data.sales_headline || data.hook || data.conclusion || `A clearer way forward for ${nicheLabel}`, 90);
    const salesSub = oneSentence(data.sales_sub || data.recommendation || data.cta || "", 90);
    const points = cleanBenefits(data.product_points || data.product_benefits || [], {
      product_name: data.product_name || "",
      niche: nicheLabel,
      hook: data.hook || salesHeadline,
    });
    payload = {
      mode: "sales",
      theme,
      niche: nicheLabel,
      account_link: accountLink,
      product_name: String(data.product_name || "").trim(),
      product_image: String(data.product_image || "").trim(),
      benefits_title: "Why this E-book?",
      product_points: points,
      sales_headline: salesHeadline,
      sales_sub: salesSub,
      cta_action: oneSentence(data.cta || "", 60),
      link_label: "Get it here",
      conclusion: oneSentence(data.conclusion || "", 120),
      price_block_html: buildPriceBlock({ price: data.price, compare_price: data.compare_price, discount: data.discount, currency: data.currency || "USD" }),
    };
  } else {
    const ctx = {
      hook: cleanText(data.hook || "", 140),
      content: cleanText(data.content || data.content_text || "", 220),
      caption: cleanText(data.caption || "", 180),
      category: String(data.category || "").trim(),
      conclusion: cleanText(data.conclusion || data.takeaway || data.summary || "", 140),
    };
    let visual = data.visual || data.visual_json || data.block;
    if (typeof visual === "string") { try { visual = JSON.parse(visual); } catch { visual = null; } }
    const normalized = normalizeVisual(visual, ctx);
    const theme = pickTheme(`${nicheLabel}|${ctx.category}|${ctx.hook}|${ctx.content}|${data.index ?? ""}`);
    const indexNum = Number.isFinite(Number(data.index)) ? Math.max(1, Math.floor(Number(data.index) + 1)) : 1;
    payload = {
      mode: "content",
      theme,
      niche: nicheLabel,
      category: ctx.category || nicheLabel,
      index: indexNum,
      main: normalized.block.main,
      conclusion: oneSentence(ctx.conclusion || "", 110) || fallbackConclusion(normalized.block.main, nicheLabel),
    };
  }

  let html = renderTemplate(htmlTpl, {
    bg: payload.theme.bg,
    fg: payload.theme.fg,
    ac: payload.theme.ac,
    muted: payload.theme.muted,
    payload_json: JSON.stringify(payload),
  });

  // ensure 20s duration root exists (template has it), audio injection below
  const musicFile = findMusic();
  if (musicFile) {
    const bgmPath = join(BUILDER, "_bgm.mp3");
    await new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", [
        "-y", "-i", musicFile,
        "-t", "20",
        "-af", "afade=t=out:st=16:d=4",
        "-c:a", "libmp3lame", "-q:a", "2",
        bgmPath,
      ]);
      ff.on("close", c => c === 0 ? resolve() : reject(new Error(`ffmpeg exited ${c}`)));
      ff.on("error", reject);
    });
    const audio = `<audio id="bgm" src="./_bgm.mp3" data-start="0" data-duration="20" data-volume="0.3" data-has-audio="true"></audio>`;
    html = html.replace("</div>\n\n<script>", `${audio}\n</div>\n\n<script>`);
    if (!html.includes('id="bgm"')) html = html.replace("</div>\n</div>", `${audio}\n</div>\n</div>`);
  }

  writeFileSync(COMP_PATH, html, "utf-8");

  return new Promise((resolve, reject) => {
    const args = ["hyperframes", "render", BUILDER, "-c", "_render.html", "-o", outputPath, "--quality", "draft"];
    const child = spawn("npx", args);
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("render timed out")); }, 300000);
    child.stdout.on("data", d => process.stdout.write(d));
    child.stderr.on("data", d => process.stderr.write(d));
    child.on("close", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`render exited ${code}`)); });
    child.on("error", err => { clearTimeout(timer); reject(err); });
  });
}
