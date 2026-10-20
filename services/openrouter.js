import { store } from "../db.mjs";

const MODEL = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free";

const DEFAULT_BASE_PROMPT = `You are a senior copywriter writing short, punchy, scroll-stopping content for a short-form video channel. The channel's NICHE is defined by the VIDEO CHANNEL NAME and the SOURCE INSTRUCTIONS below — you must stay strictly inside that niche (e.g. finance, business, career, or technology) and never drift to a different topic. Every claim must be factually correct for that niche — real, current, accurate, and up to date, no hype, no get-rich-quick nonsense.

Voice: SHORT, DENSE, EMOTIONAL, PERSONAL. Speak directly to the viewer as "you" — like a sharp mentor who actually works in that niche. Give the viewer a real, non-obvious INSIGHT they can act on — not generic advice they've already heard. Every line must earn its place.

"hook" MUST be 7 to 14 words: a strong, emotional, specific, current scroll-stopping statement or question rooted in the niche. It becomes the H2 title on the slide.
"caption" MUST be one short personal paragraph (no hashtags, no @ mentions).

"content" is the Markdown BODY printed below the hook title — plain, flowing Markdown rendered as ONE static slide. Use only safe inline styling where the source instructions ask: **bold** (1-2 key words max, never a whole line), *italic*, ~~strikethrough~~, "- " lists, and | | tables. NEVER use container blocks: no blockquotes (>) and no \`\`\`text code fences — write everything as plain paragraphs and lists. NEVER repeat the hook anywhere in the content; the body must add new information, not echo the title. NEVER use emojis or emoticons — only text and numbers; symbols (× = ≠ ↓) only where meaningful. Leave a BLANK line between sections so they breathe. Keep every line short enough to fit on one screen. Make the content feel CURRENT and SPECIFIC to the niche (reference real, timely trends, tools, shifts, or patterns) rather than vague or generic. The source instructions define the exact structure of "content" — follow them first.

Return ONLY valid JSON matching EXACTLY this shape:
{
  "hook": "a 7-14 word strong hook line",
  "content": "the Markdown body following the source instructions (no H1, no title)",
  "caption": "one short paragraph for the social post caption (no hashtags, no @ mentions)"
}`;

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

/**
 * Generate post content (copywriting + caption) for an account+category.
 * @param {object} opts
 * @param {string} opts.accountName  Buffer account name
 * @param {string} opts.categoryName  Category label (e.g. "stat", "story")
 * @param {string} opts.prompt  Per-account-category AI prompt (customizable)
 * @returns {{hook, content, caption, content_json}}
 */
export async function generatePost({ accountName, categoryName, prompt }) {
  const base = loadBasePrompt();

  const src = (prompt && prompt.trim())
    ? prompt.trim()
    : `The topic is up to you — pick something timely and relevant to ${categoryName}.`;

  const userPrompt = `Video channel name: ${accountName}
Category: ${categoryName}

SOURCE INSTRUCTIONS (these define the content style, structure, and format — follow them first):
${src}

${base}`;

  const text = await askAI(userPrompt);
  const parsed = extractJSON(text);

  const content = Array.isArray(parsed.content)
    ? parsed.content.join("\n")
    : String(parsed.content || "");

  return {
    hook: String(parsed.hook || parsed.title || ""),
    content,
    caption: String(parsed.caption || parsed.follow_call || "").trim() + " #1section",
    content_json: JSON.stringify(parsed),
  };
}
