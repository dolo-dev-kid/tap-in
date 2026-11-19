// SocialLinks — a member's own other platforms. Values are pasted by
// the member themself: a full URL or a handle. Nothing is auto-filled,
// nothing is imported, and Tap In never posts to these platforms.
// Discord: a username shows as text "Discord: <username>"; a server
// invite link (discord.gg/…) shows as "Discord: <username>" linking
// to the invite — the username shown is the member's Tap In username
// (for Dolo45, his Discord username is Dolo45 too).
// Handles turn into the platform's profile URL; full URLs are used
// as-is (https only — the backend rejects anything else).
export const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", icon: "📸", placeholder: "instagram.com/yourname or @yourname", handleUrl: (h) => `https://instagram.com/${h}` },
  { key: "facebook", label: "Facebook", icon: "👍", placeholder: "facebook.com/yourname or yourname", handleUrl: (h) => `https://facebook.com/${h}` },
  { key: "tiktok", label: "TikTok", icon: "🎵", placeholder: "tiktok.com/@yourname or @yourname", handleUrl: (h) => `https://tiktok.com/@${h}` },
  { key: "youtube", label: "YouTube", icon: "▶️", placeholder: "youtube.com/@yourname or @yourname", handleUrl: (h) => `https://youtube.com/@${h}` },
  { key: "soundcloud", label: "SoundCloud", icon: "☁️", placeholder: "soundcloud.com/yourname or yourname", handleUrl: (h) => `https://soundcloud.com/${h}` },
  { key: "bandlab", label: "BandLab", icon: "🎧", placeholder: "bandlab.com/yourname or yourname", handleUrl: (h) => `https://bandlab.com/${h}` },
  // Discord (16 Nov 2026): a username has no public profile URL, so
  // a handle is shown as text; a server invite link (discord.gg/…)
  // opens the server. Wesley pastes his own handle / invite link —
  // nothing is seeded or invented.
  { key: "discord", label: "Discord", icon: "💬", placeholder: "Discord username or discord.gg/invite link", handleUrl: () => "" }
];

export function socialLinkUrl(platform, value) {
  const raw = (value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  // Discord usernames have no public profile URL — a handle is shown
  // as text, never linked to a guessed URL.
  if (platform === "discord") return "";
  const handle = raw.replace(/^@/, "");
  const p = SOCIAL_PLATFORMS.find((x) => x.key === platform);
  return p ? p.handleUrl(handle) : "";
}

export function hasSocialLinks(links) {
  return !!links && (SOCIAL_PLATFORMS.some((p) => (links[p.key] || "").trim()) || !!(links.booking || "").trim());
}

// Tappable links to a member's other platforms. Members-only context
// only — never rendered on a public page. `username` is the member's
// Tap In username, shown on the Discord entry (their Discord username
// for Dolo45 is the same).
export default function SocialLinksRow({ links, username }) {
  if (!hasSocialLinks(links)) return null;
  return (
    <span style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
      {SOCIAL_PLATFORMS.filter((p) => (links[p.key] || "").trim()).map((p) => {
        const url = socialLinkUrl(p.key, links[p.key]);
        if (!url) {
          // Discord username: no profile URL exists, so show it as
          // plain text instead of linking anywhere guessed.
          return (
            <span key={p.key} title={`${p.label}: ${links[p.key]}`} style={{ color: "#00eaff", fontSize: 13 }}>
              {p.icon} {p.label}: {links[p.key]}
            </span>
          );
        }
        // Discord server invite: show the member's username on the
        // link itself — "Discord: Dolo45" — linking to their invite.
        const label = p.key === "discord" && username
          ? `${p.icon} ${p.label}: ${username}`
          : `${p.icon} ${p.label}`;
        return (
          <a
            key={p.key}
            href={url}
            target="_blank"
            rel="noreferrer"
            title={`${p.label}: ${links[p.key]}`}
            style={{ color: "#00eaff", fontSize: 13, textDecoration: "none" }}
          >
            {label}
          </a>
        );
      })}
      {/* Book Dolo45 (18 Nov 2026): his music booking page — live
          shows $500, features $250. Seeded by the backend for the
          exact username "Dolo45" only, NOT an editable social link,
          so it renders here alongside his other platforms. */}
      {links.booking ? (
        <a
          href={links.booking}
          target="_blank"
          rel="noreferrer"
          title="Book Dolo45 — live shows $500, features $250"
          style={{ color: "#00eaff", fontSize: 13, fontWeight: "bold", textDecoration: "none" }}
        >
          🎤 Book Dolo45 · Shows $500 / Features $250
        </a>
      ) : null}
    </span>
  );
}
