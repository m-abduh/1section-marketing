import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { marked } from "marked";

marked.setOptions({ breaks: true });

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
      // Access parent/root data from inside an each block.
      out = out.replace(/\{\{\.\.\/(\w+)\}\}/g, (_, k) =>
        data[k] != null ? String(data[k]) : ""
      );
      if (typeof item === "string" || typeof item === "number") {
        return out.replace(/\{\{\.\}\}/g, String(item));
      }
      return out.replace(/\{\{(\w+)\}\}/g, (_, f) =>
        item[f] != null ? String(item[f]) : ""
      );
    }).join("");
  });
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    data[key] != null ? String(data[key]) : ""
  );
}

// Dark backgrounds - deep base tones; the template layers real linear gradients on top.
const PAPER_FILLS = [
  "#0b0d12",
  "#0e1118",
  "#10131b",
  "#0d1016",
  "#121621",
  "#0f1219",
  "#11141c",
  "#0c0f15",
];

// Accent-only palettes for a dark surface: brighter accent + soft tinted fills/glows.
const ACCENT_PALETTES = [
  { accent: "#ff7a45", ink: "#ff9a70", soft: "rgba(255,122,69,.14)", glow: "rgba(255,122,69,.22)", ctaGlow: "rgba(255,122,69,.32)" },
  { accent: "#2dd4bf", ink: "#5eead4", soft: "rgba(45,212,191,.14)", glow: "rgba(45,212,191,.20)", ctaGlow: "rgba(45,212,191,.30)" },
  { accent: "#818cf8", ink: "#a5b4fc", soft: "rgba(129,140,248,.14)", glow: "rgba(129,140,248,.22)", ctaGlow: "rgba(129,140,248,.32)" },
  { accent: "#f472b6", ink: "#f9a8d4", soft: "rgba(244,114,182,.14)", glow: "rgba(244,114,182,.22)", ctaGlow: "rgba(244,114,182,.32)" },
  { accent: "#a3e635", ink: "#bef264", soft: "rgba(163,230,53,.14)", glow: "rgba(163,230,53,.18)", ctaGlow: "rgba(163,230,53,.28)" },
  { accent: "#fbbf24", ink: "#fcd34d", soft: "rgba(251,191,36,.14)", glow: "rgba(251,191,36,.20)", ctaGlow: "rgba(251,191,36,.30)" },
];

const escapeHtml = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Try to fit the rendered content card into the 1350px slide by scaling it
// down when it would otherwise overflow. Keeps every item on one frame.
const FIT_SCRIPT = `
const __fit=()=>{const el=document.querySelector('.content-card')||document.querySelector('.md');if(!el)return;const body=document.querySelector('.body');const cs=getComputedStyle(body);const avail=body.clientHeight-(parseFloat(cs.paddingTop)||0)-(parseFloat(cs.paddingBottom)||0);const h=el.offsetHeight;if(h>avail&&h>0){el.style.transform='scale('+(avail/h)+')';}};
try{__fit();}catch(e){}
if(document.fonts&&document.fonts.ready){document.fonts.ready.then(()=>{try{__fit();}catch(e){}});}
`;

// Build the single full README-style markdown body for the slide:
//   ## {hook}\n\n{content body}
// No H1 banner or numeral is shown: the hook/headline and its discussion
// render as one continuous, focus-on-content markdown document.
export function buildMarkdown({ hook, body }) {
  return `## ${(hook || "").trim()}\n\n` + (body || "").trim();
}

// Arrow chains are the strongest "sequence" shape on a slide, but as plain
// paragraphs they read as ordinary left-aligned text. Detect the two shapes the
// prompts use and wrap them in a centered chain block:
//   Cut one expense ↓ / Automate the gap ↓ / Buy the asset      (vertical)
//   Earn → Automate / Automate → Invest / Invest → Ignore noise (horizontal)
const CHAIN_SKIP = /^\s*(#{1,6}\s|[-*+]\s|\d+\.\s|\||>|```|<)/;

export function chainifyMarkdown(md) {
  const out = [];
  let buf = [];
  let inFence = false;

  const strip = (l) => l.replace(/↓\s*$/, "").trim();
  const isArrowLine = (l) => l.includes("→") && !/[.!?]\s*$/.test(l);

  // Chain steps render independently, so emphasis that wraps a whole step (or
  // opens on one chain line and closes on another) gets cut in half by the
  // split. Detect it, strip the markers and re-apply them per step, otherwise
  // literal ** / * end up printed on the slide.
  const cleanStep = (raw) => {
    let text = strip(raw);
    let style = null;
    const set = (s) => {
      style = style || s;
    };
    const outer = text.match(/^(\*\*|\*)([\s\S]+?)\1$/);
    if (outer && !outer[2].includes(outer[1])) {
      set(outer[1] === "**" ? "strong" : "em");
      text = outer[2];
    } else {
      if (text.startsWith("**")) {
        set("strong");
        text = text.slice(2);
      } else if (text.startsWith("*")) {
        set("em");
        text = text.slice(1);
      }
      if (text.endsWith("**")) {
        set("strong");
        text = text.slice(0, -2);
      } else if (text.endsWith("*")) {
        set("em");
        text = text.slice(0, -1);
      }
    }
    return { text: text.trim(), style };
  };

  const renderStep = (raw) => {
    const { text, style } = cleanStep(raw);
    const html = marked.parseInline(text);
    if (style === "strong") return `<strong>${html}</strong>`;
    if (style === "em") return `<em>${html}</em>`;
    return html;
  };

  // A single block (blank-line separated) can mix prose with one or more
  // chains. Split it into ordered parts, then render prose and chains apart.
  const splitBlock = (block) => {
    const parts = [];
    let i = 0;
    while (i < block.length) {
      const line = block[i];
      // Horizontal rules must stand alone: `text\n---` makes markdown turn the
      // line above into a setext <h2>, which blew up whole slides.
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        parts.push("---");
        i++;
        continue;
      }
      const chainable = !CHAIN_SKIP.test(line) && line.length <= 72;
      // Arrow on its own line: "Cut the noise \n ↓ \n Ship one thing".
      // → keeps everything on one row; ↓ stacks the steps vertically.
      const arrowOnly = (l) => (l || "").trim() === "↓" || (l || "").trim() === "→";
      if (chainable && !arrowOnly(line) && arrowOnly(block[i + 1])) {
        const arrow = block[i + 1].trim();
        const steps = [line.trim()];
        let j = i + 1;
        while (
          j < block.length &&
          (block[j] || "").trim() === arrow &&
          block[j + 1] !== undefined &&
          !arrowOnly(block[j + 1]) &&
          !CHAIN_SKIP.test(block[j + 1])
        ) {
          steps.push(block[j + 1].trim());
          j += 2;
        }
        if (steps.length >= 2) {
          if (arrow === "↓") parts.push({ kind: "chain-v", steps });
          else parts.push({ kind: "chain-h", rows: [steps] });
          i = j;
          continue;
        }
      }
      // Down-arrow run: consecutive lines ending in ↓. Lines that also contain
      // → are parallel rows ("No Roth → Backdoor ↓"), so they fall through to
      // the horizontal handler instead of becoming vertical steps.
      if (chainable && /↓\s*$/.test(line) && !line.includes("→")) {
        let j = i;
        while (
          j < block.length &&
          /↓\s*$/.test(block[j]) &&
          !block[j].includes("→") &&
          !CHAIN_SKIP.test(block[j])
        ) {
          j++;
        }
        const steps = block.slice(i, j).map(strip).filter(Boolean);
        // A short trailing line with no sentence punctuation reads as the last
        // step; a full sentence after the run is the verdict and stays prose.
        if (
          j < block.length &&
          j === block.length - 1 &&
          !block[j].includes("→") &&
          !/[.!?]\s*$/.test(block[j]) &&
          block[j].trim().length <= 48
        ) {
          steps.push(strip(block[j]));
          j++;
        }
        if (steps.length >= 2) {
          parts.push({ kind: "chain-v", steps });
          i = j;
          continue;
        }
      }
      // One-line down chain: "Plan ↓ Build ↓ Show ↓ Learn".
      if (chainable && (line.match(/↓/g) || []).length >= 2) {
        parts.push({ kind: "chain-v", steps: line.split("↓").map(strip).filter(Boolean) });
        i++;
        continue;
      }
      // Right-arrow run: consecutive short lines that read as a flow. A trailing
      // ↓ is a separator too ("A → B → C ↓"), so drop it before splitting or it
      // ends up printed inside the last step of the card.
      if (chainable && isArrowLine(line) && line.split("→").length <= 6) {
        let j = i;
        while (
          j < block.length &&
          isArrowLine(block[j]) &&
          !CHAIN_SKIP.test(block[j]) &&
          block[j].split("→").length <= 6
        ) {
          j++;
        }
        const rows = block
          .slice(i, j)
          .map((l) => strip(l).split("→").map((s) => s.trim()).filter(Boolean))
          .filter((r) => r.length >= 2);
        if (rows.length) {
          parts.push({ kind: "chain-h", rows });
          i = j;
          continue;
        }
      }
      // Prose line: keep the original markdown so inline styling survives.
      const last = parts[parts.length - 1];
      if (typeof last === "string" && last !== "---") parts[parts.length - 1] = last + "\n" + line;
      else parts.push(line);
      i++;
    }
    return parts;
  };

  const chainHtml = (part) => {
    if (part.kind === "chain-v") {
      const inner = [];
      part.steps.forEach((text, i) => {
        inner.push(`<div class="chain-step">${renderStep(text)}</div>`);
        if (i < part.steps.length - 1) inner.push('<div class="chain-arrow">↓</div>');
      });
      return `<div class="chain chain-v">\n${inner.join("\n")}\n</div>`;
    }
    const rows = part.rows.map((steps) => {
      const inner = steps
        .map((s) => `<span class="chain-step">${renderStep(s)}</span>`)
        .join('<span class="chain-arrow">→</span>');
      return `<div class="chain-row">${inner}</div>`;
    });
    return `<div class="chain chain-h">\n${rows.join("\n")}\n</div>`;
  };

  const flush = () => {
    if (!buf.length) return;
    const block = buf;
    buf = [];
    const parts = splitBlock(block);
    if (!parts) {
      out.push(...block);
      return;
    }
    out.push(parts.map((p) => (typeof p === "string" ? p : chainHtml(p))).join("\n\n"));
  };

  for (const line of md.split("\n")) {
    if (/^\s*```/.test(line)) {
      flush();
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (line.trim() === "") {
      flush();
      out.push(line);
      continue;
    }
    buf.push(line);
  }
  flush();
  return out.join("\n");
}
// Post-process marked output for what the slide can actually show:
// - GFM task lists: marked emits disabled <input type=checkbox>, which the
//   renderer strips (inputs never survive to the frame) -> swap in spans so
//   the item still reads as checked/unchecked.
export function normalizeMarkdownHtml(html) {
  let out = html.replace(/<input[^>]*type="checkbox"[^>]*>/gi, (tag) =>
    /checked/i.test(tag)
      ? '<span class="task task-done">✓</span>'
      : '<span class="task"></span>'
  );
  out = out.replace(/<input\b[^>]*>/gi, "");
  // Mark the list that holds tasks so CSS can drop the bullet and align boxes.
  out = out.replace(/<ul>(\s*<li>\s*<span class="task)/g, '<ul class="tasks">$1');
  // Safety net: literal ** must never reach the frame. Chain splitting or an
  // unbalanced emphasis can leave stray pairs behind; keep code untouched.
  out = out.replace(/(<pre[\s\S]*?<\/pre>)|(<code[\s\S]*?<\/code>)|(\*\*)/g, (m, pre, code) => pre || code || "");
  return out;
}

export async function renderPost(
  { hook, content, category, account, account_link, content_text, conclusion, cta, recommendation, source, product_name, product_image, product_features, product_learnings, product_outcome, product_points, niche, index, price, compare_price, discount, currency },
  outputPath
) {
  const htmlTpl = readFileSync(join(BUILDER, "unified.html"), "utf-8");
  const bg = PAPER_FILLS[Math.floor(Math.random() * PAPER_FILLS.length)];
  const accentPalette = ACCENT_PALETTES[Math.floor(Math.random() * ACCENT_PALETTES.length)];

  const bodyText = Array.isArray(content)
    ? content.join("\n")
    : (content_text || content || "");
  let md = buildMarkdown({ hook, body: bodyText });
  // Repair an unterminated **bold** only when the whole body is unbalanced.
  // Doing it per line used to corrupt multi-line bold blocks by adding an
  // extra closing "**" to the first line.
  const boldMarks = (md.match(/\*\*/g) || []).length;
  if (boldMarks % 2 === 1) {
    md = md.replace(/^(\*\*[^*\n]+)$/gm, (line) => (line.endsWith("**") ? line : line + "**"));
  }
  const bodyMd = md.replace(/^##[^\n]*\n+/, "");
  const htmlContent = normalizeMarkdownHtml(marked.parse(chainifyMarkdown(bodyMd)));
  const cleanSource = String(source || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[\u2013\u2014]/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  const sourceLabel = cleanSource ? `Source: ${cleanSource}` : "";
  const hookHtml = marked.parseInline(escapeHtml(String(hook || "").trim()));
  const link = String(account_link || "");
  const dot = link.indexOf(".");
  const accountLinkHead = dot > 0 ? link.slice(0, dot) : link;
  const accountLinkTail = dot > 0 ? link.slice(dot) : "";
  const accountHandle = String(account || "").replace(/^@/, "").replace(/^1section\./i, "");
  const accountInitial = (accountLinkHead || accountHandle || "?").trim().charAt(0).toUpperCase();
  const nicheLabel = String(niche || accountLinkHead || accountHandle || "1section").trim();
  const nicheSlug = String(nicheLabel || accountHandle || "1section")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "1section";
  const accountHandleDisplay = `1section.${nicheSlug}`;

  // The CTA card closes the video with the takeaway. If the AI did not return a
  // conclusion (older stored posts), fall back to the hook so the card is never blank.
  // Keep it to one clean sentence: 5 seconds is short, so anything longer gets trimmed.
  const cleanConclusion = (value) => {
    let text = String(value || "")
      .replace(/\*\*|__|~~|`/g, "")
      .replace(/\s+/g, " ")
      .trim();
    text = text.split(/(?<=[.!?])\s+/)[0] || text;
    if (text.length > 150) text = text.slice(0, 147).replace(/\s+\S*$/, "") + "…";
    return text;
  };
  const conclusionText = cleanConclusion(conclusion) || String(hook || "").trim();

  const cleanCta = (value) => {
    let text = String(value || "")
      .replace(/\*\*|__|~~|`/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 120) text = text.slice(0, 117).replace(/\s+\S*$/, "") + "…";
    return text;
  };
  const ctaAction = cleanCta(cta) || "Link in bio";
  const productName = String(product_name || "").trim();
  const productImage = String(product_image || "").trim();
  const escAttr = (s) =>
    String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const formatMoney = (v, cur) => {
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
    // Heuristic: integer amounts >= 100 from payment-style fields are commonly cents.
    const amount = Number.isInteger(v) && Math.abs(v) >= 100 ? v / 100 : v;
    const symbols = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", INR: "₹", IDR: "Rp " };
    const sym = symbols[c];
    const whole = Math.abs(amount - Math.round(amount)) < 0.001;
    const num = whole ? String(Math.round(amount)) : amount.toFixed(2).replace(/\.00$/, "");
    if (sym) return `${sym}${num}`;
    return `${c} ${num}`;
  };
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
    let s = String(v).replace(/\s+/g, " ").trim();
    if (!s) return "";
    s = s.replace(/^[-–—]+/, "").trim();
    if (!s) return "";
    if (/save/i.test(s)) {
      const m = s.match(/\d+(?:\.\d+)?%?/);
      if (m) {
        const n = m[0].endsWith("%") ? m[0] : `${m[0]}%`;
        return `${n} OFF`;
      }
      s = s.replace(/\bsave\b/gi, "").trim();
    }
    if (/off$/i.test(s)) return s.toUpperCase().replace(/%?\s*OFF$/i, (m) => (/%/.test(m) ? m.toUpperCase() : `% OFF`)).replace(/%%/g, "%");
    if (/off/i.test(s)) {
      const m = s.match(/\d+(?:\.\d+)?%?/);
      return m ? `${m[0].endsWith("%") ? m[0] : `${m[0]}%`} OFF` : s;
    }
    if (/%/.test(s)) {
      const m = s.match(/\d+(?:\.\d+)?%/);
      return m ? `${m[0]} OFF` : `${s} OFF`;
    }
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
  // Hide redundant compare/discount when there is no real discount (e.g. free vs $0 compare)
  if (Number.isFinite(pNum) && Number.isFinite(cNum) && cNum <= pNum) {
    comparePriceText = "";
    discountText = "";
  }
  // Fallback sample pricing only when no product/pricing data was provided at all
  if (!priceText && !comparePriceText && !discountText && price == null && compare_price == null && discount == null) {
    priceText = "$29";
    comparePriceText = "$49";
    discountText = "40% OFF";
  }
  const priceParts = [];
  if (priceText) priceParts.push(`<span class="cta-price">${escapeHtml(priceText)}</span>`);
  if (comparePriceText) priceParts.push(`<span class="cta-compare-price">${escapeHtml(comparePriceText)}</span>`);
  if (discountText) priceParts.push(`<span class="cta-discount">${escapeHtml(discountText)}</span>`);
  const priceBlockHtml = priceParts.length ? `<div class="cta-price-block">${priceParts.join("")}</div>` : "";

  // Dynamic, emotional-but-relaxed recommendation (AI-generated per post); fallback is soft & human.
  const cleanRec = (value) => {
    let t = String(value || "")
      .replace(/[\u2013\u2014]/g, ", ")
      .replace(/\s+/g, " ")
      .replace(/!+/g, ".")
      .trim();
    if (t.length > 130) t = t.slice(0, 127).replace(/[\s,;:.]+\S*$/, "");
    return t;
  };
  const softSolution = cleanRec(recommendation) ||
    (productName ? `If this feels familiar, ${productName} can bring a little calm and clarity to it.` : "If this feels familiar, there is a gentle place to find some clarity in the link below.");

  // Points shown to the right of the book: BENEFITS/what you get (not features),
  // tailored to THIS post. Prefer AI-generated points (dynamic, content-specific),
  // then fall back to product outcome/learnings.
  const toPointList = (v) => {
    if (Array.isArray(v)) return v.map((x) => String(x || "").trim()).filter(Boolean);
    if (typeof v === "string" && v.trim()) {
      try {
        const p = JSON.parse(v);
        if (Array.isArray(p)) return p.map((x) => String(x || "").trim()).filter(Boolean);
      } catch {}
    }
    return [];
  };
  const cleanBenefit = (s) => {
    let t = String(s || "")
      .replace(/[\u2013\u2014]/g, ", ")
      .replace(/\s+-\s+/g, ", ")
      .replace(/\s+/g, " ")
      .trim();
    // drop mechanical "You get/You will/You can" openers -> natural phrasing
    t = t.replace(/^(you(?:'ll| will| can)?\s+(?:get|have|learn|gain|be able to)\s+)/i, "");
    t = t.replace(/^(you(?:'ll| will| can)?\s+)/i, "");
    t = t.replace(/^[,;:.\s]+/, "");
    if (!t) return "";
    t = t.charAt(0).toUpperCase() + t.slice(1);
    if (t.length > 80) t = t.slice(0, 77).replace(/[\s,;:.]+\S*$/, "");
    return t;
  };
  const aiBenefits = toPointList(product_points);
  const rawBenefits = aiBenefits.length
    ? aiBenefits
    : [
        ...(product_outcome ? [String(product_outcome).trim()] : []),
        ...toPointList(product_learnings),
      ].filter(Boolean);
  const renderedPoints = [];
  const seen = new Set();
  const addPoint = (text) => {
    const b = cleanBenefit(text);
    const key = b.toLowerCase();
    if (!b || seen.has(key)) return;
    seen.add(key);
    renderedPoints.push(b);
  };
  for (const p of rawBenefits) { addPoint(p); if (renderedPoints.length >= 3) break; }
  // Fallback: natural benefits framed around the post's problem (never product features).
  if (renderedPoints.length < 3) {
    const nicheWord = String(nicheLabel || "this").trim().toLowerCase();
    const hookHint = String(hook || "").replace(/[\u2013\u2014]/g, ", ").replace(/\s+/g, " ").trim();
    const shortHook = hookHint.length > 44 ? hookHint.slice(0, 41).replace(/\s+\S*$/, "") : hookHint;
    const fallbacks = [
      shortHook ? `See ${shortHook} with fresh clarity` : `See this ${nicheWord} challenge with fresh clarity`,
      `Easy steps that fit into real life`,
      `A calm sense of what to do next`,
    ];
    for (const f of fallbacks) { addPoint(f); if (renderedPoints.length >= 3) break; }
  }
  renderedPoints.length = Math.min(renderedPoints.length, 3);
  const benefitsTitle = "Why this E-book?";

  const data = {
    hook: hookHtml,
    content: htmlContent,
    source: escapeHtml(sourceLabel),
    category: escapeHtml(category || ""),
    account: escapeHtml(account || ""),
    account_handle: escapeHtml(accountHandleDisplay),
    account_initial: escapeHtml(accountInitial),
    account_link: escapeHtml(link),
    account_link_head: escapeHtml(accountLinkHead),
    account_link_tail: escapeHtml(accountLinkTail),
    niche: escapeHtml(nicheLabel),
    conclusion: escapeHtml(conclusionText),
    cta_action: escapeHtml(ctaAction),
    product_name: escapeHtml(productName),
    benefits_title: escapeHtml(benefitsTitle),
    // Keep image URL usable in src (escape quotes/angles; preserve & in query).
    product_image: escAttr(productImage),
    // Conditionals for the template engine (renders block when array is non-empty).
    _product_has_image: productImage ? [1] : [],
    _product_no_image: productImage ? [] : [1],
    product_points: renderedPoints.map((t) => ({ text: escapeHtml(t) })),
    soft_solution: escapeHtml(softSolution),
    price_block: priceBlockHtml,
    bg_fill: bg,
    accent: accentPalette.accent,
    accent_ink: accentPalette.ink,
    accent_soft: accentPalette.soft,
    accent_glow: accentPalette.glow,
    accent_cta_glow: accentPalette.ctaGlow,
  };
  let html = renderTemplate(htmlTpl, data);

  // Fit-to-frame: scale the markdown wrapper down only when it overflows.
  html = html.replace(
    "window.__timelines=window.__timelines||{}",
    FIT_SCRIPT + "\nwindow.__timelines=window.__timelines||{}"
  );

  if (html.includes('<script id="cd"')) {
    html = html.replace(/<script id="cd"[^>]*>[\s\S]*?<\/script>\s*/g, "");
  }

  const musicFile = findMusic();
  if (musicFile) {
    const bgmPath = join(BUILDER, "_bgm.mp3");
    await new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", [
        "-y", "-i", musicFile,
        "-t", "20",
        "-af", "afade=t=out:st=16:d=4",
        "-c:a", "libmp3lame", "-q:a", "2",
        bgmPath
      ]);
      ff.on("close", c => c === 0 ? resolve() : reject(new Error(`ffmpeg exited ${c}`)));
      ff.on("error", reject);
    });
    const audio = `<audio id="bgm" src="./_bgm.mp3" data-start="0" data-duration="20" data-volume="0.3" data-has-audio="true"></audio>`;
    html = html.replace("</div>", audio + "\n</div>");
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
