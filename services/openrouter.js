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
Return ONLY raw JSON (no markdown fences) with exactly these keys: "hook", "content", "caption", "conclusion".
"conclusion" = ONE short, plain-text sentence (max 18 words) that states the takeaway of this exact post. No markdown, no hashtags, no @mentions, no emojis, and do not repeat the hook word-for-word. It is printed on the dark end card under "THE TAKEAWAY".
"caption" must be about 20 to 40 words and must not contain first-person brand testimony ("I used to", "I spent", "I know it feels", "my", "we used to"). Do not use em dashes or strikethrough formatting anywhere. Soften claims and give at most one real action.
Before returning, scan every field for these banned words: "always", "every time", "everything changed", "never fails", "I used to", "I spent", "I know it feels", "my", "we used to". If any appear, rewrite that field. Also remove every em dash and all strikethrough formatting.`;

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

  const { niche, topics } = topicsForAccount(accountName);
  const topicBlock = topics.length
    ? `Niche: ${niche}
NICHE TOPICS (choose exactly ONE; build the whole post around it; do not mix topics or switch niches):
${topics.map((t) => `- ${t}`).join("\n")}`
    : `Niche: ${niche}`;

  const userPrompt = `Video channel name: ${accountName}
${topicBlock}

Category: ${categoryName}
LANGUAGE: Native English (US) only. Never write in Indonesian or translated-sounding English.

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

  return {
    hook: String(parsed.hook || parsed.title || ""),
    content,
    caption: String(parsed.caption || parsed.follow_call || "").trim() + " #1section",
    conclusion,
    content_json: JSON.stringify(parsed),
  };
}
