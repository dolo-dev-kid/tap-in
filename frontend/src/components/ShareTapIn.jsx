import { useState } from "react";
import { referralLinkFor } from "./ReferralBox";
import ShareModal from "./ShareModal";
import { recordWelcomeShare } from "../api/welcomeShare";

// Share Tap In everywhere — copy text only. Tap In never posts to
// another platform for you and never logs into one: you copy the
// text/link and paste it on Instagram, Facebook, TikTok, YouTube,
// or wherever yourself. No OAuth, no follower import.
export default function ShareTapIn({ code }) {
  const [copied, setCopied] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const link = referralLinkFor(code);
  const shareText = code
    ? `Tap In is LIVE — my app, built by me, from the tent to now. 🔥 Members only. Chat, video rooms, live stream, upload your pics, videos and songs, private chats too. It's free for life if you sign up while it's free, before it hits Google Play. Join with my link: ${link} — Dolo45`
    : "";

  const copy = async (what, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 2000);
      // The link is copied — that is a completed share, so the member
      // gets their one Welcome to Tap In post (backend dedupes).
      recordWelcomeShare(link);
    } catch {
      setCopied("copy-failed");
    }
  };

  if (!code) return null;
  return (
    <div
      style={{
        marginTop: 20,
        background: "#1e1f22",
        border: "1px solid #00eaff",
        borderRadius: 12,
        padding: 16,
        maxWidth: 560
      }}
    >
      <div style={{ fontSize: 16, fontWeight: "bold" }}>📣 Share Tap In everywhere</div>
      <p style={{ marginTop: 8, color: "#aaa", fontSize: 13 }}>
        Copy your invite link or the share text, then paste it on your other
        platforms yourself — Tap In doesn't post for you.
      </p>
      <div style={{ marginTop: 10, fontSize: 13, color: "#00eaff", wordBreak: "break-all" }}>{link}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={() => copy("link", link)} style={btn}>
          {copied === "link" ? "✅ Link copied!" : "Copy invite link"}
        </button>
        <button onClick={() => copy("text", shareText)} style={{ ...btn, background: "#2b2d31", color: "white" }}>
          {copied === "text" ? "✅ Share text copied!" : "Copy share text"}
        </button>
        <button onClick={() => setShareOpen(true)} style={{ ...btn, background: "#2b2d31", color: "white" }}>
          📣 More share options
        </button>
      </div>
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
      {copied === "copy-failed" && (
        <p style={{ marginTop: 10, color: "#ffce54", fontSize: 13 }}>
          Copy didn't work in this browser — long-press the link to copy it.
        </p>
      )}
    </div>
  );
}

const btn = {
  padding: "10px 18px",
  borderRadius: 8,
  background: "#00eaff",
  border: "none",
  cursor: "pointer",
  color: "black",
  fontWeight: "bold"
};
