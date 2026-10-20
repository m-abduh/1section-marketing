import "dotenv/config";
import { basename } from "path";
import { store } from "./db.mjs";
import { generatePost } from "./services/openrouter.js";
import { generateVideo } from "./services/videogen.js";
import { getChannels, createPost } from "./services/buffer.js";

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

  // Create a pending record so captions/content are never lost even on failure
  let video = store.createVideo(account, { id: categoryRow.category_id, name: categoryName }, {
    status: "pending",
  });

  let result;
  try {
    result = await generateAndPost(video, { account, categoryName, prompt, position: categoryRow.position });

    // Advance rotation only after a successful slot
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

  return { result, video: store.getVideo(video.id) || video };
}

async function generateAndPost(video, { account, categoryName, prompt, position }) {
  const outFile = `${account.name.replace(/[^a-zA-Z0-9-_]+/g, "-")}-${Date.now()}.mp4`;

  const gen = await generatePost({ accountName: account.name, categoryName, prompt });
  video = store.updateVideo(video.id, {
    hook: gen.hook,
    content: gen.content,
    caption: gen.caption,
    content_json: gen.content_json,
  });

  const contentChecksum = gen.content.trim();

  // Dedupe: skip if exactly the same content was already posted for this account
  const dup = store.listVideos({ accountId: account.id }).find(
    (v) => v.status === "success" && v.content && v.content.trim() === contentChecksum
  );
  if (dup) {
    store.deleteVideo(video.id);
    return { status: "dup", skipped: true };
  }

  const videoPath = await generateVideo(
    {
      hook: gen.hook,
      content: gen.content,
      category: categoryName,
      account: account.name,
      account_link: account.link || "",
      index: position,
    },
    outFile
  );
  video = store.updateVideo(video.id, { video_path: videoPath });

  return uploadWithRetry(video);
}

async function uploadWithRetry(video) {
  const account = store.getAccount(video.account_id);
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

  video = store.updateVideo(video.id, { status: "pending", last_error: null });
  const result = await uploadWithRetry(video);
  return { result, video };
}
