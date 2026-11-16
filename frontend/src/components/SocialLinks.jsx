// SocialLinks — a member's own other platforms. Values are pasted by
// the member themself: a full URL or a handle. Nothing is auto-filled,
// nothing is imported, and Tap In never posts to these platforms.
// Handles turn into the platform's profile URL; full URLs are used
// as-is (https only — the backend rejects anything else).
export const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", icon: "📸", placeholder: "instagram.com/yourname or @yourname", handleUrl: (h) => `https://instagram.com/${h}` },
  { key: "facebook", label: "Facebook", icon: "👍", placeholder: "facebook.com/yourname or yourname", handleUrl: (h) => `https://facebook.com/${h}` },
  { key: "tiktok", label: "TikTok", icon: "🎵", placeholder: "tiktok.com/@yourname or @yourname", handleUrl: (h) => `https://tiktok.com/@${h}` },
  { key: "youtube", label: "YouTube", icon: "▶️", placeholder: "youtube.com/@yourname or @yourname", handleUrl: (h) => `https://youtube.com/@${h}` },
  { key: "soundcloud", label: "SoundCloud", icon: "☁️", placeholder: "soundcloud.com/yourname or yourname", handleUrl: (h) => `https://soundcloud.com/${h}` },
  { key: "bandlab", label: "BandLab", icon: "🎧", placeholder: "bandlab.com/yourname or yourname", handleUrl: (h) => `https://bandlab.com/${h}` }
];

export function socialLinkUrl(platform, value) {
  const raw = (value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const handle = raw.replace(/^@/, "");
  const p = SOCIAL_PLATFORMS.find((x) => x.key === platform);
  return p ? p.handleUrl(handle) : "";
}

export function hasSocialLinks(links) {
  return !!links && SOCIAL_PLATFORMS.some((p) => (links[p.key] || "").trim());
}

// Tappable links to a member's other platforms. Members-only context
// only — never rendered on a public page.
export default function SocialLinksRow({ links }) {
  if (!hasSocialLinks(links)) return null;
  return (
    <span style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
      {SOCIAL_PLATFORMS.filter((p) => (links[p.key] || "").trim()).map((p) => (
        <a
          key={p.key}
          href={socialLinkUrl(p.key, links[p.key])}
          target="_blank"
          rel="noreferrer"
          title={`${p.label}: ${links[p.key]}`}
          style={{ color: "#00eaff", fontSize: 13, textDecoration: "none" }}
        >
          {p.icon} {p.label}
        </a>
      ))}
    </span>
  );
}
