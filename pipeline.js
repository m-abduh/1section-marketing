import "dotenv/config";
import { basename } from "path";
import { store } from "./db.mjs";
import { generatePost } from "./services/openrouter.js";
import { generateVideo } from "./services/videogen.js";
import { getChannels, createPost } from "./services/buffer.js";
import { nextProductForNiche, getNiche } from "./services/masterdb.mjs";
import { findCurrentNews } from "./services/news.mjs";

const MAX_ATTEMPTS = Number(process.env.RETRY_ATTEMPTS || 3);
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || 5000);

function loadRotation() {
  const r = store.getSettingJSON("rotation", null);
  return r && typeof r.contentIndex === "number" ? r : { contentIndex: 0, accountIndex: 0 };
}

export function nextSlot() {
  const accounts = store.listAccounts();
  if (!accounts.length) return null;

  const rotation = loadRotation();
  let { contentIndex, accountIndex } = rotation;
  const total = accounts.length;

  // Walk forward until we find an account that has categories mapped,
  // so rotation never stalls on an empty account. Cap iterations to avoid infinite loop.
  for (let step = 0; step < total; step++) {
    const account = accounts[accountIndex % total];
    const acs = store.listAccountCategories(account.id);
    if (acs.length) {
      const category = acs[contentIndex % acs.length];
      return { account, categoryRow: category, contentIndex, accountIndex };
    }
    // Skip this account (no categories): advance accountIndex, bump contentIndex on wrap
    let ni = (accountIndex + 1) % total;
    let nc = contentIndex;
    if (ni < accountIndex) nc = contentIndex + 1;
    accountIndex = ni;
    contentIndex = nc;
  }

  return null;
}

export async function runPipeline({ videoId } = {}) {
  if (videoId) {
    return runManualRetry(videoId);
  }

  const slot = nextSlot();
  if (!slot) {
    return { error: store.listAccounts().length ? "No categories mapped to any account" : "No accounts configured" };
  }
  const { account, categoryRow, contentIndex, accountIndex } = slot;

  const accounts = store.listAccounts();
  const categoryName = categoryRow.category_name;
  const prompt = categoryRow.prompt || categoryRow.default_prompt;

  let video = store.createVideo(account, { id: categoryRow.category_id, name: categoryName }, { status: "pending" });

  let result;
  let salesResult = null;
  let cycleComplete = false;
  try {
    const acs = store.listAccountCategories(account.id);
    cycleComplete = acs.length > 0 && (contentIndex % acs.length) === (acs.length - 1);

    result = await generateAndPost(video, {
      account,
      categoryName,
      prompt,
      position: categoryRow.position,
      nicheId: account.niche_id || null,
      cycleComplete,
      salesMode: false,
    });

    // End-of-cycle: insert a sales-only CTA post before repeating categories.
    if (cycleComplete) {
      try {
        salesResult = await generateSalesCta({ account, nicheId: account.niche_id || null, productId: result?.product?.id || null });
      } catch (e) {
        console.error("[pipeline] sales CTA failed:", e.message);
        salesResult = { error: e.message };
      }

      // Advance product pointer once per full cycle (including CTA) to the next product.
      const advPid = salesResult?.product?.id || result?.product?.id || null;
      if (advPid) {
        try { store.setAccountLastProduct(account.id, advPid); } catch {}
      }
    }

    // Advance rotation only after a successful slot/cycle step
    let nextIndex = accountIndex + 1;
    let nextContent = contentIndex;
    if (nextIndex >= accounts.length) {
      nextIndex = 0;
      nextContent = contentIndex + 1;
    }
    store.setSettingJSON("rotation", { contentIndex: nextContent, accountIndex: nextIndex });
  } catch (err) {
    console.error("[pipeline] slot failed:", err.message);
    try { store.updateVideo(video.id, { status: "failed", last_error: err.message }); } catch {}
    result = { error: err.message };
  }

  const out = { result, video: store.getVideo(video.id) || video };
  if (salesResult) out.sales = salesResult;
  return out;
}

async function generateSalesCta({ account, nicheId, productId }) {
  const outFile = `${account.name.replace(/[^a-zA-Z0-9-_]+/g, "-")}-sales-${Date.now()}.mp4`;
  let salesVideo = store.createVideo(account, { id: null, name: "Sales CTA" }, { status: "pending" });

  const effectiveNicheId = nicheId || account.niche_id || null;
  let product = null;
  if (effectiveNicheId) {
    try {
      // Use the same product as the completed cycle (passed in) when possible.
      product = await nextProductForNiche(effectiveNicheId, account.last_product_id || null);
      // If pipeline passed the cycle's product id and lookup rolled forward unexpectedly, prefer passed id context by reusing fields below when matching.
    } catch (e) {
      console.warn(`[pipeline] sales product lookup failed for niche ${effectiveNicheId}:`, e.message);
    }
  }
  if (product) {
    salesVideo = store.updateVideo(salesVideo.id, {
      product_id: product.id,
      product_name: product.name || null,
      niche_id: effectiveNicheId,
    });
  }

  const gen = await generatePost({
    accountName: account.name,
    categoryName: "Sales CTA",
    prompt: "Sales-only CTA for the ebook/product. Focus on clear value and purchase intent.",
    product,
    newsItems: [],
    salesMode: true,
  });

  salesVideo = store.updateVideo(salesVideo.id, {
    hook: gen.hook || "Get the guide",
    content: gen.content || "Sales CTA",
    caption: gen.caption || `${product?.name || "Guide"} #1section`,
    content_json: gen.content_json || JSON.stringify(gen),
  });

  const contentChecksum = (gen.content || gen.hook || "sales").trim();

  // Dedupe sales CTA per account+product (avoid repeating identical sales post)
  const dup = store.listVideos({ accountId: account.id }).find(
    (v) => ["success", "ready"].includes(v.status)
      && v.category_name === "Sales CTA"
      && v.product_id && product && v.product_id === product.id
  );
  if (dup) {
    store.deleteVideo(salesVideo.id);
    return { status: "dup", skipped: true, mode: "sales", product: product ? { id: product.id, name: product.name } : null };
  }

  const nicheLabel = account.niche_name || (account.name || "").split(".").pop() || "1section";
  const videoPath = await generateVideo(
    {
      mode: "sales",
      sales_mode: true,
      hook: gen.hook,
      content: gen.content,
      source: "",
      category: "Sales CTA",
      account: account.name,
      account_link: account.link || "",
      conclusion: gen.conclusion,
      cta: gen.cta,
      recommendation: gen.recommendation || "",
      product_points: Array.isArray(gen.product_points) ? gen.product_points : [],
      product_name: product ? (product.name || "") : "",
      product_image: product ? (product.coverImage || "") : "",
      product_features: product ? (product.features || []) : [],
      product_learnings: product ? (product.learnings || []) : [],
      product_outcome: product ? (product.outcome || "") : "",
      price: product ? (product.price ?? product.salePrice ?? product.sale_price ?? product.priceAmount ?? product.price_amount ?? "") : "",
      compare_price: product ? (product.compareAtPrice ?? product.compare_at_price ?? product.comparePrice ?? product.originalPrice ?? product.original_price ?? product.compareAtAmount ?? product.compare_at_amount ?? "") : "",
      discount: product ? (product.discount ?? product.discountPercent ?? product.discount_percent ?? product.discountLabel ?? "") : "",
      currency: product ? (product.currency || "USD") : "USD",
      niche: nicheLabel,
      index: 999,
    },
    outFile
  );
  salesVideo = store.updateVideo(salesVideo.id, { video_path: videoPath });

  if (!store.isPublishingEnabled()) {
    salesVideo = store.updateVideo(salesVideo.id, { status: "ready", posted_at: null, last_error: null });
    console.log(`[pipeline] Publishing disabled; sales CTA #${salesVideo.id} rendered and left ready`);
    return { status: "ready", published: false, mode: "sales", product: product ? { id: product.id, name: product.name } : null, video: salesVideo };
  }

  const result = await uploadWithRetry(salesVideo);
  return { ...result, mode: "sales", product: product ? { id: product.id, name: product.name } : null, video: store.getVideo(salesVideo.id) || salesVideo };
}

async function generateAndPost(video, { account, categoryName, prompt, position, nicheId, cycleComplete, salesMode = false }) {
  const outFile = `${account.name.replace(/[^a-zA-Z0-9-_]+/g, "-")}-${Date.now()}.mp4`;

  // Resolve the next product for this niche (cycles 1,2,3 -> 1,... using last_product_id).
  let product = null;
  const effectiveNicheId = nicheId || account.niche_id || null;
  if (effectiveNicheId) {
    try {
      product = await nextProductForNiche(effectiveNicheId, account.last_product_id || null);
    } catch (e) {
      console.warn(`[pipeline] product lookup failed for niche ${effectiveNicheId}:`, e.message);
    }
  }
  if (product) {
    video = store.updateVideo(video.id, {
      product_id: product.id,
      product_name: product.name || null,
      niche_id: effectiveNicheId,
    });
    console.log(`[pipeline] content product: ${product.name} (${product.id})`);
  }

  // Current, trusted-news problem grounding (bounded by the chosen product).
  let newsItems = [];
  if (effectiveNicheId && !salesMode) {
    try {
      const nicheRow = await getNiche(effectiveNicheId);
      newsItems = await findCurrentNews({
        nicheName: nicheRow?.name || account.niche_name || account.name || "",
        nicheSlug: nicheRow?.slug || "",
        product,
      });
      if (newsItems.length) console.log(`[pipeline] news grounding: ${newsItems.length} item(s) for ${nicheRow?.name || effectiveNicheId}`);
    } catch (e) {
      console.warn("[pipeline] news lookup failed (continuing without news):", e.message);
    }
  }

  const gen = await generatePost({ accountName: account.name, categoryName, prompt, product, newsItems, salesMode });
  video = store.updateVideo(video.id, {
    hook: gen.hook,
    content: gen.content,
    caption: gen.caption,
    content_json: gen.content_json,
  });

  const contentChecksum = (gen.content || "").trim();

  // Dedupe: skip if exactly the same content was already posted (or already
  // rendered and waiting to be published) for this account.
  const dup = store.listVideos({ accountId: account.id }).find(
    (v) => ["success", "ready"].includes(v.status) && v.id !== video.id && v.content && v.content.trim() === contentChecksum
  );
  if (dup) {
    store.deleteVideo(video.id);
    // Still advance the product pointer at category-cycle completion so a duplicate
    // on the last slot doesn't trap the account on the same product forever.
    // (actual advance happens in runPipeline after sales CTA)
    return { status: "dup", skipped: true, product: product ? { id: product.id, name: product.name } : null };
  }

  const videoPath = await generateVideo(
    {
      hook: gen.hook,
      content: gen.content,
      visual: gen.visual || null,
      source: gen.source || "",
      category: categoryName,
      account: account.name,
      account_link: account.link || "",
      conclusion: gen.conclusion,
      cta: gen.cta,
      recommendation: gen.recommendation || "",
      product_points: Array.isArray(gen.product_points) ? gen.product_points : [],
      product_name: product ? (product.name || "") : "",
      product_image: product ? (product.coverImage || "") : "",
      product_features: product ? (product.features || []) : [],
      product_learnings: product ? (product.learnings || []) : [],
      product_outcome: product ? (product.outcome || "") : "",
      price: product ? (product.price ?? product.salePrice ?? product.sale_price ?? product.priceAmount ?? product.price_amount ?? "") : "",
      compare_price: product ? (product.compareAtPrice ?? product.compare_at_price ?? product.comparePrice ?? product.originalPrice ?? product.original_price ?? product.compareAtAmount ?? product.compare_at_amount ?? "") : "",
      discount: product ? (product.discount ?? product.discountPercent ?? product.discount_percent ?? product.discountLabel ?? "") : "",
      currency: product ? (product.currency || "USD") : "USD",
      niche: account.niche_name || (account.name || "").split(".").pop() || "1section",
      index: position,
      sales_mode: !!salesMode,
    },
    outFile
  );
  video = store.updateVideo(video.id, { video_path: videoPath });

  // Publishing off: keep rendered file and mark ready. Product advance happens in runPipeline at cycle end.
  if (!store.isPublishingEnabled()) {
    video = store.updateVideo(video.id, { status: "ready", posted_at: null, last_error: null });
    console.log(`[pipeline] Publishing disabled; video #${video.id} rendered and left ready`);
    return { status: "ready", published: false, product: product ? { id: product.id, name: product.name } : null };
  }

  const result = await uploadWithRetry(video);
  return { ...result, product: product ? { id: product.id, name: product.name } : null };
}

async function uploadWithRetry(video) {
  if (!store.isPublishingEnabled()) {
    video = store.updateVideo(video.id, { status: "ready", last_error: null });
    return { status: "ready", published: false, skipped: true };
  }

  const account = store.getAccount(video.account_id);
  if (!account) {
    video = store.updateVideo(video.id, { status: "failed", last_error: "Account not found" });
    return { status: "failed", error: "Account not found" };
  }
  const token = account.buffer_token;
  const publicUrl = process.env.PUBLIC_URL;

  let lastErr = null;
  try {
    video = store.incrementAttempts(video.id);
    if (!token || !publicUrl) {
      throw new Error(`Skipping Buffer publish (PUBLIC_URL${token ? " not set" : " & token not set"})`);
    }
    if (!video.video_path) throw new Error("No rendered video to upload");

    const { channels } = await getChannels(token);
    const videoFile = basename(video.video_path);
    const videoUrl = `${publicUrl}/videos/${videoFile}`;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const results = [];
        for (const ch of channels) {
          const thumbnailOffset = (ch.service === "youtube" || ch.service === "tiktok") ? 0 : undefined;
          await createPost(token, ch.id, video.caption, videoUrl, ch.service, video.hook || video.account_name || "1section", thumbnailOffset);
          results.push({ channel: ch.name, ok: true });
          console.log(`[pipeline] Posted to ${ch.name} (${ch.service})`);
        }
        video = store.updateVideo(video.id, { status: "success", posted_at: new Date().toISOString(), last_error: null });
        return { status: "success", channels: results };
      } catch (err) {
        lastErr = err.message;
        console.error(`[pipeline] upload attempt ${attempt + 1} failed: ${err.message}`);
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }
  } catch (err) {
    lastErr = err.message;
    console.error(`[pipeline] upload failed: ${err.message}`);
  }

  if (!store.isPublishingEnabled()) {
    video = store.updateVideo(video.id, { status: "ready", last_error: null });
    return { status: "ready", published: false, skipped: true };
  }

  video = store.updateVideo(video.id, { status: "failed", last_error: lastErr });
  return { status: "failed", error: lastErr };
}

export async function runManualRetry(videoId) {
  let video = store.getVideo(videoId);
  if (!video) return { error: "Video not found" };
  if (video.status === "success") return { status: "already-success" };

  const account = store.getAccount(video.account_id);
  if (!account) return { error: "Account not found" };

  // If a video file was never rendered (failed earlier), re-run the whole slot content.
  if (!video.video_path) {
    return runPipeline({});
  }

  if (!store.isPublishingEnabled()) {
    return { status: "ready", skipped: true, reason: "publishing disabled" };
  }

  video = store.updateVideo(video.id, { status: "pending", last_error: null });
  const result = await uploadWithRetry(video);
  return { result, video };
}
