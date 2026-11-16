import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";

// Your referral code — the shareable code that brings new people in.
// Every member gets one unique code (e.g. DOLO45-K7Q2). Share the
// link and anyone who signs up from it is automatically your friend —
// no Accept tap needed. The code is public by design (it is meant to
// be shared); it is NOT a password and never logs anyone in.
export function referralLinkFor(code) {
  if (!code) return "";
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://tap-in-cakt.onrender.com";
  return `${origin}/?ref=${encodeURIComponent(code)}`;
}

export function readRefFromUrl() {
  if (typeof window === "undefined") return "";
  const fromSearch = new URLSearchParams(window.location.search || "").get("ref") || "";
  if (fromSearch) return fromSearch.trim();
  // Hash-router pages keep the query in the hash sometimes
  // (#/register?ref=DOLO45-K7Q2) — check there too.
  const hash = window.location.hash || "";
  const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?")) : "";
  return (new URLSearchParams(hashQuery).get("ref") || "").trim();
}

export default function ReferralBox({ compact = false }) {
  const [code, setCode] = useState("");
  const [referralCount, setReferralCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const token =
      typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    axiosInstance
      .get("/referral/me", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        if (res.data?.code) setCode(res.data.code);
        setReferralCount(res.data?.referralCount || 0);
      })
      .catch(() => {
        setNote("Could not load your referral code — try again once you're back online.");
      });
  }, []);

  const link = referralLinkFor(code);

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Clipboard blocked (older browsers): select the link text so
      // the member can copy it by hand instead of failing silently.
      setNote("Copy didn't work in this browser — long-press the link to copy it.");
    }
  };

  if (!code && !note) return null;

  return (
    <div
      style={{
        marginTop: compact ? 20 : 20,
        background: "#1a2b33",
        border: "2px solid #00eaff",
        borderRadius: 12,
        padding: 16,
        maxWidth: compact ? "100%" : 560
      }}
    >
      <div style={{ fontSize: 16, fontWeight: "bold" }}>
        🔗 Your referral code — invite people to Tap In
      </div>
      {code ? (
        <>
          <div style={{ marginTop: 10, fontSize: 22, fontWeight: "bold", letterSpacing: 2, color: "#00eaff" }}>
            {code}
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: "#aaa", wordBreak: "break-all" }}>
            {link}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#aaa" }}>
            Share this link — anyone who signs up from it becomes your friend automatically.
            {referralCount > 0 && (
              <span> {referralCount} {referralCount === 1 ? "person" : "people"} joined with your code so far.</span>
            )}
          </div>
          <button
            onClick={copyLink}
            style={{
              marginTop: 12,
              padding: "10px 18px",
              borderRadius: 8,
              background: "#00eaff",
              border: "none",
              cursor: "pointer",
              color: "black",
              fontWeight: "bold"
            }}
          >
            {copied ? "✅ Copied!" : "Copy invite link"}
          </button>
        </>
      ) : null}
      {note && (
        <p style={{ marginTop: 10, color: "#ffce54", fontSize: 13 }}>{note}</p>
      )}
    </div>
  );
}
