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
    link: "https://muse.ai/s/union-money-films-ep6xh1xnfcxuao/CQRl9ianYqstkUXtHqoWPrKqg2tGdq2TsaKY7d6yr_g",
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
    emoji: "💛",
    title: "Support Dolo45",
    blurb: "Help an independent artist keep making music — music, Tap In, merch, all of it. Donate if you can, share if you can't.",
    link: "https://www.gofundme.com/f/support-dolo45-help-an-independent-artist-keep-making-music",
    linkLabel: "GoFundMe — donate or share →",
  },
];

// Real news only, true as of 20 Nov 2026. When an item stops being
// current, remove it or replace it with the next real update — never
// leave stale news up and never invent a new item.
const NEWS = [
  {
    date: "Fri Nov 20, 2026 — TODAY",
    tag: "Community",
    title: "Community giveaway today — 2:00 PM, Turner Elementary",
    text: "Bookbag + turkey giveaway, today at 2:00 PM sharp at Turner Elementary School, Laketon Rd, Wilkinsburg, PA.",
  },
  {
    date: "Nov 2026",
    tag: "All live",
    title: "All six apps are live",
    text: "Tap In, 412 Shape Ups, Grim Wizzard, Union Money Films, Dolo45 Merch and Book Nelse D — all live right now, all linked on this page.",
  },
  {
    date: "Nov 2026",
    tag: "Merch",
    title: "The 4BUJU hoodie is buyable now",
    text: "The first real RNO hoodie — black + gold, Legendary Legacy — is on sale on the merch Quick Store. The rest of the store is listed and coming.",
  },
  {
    date: "Mon Nov 23, 2026",
    tag: "Career",
    title: "Per Scholas application deadline — Monday",
    text: "Cybersecurity with AI Tools, free, starts Dec 7, 2026. Applications close Monday Nov 23.",
  },
  {
    date: "Jan 18, 2027",
    tag: "Music",
    title: "ETSU contest entry deadline",
    text: "\"From the Archives to the Mic\" — a new 2–5 minute song on one of the four ETSU beats, plus lyrics and a short statement. Free to enter.",
  },
  {
    date: "Nov 2026",
    tag: "Tap In",
    title: "Google sign-in is coming to Tap In",
    text: "Sign in with Google is built and deployed — it goes live once the Google OAuth client ID is set on the backend.",
  },
];

const cardStyle = {
  background: "#1e1f22",
  border: "1px solid #00eaff",
  borderRadius: 12,
  padding: 20,
  display: "flex",
  flexDirection: "column",
};

export default function Dolo45News() {
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

      <h3 style={{ marginTop: 36, fontSize: 21 }}>Latest news</h3>
      <div style={{ marginTop: 12 }}>
        {NEWS.map((n) => (
          <div
            key={n.title}
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
                {n.tag}
              </span>
              <span style={{ color: "#aaa", fontSize: 13 }}>{n.date}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: "bold", marginTop: 8 }}>
              {n.title}
            </div>
            <p style={{ marginTop: 6, color: "#d3d3d8", fontSize: 15 }}>{n.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
