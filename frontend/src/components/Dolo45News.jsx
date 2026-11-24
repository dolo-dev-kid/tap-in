// Dolo45 News — the promotion hub for all things Dolo45 (Wesley,
// 20 Nov 2026). Every Dolo45 work in one place, plus a news feed of
// real current updates. No sample posts, no fake users, no fake
// content — every card links to a real live URL, every news item is
// a true update as of 20 Nov 2026. The in-app Feed and its 3
// real-photo posts are untouched; this hub is its own page.
//
// Reachable from: the top nav ("News"), the left nav
// ("dolo45-news" text channel), and the landing page teaser.
const WORKS = [
  {
    emoji: "📱",
    title: "Tap In",
    blurb: "Dolo45's members-only app — peer-to-peer calling, video chat, live streaming, group chat. Sign up while it's free and you get free for life.",
    link: "https://tap-in-cakt.onrender.com/?ref=DOLO45-KFD7",
    linkLabel: "Join Tap In →",
  },
  {
    emoji: "💈",
    title: "412 Shape Ups",
    blurb: "Book a cut with Karlos (Los) — haircut, shape up, kids, design, dye. Open slots only, book right on the site.",
    link: "https://four12-shape-ups.onrender.com",
    linkLabel: "Book a cut →",
  },
  {
    emoji: "🧙",
    title: "Grim Wizzard",
    blurb: "Dolo45's game — play as Morthazar the Hybrid on the path to becoming the Grim Wizzard. Real-time Mortal Kombat-style fights, duels, wild battles.",
    link: "https://grim-wizzard.onrender.com",
    linkLabel: "Play the game →",
  },
  {
    emoji: "🎬",
    title: "Union Money Films",
    blurb: "Nelse Dumas Jr's streaming app, built by Dolo45 — stream the full movies: Seeing Things, Unsung Birds, Trepidation, Phantasmagoria and more.",
    link: "https://union-money-films.onrender.com",
    linkLabel: "Stream the movies →",
  },
  {
    emoji: "👕",
    title: "Dolo45 Merch — Legendary Legacy",
    blurb: "The merch store — R.N.O, R.S.O, 4BUJU, Kings Life, KCR, it's mymy and the rest of the Legendary Legacy brands.",
    link: "https://dolo45-merch.onrender.com",
    linkLabel: "Shop the merch →",
  },
  {
    emoji: "🎤",
    title: "Book Nelse D",
    blurb: "Book Nelse for hosting, DJ, studio sessions ($30/hr), mixing, mastering and music videos.",
    link: "https://book-nelse-d.onrender.com",
    linkLabel: "Book Nelse D →",
  },
  {
    emoji: "🎵",
    title: "Book Dolo45",
    blurb: "Book Dolo45 for live shows — $500 — and features — $250.",
    link: "https://muse.ai/s/book-dolo45-xlxd6xgxzxcxzxnwcp/XLlEc4Qgl2txoWdAKeys3S61ftrSEEFTLHMVpp8McCI",
    linkLabel: "Book Dolo45 →",
  },
  {
    emoji: "🎧",
    title: "Music — Dolo45",
    blurb: "Hear the music — new songs, the catalog, and the album \"It's My Time\".",
    links: [
      { label: "YouTube", href: "https://www.youtube.com/channel/UCrXIgP86xXOPsR27qJowyCQ" },
      { label: "BandLab", href: "https://www.bandlab.com/pgh_dolo45" },
      { label: "SoundCloud", href: "https://soundcloud.com/dolo45" },
      { label: "Rap Fame", href: "https://rapfame.app/tracks/24612709" },
    ],
  },
  {
    emoji: "📲",
    title: "Follow Dolo45",
    blurb: "Dolo45 on socials — new music, new drops, and the giveaways go up here first.",
    links: [
      { label: "Instagram @nho_life_dolo45", href: "https://www.instagram.com/nho_life_dolo45/" },
      { label: "Facebook Page Dolo45", href: "https://www.facebook.com/1Dolo45" },
      { label: "TikTok @dolo45_music", href: "https://www.tiktok.com/@dolo45_music" },
    ],
  },
  {
    emoji: "🎮",
    title: "Dolo45 Kids",
    blurb: "Five games for MyMy, Talia, Nadia and Kaela — Memory Match, counting, Color the Wizard, Catch the Stars, shape & color quiz. No login, no ads.",
    link: "https://dolo45-kids-games.onrender.com",
    linkLabel: "Play the games →",
  },
  {
    emoji: "🛡️",
    title: "Dolo45 Security",
    blurb: "Free safety toolkit — check a file, check a link, test a password, check your device. Real checks, no fake scan results.",
    link: "https://dolo45-security.onrender.com",
    linkLabel: "Check your security →",
  },
  {
    emoji: "💛",
    title: "Support Dolo45",
    blurb: "Help an independent artist keep making music — music, Tap In, merch, all of it. Donate if you can, share if you can't.",
    link: "https://www.gofundme.com/f/support-dolo45-help-an-independent-artist-keep-making-music",
    linkLabel: "GoFundMe — donate or share →",
  },
];

// Live news — fetched from the backend (GET /api/news), which pulls
// real feeds: Google News for hip hop + fashion, and Dolo45's
// Facebook Page mentions when the Page is connected. Nothing here is
// hardcoded anymore, so nothing can go stale.
import { useEffect, useState } from "react";
import api from "../api/axios";

function formatDate(d) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function NewsSection({ title, tag, items, emptyText }) {
  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ fontSize: 21, margin: 0 }}>{title}</h3>
      <div style={{ marginTop: 12 }}>
        {items.length === 0 && (
          <p style={{ color: "#aaa", fontSize: 15 }}>{emptyText}</p>
        )}
        {items.map((n) => (
          <div
            key={n.url + n.title}
            style={{
              background: "#1e1f22",
              border: "1px solid #2b2d31",
              borderLeft: "4px solid #00eaff",
              borderRadius: 10,
              padding: 16,
              marginTop: 12,
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <span
                style={{
                  background: "#00eaff",
                  color: "#000",
                  fontSize: 12,
                  fontWeight: "bold",
                  borderRadius: 6,
                  padding: "3px 8px",
                }}
              >
                {tag}
              </span>
              <span style={{ color: "#aaa", fontSize: 13 }}>
                {n.source}
                {n.date ? ` — ${formatDate(n.date)}` : ""}
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: "bold", marginTop: 8 }}>
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "white", textDecoration: "none" }}
              >
                {n.title} →
              </a>
            </div>
            {n.text ? (
              <p style={{ marginTop: 6, color: "#d3d3d8", fontSize: 15 }}>{n.text}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

const cardStyle = {
  background: "#1e1f22",
  border: "1px solid #00eaff",
  borderRadius: 12,
  padding: 20,
  display: "flex",
  flexDirection: "column",
};

export default function Dolo45News() {
  const [feed, setFeed] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get("/api/news")
      .then((res) => {
        if (alive) setFeed(res.data);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const facebook = feed?.facebook || { configured: false, items: [] };
  const hiphop = feed?.hiphop?.items || [];
  const fashion = feed?.fashion?.items || [];

  return (
    <div style={{ padding: 24, color: "white", maxWidth: 1100 }}>
      <h2 style={{ fontSize: 28, margin: 0 }}>📰 Dolo45 News</h2>
      <p style={{ marginTop: 10, fontSize: 17, color: "#d3d3d8" }}>
        The hub for all things Dolo45 — every work, every link, every
        update, all in one place.
      </p>

      <h3 style={{ marginTop: 28, fontSize: 21 }}>All Dolo45&apos;s works</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16,
          marginTop: 12,
        }}
      >
        {WORKS.map((w) => (
          <div key={w.title} style={cardStyle}>
            <div style={{ fontSize: 26 }}>{w.emoji}</div>
            <div style={{ fontSize: 19, fontWeight: "bold", marginTop: 8 }}>
              {w.title}
            </div>
            <p style={{ marginTop: 8, color: "#d3d3d8", fontSize: 15, flex: 1 }}>
              {w.blurb}
            </p>
            {w.link && (
              <a
                href={w.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#00eaff", fontSize: 15, fontWeight: "bold", marginTop: 8 }}
              >
                {w.linkLabel}
              </a>
            )}
            {w.links && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 8 }}>
                {w.links.map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#00eaff", fontSize: 15, fontWeight: "bold" }}
                  >
                    {l.label} →
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 36, fontSize: 21 }}>Live news</h3>
      <p style={{ marginTop: 6, fontSize: 14, color: "#aaa" }}>
        Fresh from the web right now
        {feed?.updatedAt ? ` — updated ${formatDate(feed.updatedAt)}` : ""}
        {failed ? " — couldn't reach the feed, showing what's here instead." : ""}
      </p>
      {feed === null && !failed && (
        <p style={{ color: "#aaa", fontSize: 15 }}>Loading the latest news…</p>
      )}
      {feed !== null && (
        <>
          {facebook.configured ? (
            <NewsSection
              title="📘 Facebook — mentions of Dolo45"
              tag="Facebook"
              items={facebook.items}
              emptyText="No new mentions right now — check back soon."
            />
          ) : (
            <div style={{ marginTop: 28 }}>
              <h3 style={{ fontSize: 21, margin: 0 }}>📘 Facebook — mentions of Dolo45</h3>
              <p style={{ color: "#aaa", fontSize: 15, marginTop: 8 }}>
                Facebook mentions light up here once the Dolo45 Page is
                connected — until then, catch them on the{" "}
                <a
                  href="https://www.facebook.com/1Dolo45"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#00eaff", fontWeight: "bold" }}
                >
                  Dolo45 Page →
                </a>
              </p>
            </div>
          )}
          <NewsSection
            title="🎤 Pittsburgh hip hop"
            tag="Hip hop"
            items={hiphop}
            emptyText="No hip hop news loaded right now — try again in a bit."
          />
          <NewsSection
            title="👕 Hip hop fashion"
            tag="Fashion"
            items={fashion}
            emptyText="No fashion news loaded right now — try again in a bit."
          />
        </>
      )}
    </div>
  );
}
