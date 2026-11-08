import { store } from "../db.mjs";
import { DEFAULT_BASE_PROMPT } from "./base-prompt.mjs";
import { topicsForAccount } from "./niche-topics.mjs";

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
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in AI response");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// The base prompt is stored in the DB and may be an older revision. Append the
// final output contract on every request so "conclusion" is always generated,
// regardless of which prompt revision is saved.
const OUTPUT_CONTRACT = `FINAL OUTPUT CONTRACT (overrides any earlier output-format instruction):
Return ONLY raw JSON (no markdown fences) with exactly these keys: "hook", "content", "caption", "conclusion", "cta".
"hook" = 7-14 words: a real-world problem + its actual cause, in second person (you/your). True and observable. Do not force a number, dollar amount, percentage, or time span into the hook. No third-person labels, invented stats, studies, quotes, names, dates, events, or fake scenarios. No contrived shock bait.
"content" = the Markdown story body: 2-4 short beats showing how the cause creates the problem, in second person and short sentences. It MUST include at least one visual block (one-level blockquote, compact table, list/checklist, arrow chain, or formula); plain paragraphs alone are not enough. Do not put the fix, tip, or next step in content; it belongs in cta. Under about 45 words (table cells excluded).
"cta" = ONE short imperative (max 10 words) naming the specific behavior that caused the problem and the replacement behavior to start. Do not use a vague awareness gap such as "stop ignoring X". Plain text, no markdown, no hashtags, no @mentions, no emojis, no URL or domain. It is printed next to the account link.
"conclusion" = ONE short, plain-text sentence (max 18 words) stating the takeaway. Keep it proportional to the story; do not introduce a new number or scale the body did not establish. No markdown, no hashtags, no @mentions, no emojis, and do not repeat the hook word-for-word. It is printed on the dark end card under "THE BOTTOM LINE".`;

function productBrief(product) {
  if (!product) return "";
  const lines = [`Product (base the post on this product's problem/solution; stay true to it): ${product.name}`];
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

/**
 * Generate post content (copywriting + caption) for an account+category.
 * @param {object} opts
 * @param {string} opts.accountName  Buffer account name
 * @param {string} opts.categoryName  Category label (e.g. "stat", "story")
 * @param {string} opts.prompt  Per-account-category AI prompt (customizable)
 * @param {object} [opts.product]  Master-DB product to base the content on
 * @returns {{hook, content, caption, conclusion, cta, content_json}}
 */
export async function generatePost({ accountName, categoryName, prompt, product }) {
  const base = loadBasePrompt();

  const src = (prompt && prompt.trim())
    ? prompt.trim()
    : `The topic is up to you — pick something timely and relevant to ${categoryName}.`;

  const { niche, topics } = topicsForAccount(accountName);
  const nicheLabel = (product && product.nicheId) ? niche : niche;
  const topicBlock = topics.length
    ? `Niche: ${nicheLabel}
NICHE TOPICS (choose exactly ONE; build the whole post around it; do not mix topics or switch niches):
${topics.map((t) => `- ${t}`).join("\n")}

`
    : `Niche: ${nicheLabel}\n\n`;

  const prod = productBrief(product);
  const productBlock = prod
    ? `PRODUCT SOURCE (required): Base this post on the real problem this product addresses and the outcome it enables. Do NOT invent product claims; stay within the facts below.\n${prod}\n\n`
    : "";

  const userPrompt = `Video channel name: ${accountName}
${topicBlock}${productBlock}Category: ${categoryName}

SOURCE INSTRUCTIONS (these define the content style, structure, and format — follow them first):
${src}

${base}

${OUTPUT_CONTRACT}`;

  const text = await askAI(userPrompt);
  const parsed = extractJSON(text);

  const content = Array.isArray(parsed.content)
    ? parsed.content.join("\n")
    : String(parsed.content || "");

  const conclusion = String(
    parsed.conclusion || parsed.takeaway || parsed.summary || ""
  ).trim();

  const cta = String(
    parsed.cta || parsed.action || parsed.behavior || parsed.next_step || ""
  ).replace(/\s+/g, " ").trim();

  return {
    hook: String(parsed.hook || parsed.title || ""),
    content,
    caption: String(parsed.caption || parsed.follow_call || "").trim() + " #1section",
    conclusion,
    cta,
    content_json: JSON.stringify(parsed),
  };
}
