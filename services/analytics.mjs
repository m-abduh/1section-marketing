// Read-only analytics for the dashboard.
// - Buffer: aggregated post metrics per account (views, reactions, comments,
//   engagement rate, post count) over a date range.
// - Local: how many videos this app generated/posted, success rate, activity
//   per day and category mix.
// Nothing here writes to the DB or touches the generation pipeline.
import { getChannels } from "./buffer.js";
import { store } from "../db.mjs";

const BASE = "https://api.buffer.com";
const TTL_MS = 5 * 60 * 1000;
const CHANNEL_TTL_MS = 60 * 60 * 1000;
const cache = new Map();
const channelCache = new Map();

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function loadChannels(account) {
  const hit = channelCache.get(account.id);
  if (hit && Date.now() - hit.at < CHANNEL_TTL_MS) return hit.data;
  const data = await getChannels(account.buffer_token);
  channelCache.set(account.id, { at: Date.now(), data });
  return data;
}

async function graphql(token, query, variables = {}) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Buffer API ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data;
}

async function accountAnalytics(account, days) {
  const key = `${account.id}:${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const base = {
    account_id: account.id,
    account: account.name,
    link: account.link || "",
    ok: false,
    channels: [],
    metrics: { posts: 0, views: 0, reactions: 0, comments: 0, engagementRate: 0 },
    metricsUpdatedAt: null,
    error: null,
  };

  let data = base;
  if (!account.buffer_token) {
    data = { ...base, error: "No Buffer token" };
  } else {
    try {
      const { organizations, channels } = await loadChannels(account);
      const orgId = organizations?.[0]?.id;
      const end = new Date();
      const start = new Date(end.getTime() - days * 86400000);
      const res = await graphql(
        account.buffer_token,
        `query ($i: AggregatedPostMetricsInput!) {
          aggregatedPostMetrics(input: $i) {
            metricsUpdatedAt
            metrics { name type unit value }
          }
        }`,
        {
          i: {
            organizationId: orgId,
            channelIds: channels.map((c) => c.id),
            startDateTime: start.toISOString(),
            endDateTime: end.toISOString(),
          },
        }
      );
      const raw = res.aggregatedPostMetrics?.metrics ?? [];
      const byType = Object.fromEntries(raw.map((m) => [m.type, m.value]));
      data = {
        ...base,
        ok: true,
        channels: channels.map((c) => ({ name: c.name, service: c.service })),
        metrics: {
          posts: byType.postCount || 0,
          views: byType.views || 0,
          reactions: byType.reactions || 0,
          comments: byType.comments || 0,
          engagementRate: byType.engagementRate || 0,
        },
        metricsUpdatedAt: res.aggregatedPostMetrics?.metricsUpdatedAt || null,
      };
    } catch (e) {
      data = { ...base, error: String(e.message || e).slice(0, 160) };
    }
  }

  cache.set(key, { at: Date.now(), data });
  return data;
}

function localStats(videos) {
  const perAccount = new Map();
  const daily = new Map();
  const categories = new Map();

  const dayKey = (d) => d.toISOString().slice(0, 10);
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push(dayKey(d));
    daily.set(dayKey(d), 0);
  }

  for (const v of videos) {
    let s = perAccount.get(v.account_id);
    if (!s) {
      s = { generated: 0, success: 0, ready: 0, failed: 0, pending: 0, lastAt: null };
      perAccount.set(v.account_id, s);
    }
    s.generated++;
    if (v.status === "success") s.success++;
    else if (v.status === "ready") s.ready++;
    else if (v.status === "failed") s.failed++;
    else s.pending++;
    if (!s.lastAt || String(v.created_at) > String(s.lastAt)) s.lastAt = v.created_at;

    const created = String(v.created_at || "").replace(" ", "T") + "Z";
    const key = dayKey(new Date(created));
    if (daily.has(key)) daily.set(key, daily.get(key) + 1);

    const c = v.category_name || "Uncategorized";
    categories.set(c, (categories.get(c) || 0) + 1);
  }

  return {
    perAccount,
    daily: days.map((date) => ({ date, count: daily.get(date) || 0 })),
    categories: [...categories.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function getAnalytics(days = 30) {
  const accounts = store.listAccounts();
  const videos = store.listVideos();
  const local = localStats(videos);

  const buffer = await mapLimit(accounts, 4, (a) => accountAnalytics(a, days));

  const rows = accounts.map((a, i) => {
    const b = buffer[i];
    const l = local.perAccount.get(a.id) || { generated: 0, success: 0, ready: 0, failed: 0, pending: 0, lastAt: null };
    return { ...b, local: l };
  });

  const totals = rows.reduce(
    (t, r) => {
      t.posts += r.metrics.posts;
      t.views += r.metrics.views;
      t.reactions += r.metrics.reactions;
      t.comments += r.metrics.comments;
      t.generated += r.local.generated;
      t.success += r.local.success;
      t.ready += r.local.ready;
      t.failed += r.local.failed;
      t.pending += r.local.pending;
      return t;
    },
    { posts: 0, views: 0, reactions: 0, comments: 0, generated: 0, success: 0, ready: 0, failed: 0, pending: 0 }
  );
  totals.engagementRate = totals.views
    ? Math.round((totals.reactions / totals.views) * 10000) / 100
    : 0;
  totals.successRate = totals.generated
    ? Math.round((totals.success / totals.generated) * 1000) / 10
    : 0;

  return {
    range: { days, until: new Date().toISOString() },
    totals,
    accounts: rows,
    daily: local.daily,
    categories: local.categories.slice(0, 6),
    online: rows.filter((r) => r.ok).length,
    totalAccounts: rows.length,
    updatedAt: new Date().toISOString(),
  };
}
