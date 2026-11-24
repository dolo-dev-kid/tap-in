// Live news for the Dolo45 News hub — real feeds only, never static
// items and never invented headlines (Wesley, 24 Nov 2026).
//
// GET /api/news -> {
//   updatedAt,                 // ISO time this payload was built
//   facebook: { configured, items },  // Page mentions + Page posts
//   hiphop:   { items },       // Pittsburgh hip hop + hip hop music
//   fashion:  { items },       // hip hop fashion + streetwear
// }
// Item: { title, text, url, source, date }.
//
// Sources:
// - Google News RSS — no key needed, fetched live by the backend.
// - Facebook Graph — only when FB_PAGE_TOKEN is set on the server
//   (a long-lived Dolo45 Page token; never commit it, never log it,
//   never return it). Without it the facebook section reports
//   configured:false and the app says so plainly instead of faking it.
// A source that fails returns items:[] with an error note — one dead
// feed never takes the whole hub down. Results are cached 15 minutes
// so every page load doesn't hammer Google/Facebook.

const PAGE_ID = "1501121676407804"; // Dolo45 Facebook Page
const CACHE_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10000;

let cache = { at: 0, data: null };
let inflight = null;

function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS) {
  return fetch(url, { signal: AbortSignal.timeout(ms) });
}

// Minimal RSS parsing — Google News RSS only needs title / link /
// pubDate / source out of each <item>. No new dependency.
function parseRssItems(xml) {
  const items = [];
  const blocks = String(xml).match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const block of blocks) {
    const pick = (tag) => {
      const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
      if (!m) return "";
      return m[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
    };
    const title = pick("title");
    const link = pick("link");
    if (!title || !link) continue;
    items.push({
      title,
      text: "",
      url: link,
      source: pick("source") || "Google News",
      date: pick("pubDate") || "",
    });
  }
  return items;
}

async function fetchGoogleNews(query, limit) {
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=en-US&gl=US&ceid=US:en";
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Google News ${res.status}`);
  const xml = await res.text();
  return parseRssItems(xml).slice(0, limit);
}

// Merge several queries, newest first, deduped by URL, capped.
async function fetchSection(queries, limit) {
  const seen = new Set();
  const merged = [];
  for (const q of queries) {
    try {
      const items = await fetchGoogleNews(q, 6);
      for (const item of items) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        merged.push(item);
      }
    } catch (e) {
      console.warn(`[news] Google News query failed (${q}):`, e.message);
    }
  }
  merged.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return merged.slice(0, limit);
}

async function fetchFacebook() {
  const token = process.env.FB_PAGE_TOKEN;
  if (!token) return { configured: false, items: [] };
  const fields = "id,message,created_time,permalink_url,from{name}";
  const items = [];
  // Posts the Page is tagged in = mentions of Dolo45.
  // Recent posts on the Page wall, newest first.
  const endpoints = [
    `https://graph.facebook.com/v21.0/${PAGE_ID}/tagged?fields=${encodeURIComponent(fields)}&limit=10`,
    `https://graph.facebook.com/v21.0/${PAGE_ID}/feed?fields=${encodeURIComponent(fields)}&limit=10`,
  ];
  for (const url of endpoints) {
    try {
      const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn("[news] Facebook Graph error:", res.status, body?.error?.message || "");
        continue;
      }
      for (const post of body.data || []) {
        const message = (post.message || "").trim();
        if (!message && !post.permalink_url) continue;
        items.push({
          title: message.length > 140 ? message.slice(0, 137) + "…" : message || "Post on Dolo45",
          text: message.length > 140 ? message : "",
          url: post.permalink_url || `https://www.facebook.com/${PAGE_ID}`,
          source: (post.from && post.from.name) || "Facebook",
          date: post.created_time || "",
        });
      }
    } catch (e) {
      console.warn("[news] Facebook fetch failed:", e.message);
    }
  }
  const seen = new Set();
  const deduped = items.filter((i) => {
    if (seen.has(i.url)) return false;
    seen.add(i.url);
    return true;
  });
  deduped.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return { configured: true, items: deduped.slice(0, 10) };
}

async function buildNews() {
  const [facebook, hiphop, fashion] = await Promise.all([
    fetchFacebook(),
    fetchSection(["Pittsburgh hip hop", "hip hop music"], 10),
    fetchSection(["hip hop fashion", "streetwear fashion"], 10),
  ]);
  return { updatedAt: new Date().toISOString(), facebook, hiphop: { items: hiphop }, fashion: { items: fashion } };
}

async function getNews(req, res) {
  try {
    const now = Date.now();
    if (cache.data && now - cache.at < CACHE_MS) return res.json(cache.data);
    if (!inflight) {
      inflight = buildNews()
        .then((data) => {
          cache = { at: Date.now(), data };
          return data;
        })
        .finally(() => {
          inflight = null;
        });
    }
    const data = await inflight;
    return res.json(data);
  } catch (e) {
    console.error("[news] failed to build feed:", e.message);
    // Serve the last good cache if we have one; otherwise empty
    // sections so the hub still loads.
    if (cache.data) return res.json(cache.data);
    return res.json({
      updatedAt: new Date().toISOString(),
      facebook: { configured: Boolean(process.env.FB_PAGE_TOKEN), items: [], error: "unavailable" },
      hiphop: { items: [], error: "unavailable" },
      fashion: { items: [], error: "unavailable" },
    });
  }
}

module.exports = { getNews };
