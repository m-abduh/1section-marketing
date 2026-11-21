import { store } from "../db.mjs";
import { DEFAULT_BASE_PROMPT } from "./base-prompt.mjs";
import { topicsForAccount } from "./niche-topics.mjs";
import { formatNewsForPrompt } from "./news.mjs";

export { DEFAULT_BASE_PROMPT };

const MODEL = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free";

function loadBasePrompt() {
  const saved = store ? store.getSetting("ai_base_prompt", "") : "";
  return saved && saved.trim() ? saved.trim() : DEFAULT_BASE_PROMPT;
}

function isRetryable(e) {
  const m = String((e && e.message) || "");
  return (
    e?.cause?.code === "EAI_AGAIN" ||
    e?.code === "EAI_AGAIN" ||
    e?.type === "system" ||
    m.includes("fetch failed") ||
    /^OpenRouter error 5\d\d/.test(m) ||
    m.includes("temporarily overloaded") ||
    m.startsWith("OpenRouter returned empty response")
  );
}

async function askAI(prompt, retries = 3) {
  const key = process.env.OPENROUTER_KEY;
  if (!key) throw new Error("OPENROUTER_KEY not set");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      signal: controller.signal,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (data.error || !content) {
      throw new Error(`OpenRouter returned empty response: ${JSON.stringify(data)}`);
    }
    return content;
  } catch (e) {
    if (retries > 0 && isRetryable(e)) {
      const delay = Math.min(30000, 10000 + (3 - retries) * 10000);
      console.log(`OpenRouter transient error, retrying in ${delay / 1000}s... (${retries} left)`);
      await new Promise(r => setTimeout(r, delay));
      return askAI(prompt, retries - 1);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

function extractJSON(text) {
  let cleaned = String(text || "").trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in AI response");
  return JSON.parse(cleaned.slice(start, end + 1));
}

const OUTPUT_CONTRACT = `FINAL OUTPUT CONTRACT (overrides older format):
Return ONLY raw JSON (no markdown fences) with keys: "hook","content","visual","caption","conclusion","cta","recommendation","product_points","source".
- "content": ONE short sentence (real felt problem, psychological, relatable, no "you/your" focus, no intro/CTA). Under ~18 words.
- "visual": {"block_id":"reality-card","block":{"main":"ONE sentence with [[highlight]] around 2-5 core words"}}. Use only this single layout for all regular content.
- "hook": 2-6 word label (brand/niche/context), not a sentence.
- "caption": 20-35 words, human, no hashtags, no @mentions.
- "conclusion": ONE clear plain-text sentence (max ~14 words) that explains the content's point/takeaway for the footer. It must make the content clearer, not repeat it verbatim.
- "cta": "" (empty). "recommendation": "" (empty). "product_points": [] (empty) for regular content.
- "source": news outlet name only if used, else "".
No intro, no CTA, no sales copy in content/visual. Stay true to product, niche, category.`;

function productBrief(product) {
  if (!product) return "";
  const lines = [`Product (relate the felt problem to this product's real context; do not sell in content): ${product.name}`];
  if (product.summary) lines.push(`Summary: ${String(product.summary).trim()}`);
  if (product.description) lines.push(`Description: ${String(product.description).trim()}`);
  if (product.outcome) lines.push(`Outcome: ${String(product.outcome).trim()}`);
  if (product.audience) lines.push(`Audience: ${String(product.audience).trim()}`);
  const feats = Array.isArray(product.features) ? product.features.filter(Boolean) : [];
  if (feats.length) lines.push(`Key features: ${feats.join("; ")}`);
  const learns = Array.isArray(product.learnings) ? product.learnings.filter(Boolean) : [];
  if (learns.length) lines.push(`What they learn: ${learns.join("; ")}`);
  return lines.join("\n");
}

export async function generatePost({ accountName, categoryName, prompt, product, newsItems = [], salesMode = false }) {
  if (salesMode) {
    const name = String(product?.name || "this guide").trim() || "this guide";
    const niche = String(accountName || "1section").replace(/^1section\./i, "") || "1section";
    const learnings = Array.isArray(product?.learnings) ? product.learnings.filter(Boolean).map(s => String(s).trim()).slice(0, 3) : [];
    const fallbackPts = [
      `Clear guidance for real ${niche} challenges`,
      "Simple steps that fit daily life",
      "Calm progress that feels doable",
    ];
    const points = (learnings.length ? learnings : fallbackPts).slice(0, 3);
    const hook = `Get ${name}`;
    const conclusion = `A clearer path for ${niche} starts here.`;
    const cta = "Get the guide in bio";
    const recommendation = `A simple guide to help with ${niche}, one step at a time.`;
    const content = `Sales CTA for ${name}`;
    return {
      hook,
      content,
      caption: `${name} for ${niche}. Link in bio. #1section`,
      conclusion,
      cta,
      recommendation,
      product_points: points,
      visual: null,
      sales_mode: true,
      source: "",
      content_json: JSON.stringify({ hook, content, conclusion, cta, recommendation, product_points: points, sales_mode: true }),
    };
  }

  const base = loadBasePrompt();
  const src = (prompt && prompt.trim())
    ? prompt.trim()
    : `The topic is up to you, pick something timely and relevant to ${categoryName}.`;

  const { niche, topics } = topicsForAccount(accountName);
  const nicheLabel = niche;
  const topicBlock = topics.length
    ? `Niche: ${nicheLabel}
NICHE TOPICS (choose exactly ONE; build the whole post around it; do not mix topics or switch niches):
${topics.map((t) => `- ${t}`).join("\n")}

`
    : `Niche: ${nicheLabel}\n\n`;

  const prod = productBrief(product);
  const productBlock = prod
    ? `PRODUCT CONTEXT (content must relate to this product's real problem space, niche, and category; do not sell, no CTA):\n${prod}\n\n`
    : "";

  const newsBlockRaw = formatNewsForPrompt(Array.isArray(newsItems) ? newsItems : []);
  const newsBlock = newsBlockRaw
    ? `${newsBlockRaw}\n\nTASK: If useful, ground the felt problem in one current trusted item that fits this niche/product context. Keep it accurate and human. If none fit, use a real current problem in this niche.\n\n`
    : "";

  const userPrompt = `Video channel name: ${accountName}
${topicBlock}${productBlock}${newsBlock}Category: ${categoryName}

SOURCE INSTRUCTIONS (follow first, aligned to base rules):
${src}

${base}

${OUTPUT_CONTRACT}`;

  const text = await askAI(userPrompt);
  const parsed = extractJSON(text);

  const content = Array.isArray(parsed.content)
    ? oneLine(parsed.content.join(" "))
    : oneLine(String(parsed.content || ""));
  const hook = oneLine(String(parsed.hook || parsed.title || "")).replace(/[.]+$/g, "").trim();
  const conclusion = oneLine(String(parsed.conclusion || parsed.takeaway || parsed.summary || ""));
  const captionRaw = oneLine(String(parsed.caption || parsed.follow_call || "")).replace(/#\S+/g, "").replace(/@\S+/g, "").trim();
  const caption = (captionRaw || content || hook) + " #1section";

  let visual = parsed.visual || null;
  if (!visual && parsed.block_id) visual = { block_id: parsed.block_id, block: parsed.block || parsed };

  let source = String(parsed.source || parsed.news_source || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[\u2013\u2014]/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  if (!source && Array.isArray(newsItems) && newsItems.length) {
    const top = newsItems.find((it) => it && it.source) || newsItems[0];
    source = String((top && top.source) || "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  }

  return {
    hook,
    content,
    caption,
    conclusion,
    cta: "",
    recommendation: "",
    product_points: [],
    visual,
    sales_mode: false,
    source,
    content_json: JSON.stringify({ ...parsed, content, hook, cta: "", recommendation: "", product_points: [] }),
  };
}

function oneLine(s) {
  return String(s == null ? "" : s).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}
