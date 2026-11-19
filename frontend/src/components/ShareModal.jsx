import { useEffect, useState } from "react";
import QRCode from "qrcode";
import axiosInstance from "../api/axios";
import { referralLinkFor } from "./ReferralBox";
import { recordWelcomeShare } from "../api/welcomeShare";

// Share Tap In — share button + modal for every platform + QR scan tag.
// Tap In never posts to another platform for you and never logs into
// one: each button opens that platform's own share page (or your mail /
// text app) with the link filled in, and you send it yourself.
// Instagram and TikTok have no web share page, so they are copy-link
// options — never a fake/broken link.
// The QR code encodes your invite link (or the plain app link when
// you're logged out / have no referral code yet) — scan it to join.
const APP_URL = "https://tap-in-cakt.onrender.com";
const SHARE_TEXT = "Join me on Tap In — Dolo45's members-only app";
const SHARE_SUBJECT = "Join me on Tap In";

function appLink() {
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }
  return APP_URL;
}

export function shareLinkFor(code) {
  if (code) return referralLinkFor(code);
  return appLink();
}

export default function ShareModal({ open, onClose }) {
  const [link, setLink] = useState(appLink());
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState("");

  // Resolve the link when the modal opens: your referral link when
  // logged in, otherwise the plain app link.
  useEffect(() => {
    if (!open) return;
    setCopied("");
    setQr("");
    const token =
      typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setLink(appLink());
      return;
    }
    axiosInstance
      .get("/referral/me", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => setLink(shareLinkFor(res.data?.code || "")))
      .catch(() => setLink(appLink()));
  }, [open ]);

  // Build the QR code from the resolved link.
  useEffect(() => {
    if (!open || !link) return;
    let cancelled = false;
    QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 1, width: 256 })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr("");
      });
    return () => {
      cancelled = true;
    };
  }, [open, link]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && onClose) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const enc = encodeURIComponent;
  const textWithLink = `${SHARE_TEXT} ${link}`;
  const options = [
    { id: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(link)}` },
    { id: "x", label: "X", href: `https://twitter.com/intent/tweet?text=${enc(SHARE_TEXT)}&url=${enc(link)}` },
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${enc(textWithLink)}` },
    { id: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${enc(link)}&text=${enc(SHARE_TEXT)}` },
    { id: "linkedin", label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(link)}` },
    { id: "reddit", label: "Reddit", href: `https://www.reddit.com/submit?url=${enc(link)}&title=${enc(SHARE_TEXT)}` },
    { id: "email", label: "Email", href: `mailto:?subject=${enc(SHARE_SUBJECT)}&body=${enc(`${SHARE_TEXT}\n${link}`)}` },
    { id: "sms", label: "Text (SMS)", href: `sms:?&body=${enc(textWithLink)}` }
  ];

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

  const shareNative = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Tap In", text: SHARE_TEXT, url: link });
        // Resolved = the member shared it. (A cancelled sheet throws
        // and never reaches here, so no post is made for it.)
        recordWelcomeShare(link);
      } catch {
        // User cancelled the system share sheet — nothing to do.
      }
    }
  };

  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1e1f22", color: "white",
          border: "1px solid #00eaff", borderRadius: 12,
          padding: 20, maxWidth: 560, width: "100%",
          maxHeight: "90vh", overflowY: "auto"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: "bold" }}>📣 Share Tap In</div>
          <button onClick={onClose} aria-label="Close" style={closeBtn}>✕</button>
        </div>
        <p style={{ marginTop: 8, color: "#aaa", fontSize: 13 }}>
          Send your invite link to anyone — Tap In opens the platform and you
          send it yourself. Nothing is posted for you.
        </p>

        {canNativeShare && (
          <button onClick={shareNative} style={{ ...btn, width: "100%", marginTop: 12 }}>
            📱 Share… (your phone's share sheet)
          </button>
        )}

        <div style={{ marginTop: 16, fontSize: 13, color: "#00eaff", wordBreak: "break-all" }}>{link}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={() => copy("link", link)} style={btn}>
            {copied === "link" ? "✅ Link copied!" : "Copy link"}
          </button>
          <button onClick={() => copy("text", textWithLink)} style={{ ...btn, background: "#2b2d31", color: "white" }}>
            {copied === "text" ? "✅ Share text copied!" : "Copy share text"}
          </button>
        </div>

        <div style={{ marginTop: 18, fontWeight: "bold", fontSize: 14 }}>Share on</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {options.map((o) => (
            <a
              key={o.id}
              href={o.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => recordWelcomeShare(link)}
              style={{ ...btn, background: "#2b2d31", color: "white", textDecoration: "none" }}
            >
              {o.label}
            </a>
          ))}
        </div>

        <div style={{ marginTop: 18, fontWeight: "bold", fontSize: 14 }}>Instagram &amp; TikTok</div>
        <p style={{ marginTop: 6, color: "#aaa", fontSize: 13 }}>
          Instagram and TikTok don't have a web share button, so copy the link
          and paste it in your post, story, or bio there.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button onClick={() => copy("instagram", link)} style={{ ...btn, background: "#2b2d31", color: "white" }}>
            {copied === "instagram" ? "✅ Copied — paste in Instagram" : "📸 Instagram — copy link"}
          </button>
          <button onClick={() => copy("tiktok", link)} style={{ ...btn, background: "#2b2d31", color: "white" }}>
            {copied === "tiktok" ? "✅ Copied — paste in TikTok" : "🎵 TikTok — copy link"}
          </button>
        </div>
        {copied === "copy-failed" && (
          <p style={{ marginTop: 10, color: "#ffce54", fontSize: 13 }}>
            Copy didn't work in this browser — long-press the link to copy it.
          </p>
        )}

        <div style={{ marginTop: 20, fontWeight: "bold", fontSize: 14 }}>Scan to join Tap In</div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          {qr ? (
            <img
              src={qr}
              alt="QR code — scan to join Tap In"
              width={200}
              height={200}
              style={{ background: "white", padding: 8, borderRadius: 8 }}
            />
          ) : (
            <p style={{ color: "#aaa", fontSize: 13 }}>Making your QR code…</p>
          )}
          {qr && (
            <a href={qr} download="tap-in-qr.png" style={{ ...btn, background: "#2b2d31", color: "white", textDecoration: "none" }}>
              ⬇️ Download QR code
            </a>
          )}
          <p style={{ color: "#aaa", fontSize: 12, textAlign: "center" }}>
            Point any phone camera at it — it opens your Tap In invite link.
          </p>
        </div>
      </div>
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

const closeBtn = {
  background: "#2b2d31",
  border: "none",
  borderRadius: 8,
  color: "white",
  cursor: "pointer",
  fontSize: 16,
  padding: "6px 12px"
};
