// Full read-only analytics snapshot.
//
// Buffer is the only source for the "analytics" half of this page: account +
// organization metadata, every channel, aggregated post metrics (account-level
// and per-channel), and the latest sent posts with every metric Buffer exposes.
// The "generated content" half comes from our own SQLite `videos` table: the
// latest 5 rows per account, with `content_json` parsed back into JSON.
//
// Nothing in this service writes to Buffer or the database.

import { store } from "../db.mjs";

const BASE = "https://api.buffer.com";
const TTL_MS = 5 * 60 * 1000;
const META_TTL_MS = 60 * 60 * 1000;
const POSTS_PER_ACCOUNT = 5;

const snapshotCache = new Map();
const metaCache = new Map();

const ACCOUNT_QUERY = `query {
  account {
    id email name timezone createdAt avatar
    organizations { id name channelCount ownerEmail }
  }
}`;

const CHANNELS_QUERY = `query ($orgId: OrganizationId!) {
  channels(input: { organizationId: $orgId }) {
    id name service descriptor displayName avatar externalLink
    isDisconnected isLocked isQueuePaused
    timezone createdAt organizationId serviceId type
  }
}`;

const AGG_QUERY = `query ($input: AggregatedPostMetricsInput!) {
  aggregatedPostMetrics(input: $input) {
    metricsUpdatedAt
    metrics { name type unit value description }
  }
}`;

const POSTS_QUERY = `query ($first: Int!, $input: PostsInput!) {
  posts(first: $first, input: $input) {
    edges {
      cursor
      node {
        id text sentAt dueAt status channelId channelService externalLink
        createdAt updatedAt metricsUpdatedAt
        metrics { name type unit value description }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

async function graphql(token, query, variables = {}) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Buffer API returned ${res.status}: ${text.slice(0, 160)}`);
  }
  if (!res.ok) throw new Error(`Buffer API ${res.status}: ${text.slice(0, 160)}`);
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data;
}

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

async function loadMeta(account, refresh) {
  const hit = metaCache.get(account.id);
  if (!refresh && hit && Date.now() - hit.at < META_TTL_MS) return hit.data;
  const data = await graphql(account.buffer_token, ACCOUNT_QUERY);
  metaCache.set(account.id, { at: Date.now(), data });
  return data;
}

async function aggregated(token, organizationId, channelIds, start, end) {
  if (!channelIds.length) return { metricsUpdatedAt: null, metrics: [] };
  const data = await graphql(token, AGG_QUERY, {
    input: {
      organizationId,
      channelIds,
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
    },
  });
  return data.aggregatedPostMetrics || { metricsUpdatedAt: null, metrics: [] };
}

async function latestPosts(token, organizationId, channelIds, start, end) {
  if (!channelIds.length) return { posts: [], pageInfo: null };
  const data = await graphql(token, POSTS_QUERY, {
    first: POSTS_PER_ACCOUNT,
    input: {
      organizationId,
      filter: {
        channelIds,
        status: "sent",
        createdAt: { start: start.toISOString(), end: end.toISOString() },
      },
      sort: [{ field: "createdAt", direction: "desc" }],
    },
  });
  const edges = data.posts?.edges || [];
  return {
    posts: edges.map((e) => e.node),
    pageInfo: data.posts?.pageInfo || null,
  };
}

function mergeMetrics(metricSets) {
  const map = new Map();
  for (const metrics of metricSets) {
    for (const m of metrics || []) {
      if (!m || !m.type) continue;
      const cur = map.get(m.type) || {
        name: m.name,
        type: m.type,
        unit: m.unit,
        value: 0,
        _pctCount: 0,
        description: m.description,
      };
      const value = Number(m.value) || 0;
      cur.value += value;
      if (m.unit === "percentage") cur._pctCount += 1;
      map.set(m.type, cur);
    }
  }
  return [...map.values()].map(({ _pctCount, ...m }) => ({
    ...m,
    value: m.unit === "percentage" && _pctCount
      ? Math.round((m.value / _pctCount) * 100) / 100
      : Math.round(m.value * 100) / 100,
  }));
}

function localSnapshot(account, videos) {
  const mine = videos.filter((v) => v.account_id === account.id);
  const stats = { generated: mine.length, success: 0, failed: 0, pending: 0, lastAt: null };
  for (const v of mine) {
    if (v.status === "success") stats.success++;
    else if (v.status === "failed") stats.failed++;
    else stats.pending++;
    if (!stats.lastAt || String(v.created_at) > String(stats.lastAt)) stats.lastAt = v.created_at;
  }

  const latest5 = mine
    .filter((v) => v.content_json)
    .slice(0, 5)
    .map((v) => {
      let contentJson = null;
      try {
        contentJson = JSON.parse(v.content_json);
      } catch {
        contentJson = v.content_json;
      }
      return {
        id: v.id,
        category_id: v.category_id,
        category_name: v.category_name,
        hook: v.hook,
        content: v.content,
        caption: v.caption,
        content_json: contentJson,
        video_path: v.video_path,
        status: v.status,
        attempts: v.attempts,
        last_error: v.last_error,
        created_at: v.created_at,
        posted_at: v.posted_at,
      };
    });

  return { stats, latest5 };
}

async function accountSnapshot(account, days, refresh) {
  const base = {
    account_id: account.id,
    account: account.name,
    link: account.link || "",
    ok: false,
    error: null,
    buffer: null,
    local: null,
  };

  if (!account.buffer_token) {
    return { ...base, error: "No Buffer token for this account" };
  }

  const start = new Date(Date.now() - days * 86400000);
  const end = new Date();

  try {
    const meta = await loadMeta(account, refresh);
    const organizations = meta.account?.organizations || [];
    const orgResults = await mapLimit(organizations, 2, async (org) => {
      try {
        const channelsData = await graphql(account.buffer_token, CHANNELS_QUERY, { orgId: org.id });
        const channels = channelsData.channels || [];
        const channelIds = channels.map((c) => c.id);

        const agg = await aggregated(account.buffer_token, org.id, channelIds, start, end);
        const posts = await latestPosts(account.buffer_token, org.id, channelIds, start, end);
        const channelMetrics = await mapLimit(channels, 2, async (channel) => {
          try {
            const m = await aggregated(account.buffer_token, org.id, [channel.id], start, end);
            return {
              channel_id: channel.id,
              channel_name: channel.name,
              service: channel.service,
              metricsUpdatedAt: m.metricsUpdatedAt,
              metrics: m.metrics || [],
              error: null,
            };
          } catch (err) {
            return {
              channel_id: channel.id,
              channel_name: channel.name,
              service: channel.service,
              metricsUpdatedAt: null,
              metrics: [],
              error: String(err.message || err).slice(0, 200),
            };
          }
        });

        return {
          id: org.id,
          name: org.name,
          channelCount: org.channelCount,
          ownerEmail: org.ownerEmail,
          channels,
          aggregated: agg,
          channelMetrics,
          posts: posts.posts,
          postsPageInfo: posts.pageInfo,
          error: null,
        };
      } catch (err) {
        return {
          id: org.id,
          name: org.name,
          channelCount: org.channelCount,
          ownerEmail: org.ownerEmail,
          channels: [],
          aggregated: { metricsUpdatedAt: null, metrics: [] },
          channelMetrics: [],
          posts: [],
          postsPageInfo: null,
          error: String(err.message || err).slice(0, 200),
        };
      }
    });

    const channels = orgResults.flatMap((o) => o.channels);
    const metrics = mergeMetrics(orgResults.map((o) => o.aggregated?.metrics));
    const updatedAt = orgResults
      .map((o) => o.aggregated?.metricsUpdatedAt)
      .filter(Boolean)
      .sort()
      .pop() || null;
    const posts = orgResults
      .flatMap((o) => o.posts)
      .sort((a, b) => String(b.sentAt || b.createdAt).localeCompare(String(a.sentAt || a.createdAt)));

    return {
      ...base,
      ok: true,
      error: orgResults.every((o) => o.error) ? orgResults.map((o) => o.error).join("; ") : null,
      buffer: {
        account: meta.account
          ? {
              id: meta.account.id,
              email: meta.account.email,
              name: meta.account.name,
              timezone: meta.account.timezone,
              createdAt: meta.account.createdAt,
              avatar: meta.account.avatar,
            }
          : null,
        organizations: orgResults,
        channels,
        aggregated: { metricsUpdatedAt: updatedAt, metrics },
        posts,
      },
    };
  } catch (err) {
    return { ...base, error: String(err.message || err).slice(0, 240) };
  }
}

export async function getFullAnalytics(days = 30, { refresh = false } = {}) {
  const accounts = store.listAccounts();
  const videos = store.listVideos();

  const rows = await mapLimit(accounts, 2, async (account) => {
    const key = `${account.id}:${days}`;
    const hit = snapshotCache.get(key);
    if (!refresh && hit && Date.now() - hit.at < TTL_MS) {
      return { ...hit.data, local: localSnapshot(account, videos) };
    }
    const data = await accountSnapshot(account, days, refresh);
    data.local = localSnapshot(account, videos);
    snapshotCache.set(key, { at: Date.now(), data });
    return data;
  });

  const totals = {
    buffer: mergeMetrics(rows.map((r) => r.buffer?.aggregated?.metrics)),
    local: rows.reduce(
      (t, r) => {
        const l = r.local?.stats || {};
        t.generated += l.generated || 0;
        t.success += l.success || 0;
        t.failed += l.failed || 0;
        t.pending += l.pending || 0;
        return t;
      },
      { generated: 0, success: 0, failed: 0, pending: 0 }
    ),
  };
  totals.local.successRate = totals.local.generated
    ? Math.round((totals.local.success / totals.local.generated) * 1000) / 10
    : 0;

  // Overall engagement is reactions ÷ views (same formula as the Overview page),
  // not an unweighted average of each account's percentage.
  const views = totals.buffer.find((m) => m.type === "views");
  const reactions = totals.buffer.find((m) => m.type === "reactions");
  const engagement = totals.buffer.find((m) => m.type === "engagementRate");
  if (engagement && views?.value) {
    engagement.value = Math.round(((reactions?.value || 0) / views.value) * 10000) / 100;
  }

  return {
    generatedAt: new Date().toISOString(),
    range: {
      days,
      start: new Date(Date.now() - days * 86400000).toISOString(),
      end: new Date().toISOString(),
    },
    summary: {
      accounts: rows.length,
      connected: rows.filter((r) => r.ok).length,
      channels: rows.reduce((n, r) => n + (r.buffer?.channels?.length || 0), 0),
      posts: rows.reduce((n, r) => n + (r.buffer?.posts?.length || 0), 0),
      organizations: rows.reduce((n, r) => n + (r.buffer?.organizations?.length || 0), 0),
    },
    totals,
    accounts: rows,
  };
}
