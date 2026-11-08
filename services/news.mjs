/**
 * Current-news grounding for content generation.
 *
 * Searches Google News RSS (a trusted-news aggregator) for recent headlines
 * related to the account niche/product, then returns a small, de-duplicated
 * set of items the AI can pick from. The AI is instructed (in openrouter) to
 * choose ONE problem from these trusted reports that the product can help with
 * and break that problem down — never inventing facts and never drifting to
 * problems the product cannot address.
 *
 * Read-only, best-effort: failures return [] so generation still works.
 */

const TRUSTED_HINT = [
  "reuters","apnews","associated press","bbc","npr","pbs","wsj","wall street journal",
  "nytimes","new york times","washington post","the guardian","ft.com","financial times",
  "bloomberg","cnbc","forbes","time.com","usatoday","abcnews","cbsnews","nbcnews",
  "axios","the atlantic","economist","marketwatch","yahoo finance"
];

function decodeEntities(s = "") {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function stripTags(s = "") {
  return decodeEntities(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseRssItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) && items.length < 30) {
    const block = m[1];
    const title = stripTags((block.match(/<title>([\s\S]*?)<\/title>/i) || [,""])[1]);
    const link = decodeEntities((block.match(/<link>([\s\S]*?)<\/link>/i) || [,""])[1]).trim();
    const pubDate = stripTags((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [,""])[1]);
    const source = stripTags((block.match(/<source[^>]*>([\s\S]*?)<\/source>/i) || [,""])[1]);
    if (title) items.push({ title, source, link, pubDate });
  }
  return items;
}

function trustedScore(item) {
  const hay = `${item.source} ${item.link}`.toLowerCase();
  return TRUSTED_HINT.some((t) => hay.includes(t)) ? 1 : 0;
}

function daysOld(pubDate) {
  const t = Date.parse(pubDate);
  if (!Number.isFinite(t)) return 999;
  return (Date.now() - t) / 86400000;
}

async function fetchRss(query) {
  const q = encodeURIComponent(query);
  // when:7d keeps it current; can relax to 30d if sparse.
  const url = `https://news.google.com/rss/search?q=${q}+when:7d&hl=en-US&gl=US&ceid=US:en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; 1section-content/1.0)" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssItems(xml);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function uniqueByTitle(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function keywordsFromProduct(product) {
  if (!product) return [];
  const parts = [product.name, product.summary, product.outcome, product.audience]
    .filter(Boolean)
    .map((s) => String(s));
  const text = parts.join(" ");
  // pull a few meaningful words (cheap heuristic; no NLP dep)
  const stop = new Set("a,an,the,and,or,for,to,of,in,on,with,how,your,that,this,from,into,more,most,than,are,can,will,not,its,by,as,be,at,about,what,when,why,who,make,build,step,steps,guide,ways,without,into".split(","));
  const words = (text.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !stop.has(w));
  return [...new Set(words)].slice(0, 6);
}

/**
 * @param {{ nicheName?: string, nicheSlug?: string, product?: object }} opts
 * @returns {Promise<Array<{title,source,link,pubDate}>>}
 */
export async function findCurrentNews({ nicheName = "", nicheSlug = "", product = null } = {}) {
  const niche = nicheName || nicheSlug || "finance";
  const kws = keywordsFromProduct(product);
  // Try a focused query (niche + product problem keywords), then fall back to niche-only.
  const queries = [];
  if (kws.length) queries.push(`${niche} ${kws.slice(0, 4).join(" ")} problem`);
  queries.push(`${niche} money stress habits today`);
  queries.push(`${niche} personal challenges`);

  let items = [];
  for (const q of queries) {
    const got = await fetchRss(q);
    items = items.concat(got);
    if (items.length >= 12) break;
  }
  if (!items.length) return [];

  items = uniqueByTitle(items);
  // Prefer trusted sources and recent items.
  items.sort((a, b) => trustedScore(b) - trustedScore(a) || daysOld(a.pubDate) - daysOld(b.pubDate));
  return items.slice(0, 8).map(({ title, source, link, pubDate }) => ({ title, source, link, pubDate }));
}

export function formatNewsForPrompt(items = []) {
  if (!items.length) return "";
  const lines = items.map((it, i) => {
    const src = it.source ? ` (${it.source})` : "";
    const date = it.pubDate ? ` [${it.pubDate}]` : "";
    return `${i + 1}. ${it.title}${src}${date}${it.link ? `\n   ${it.link}` : ""}`;
  });
  return [
    "CURRENT TRUSTED NEWS (pick exactly ONE item whose problem is directly relevant and solvable by the PRODUCT SOURCE above):",
    "Use it only to identify a real, current problem and its cause. Do not copy the headline. Do not invent facts, numbers, quotes, or details beyond what the headline reasonably implies. Stay within what the product can actually help with.",
    lines.join("\n"),
  ].join("\n");
}
