import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";
import MyMerch from "./MyMerch";
import WelcomeFeed from "./WelcomeFeed";
import { readRefFromUrl } from "./ReferralBox";

export default function Landing({ authUser = null }) {
  const [health, setHealth] = useState(null);
  const [invitedBy, setInvitedBy] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  // Auth comes from App (authUser prop). When logged in, show ONLY
  // "Welcome back, <username>" — Log in / Sign up never appear.
  const loggedInUsername =
    authUser?.username ||
    (typeof localStorage !== "undefined"
      ? localStorage.getItem("tapin_username")
      : null);
  const isLoggedIn =
    typeof localStorage !== "undefined" &&
    !!localStorage.getItem("token") &&
    !!loggedInUsername;

  useEffect(() => {
    axiosInstance
      .get("/health")
      .then((res) => setHealth(res.data))
      .catch(() => setHealth({ ok: false, db: "unreachable" }));
    // Referral link (?ref=DOLO45-K7Q2): say who invited you up
    // front, so a new person knows the link is real before signing
    // up — and that signing up from it makes you friends.
    const ref = readRefFromUrl();
    if (ref) {
      setInviteCode(ref.toUpperCase());
      axiosInstance
        .get(`/referral/${encodeURIComponent(ref)}`)
        .then((res) => {
          if (res.data?.valid) setInvitedBy(res.data.username);
        })
        .catch(() => { /* banner is a bonus */ });
    }
  }, []);

  const dbStatus =
    health?.db === "connected"
      ? "✅ Database connected — logins work"
      : health?.db === "disconnected"
        ? "⚠️ Database still connecting — you can look around, logins open once it is connected"
        : health
          ? "❌ Backend unreachable right now"
          : "Checking backend…";

  return (
    <div style={{ padding: 40, color: "white" }}>
      <h1>Welcome to Tap-In</h1>
      <p style={{ marginTop: 20, fontSize: 18 }}>Your social platform for peer-to-peer calling, video chat, live streaming, and group communication.</p>

      {invitedBy && (
        <div
          style={{
            marginTop: 20,
            background: "#1a2b33",
            border: "2px solid #00eaff",
            borderRadius: 12,
            padding: 16,
            maxWidth: 920,
            fontSize: 16
          }}
        >
          👋 You were invited by <b style={{ color: "#00eaff" }}>{invitedBy}</b>
          {inviteCode ? ` (code ${inviteCode})` : ""} — sign up and you'll be friends automatically.
        </div>
      )}

      <MyMerch />

      <WelcomeFeed />

      <div
        style={{
          marginTop: 24,
          background: "#1e1f22",
          border: "1px solid #00eaff",
          borderRadius: 12,
          padding: 20,
          maxWidth: 920
        }}
      >
        <div style={{ fontSize: 22, fontWeight: "bold" }}>🕊️ RIP Booju</div>
        <div style={{ marginTop: 8, fontSize: 16, color: "#00eaff", fontWeight: "bold" }}>
          RSO • RNO • Double G Global Gangsters
        </div>
        <div style={{ marginTop: 8, color: "#aaa", fontSize: 14 }}>
          Built in his memory. This one is for Booju, forever stamped on Tap-In.
        </div>
      </div>

      {isLoggedIn ? (
        <div style={{ marginTop: 30, fontSize: 18 }}>
          Welcome back, <b style={{ color: "#00eaff" }}>{loggedInUsername}</b> — you're logged in.
        </div>
      ) : (
        <div style={{ marginTop: 30, display: "flex", gap: 12 }}>
          <a
            href="#/login"
            style={{
              padding: "14px 32px",
              borderRadius: 10,
              background: "#00eaff",
              color: "black",
              fontWeight: "bold",
              textDecoration: "none"
            }}
          >
            Log in
          </a>
          <a
            href="#/register"
            style={{
              padding: "14px 32px",
              borderRadius: 10,
              background: "#2b2d31",
              color: "white",
              fontWeight: "bold",
              textDecoration: "none",
              border: "1px solid #00eaff"
            }}
          >
            Sign up
          </a>
        </div>
      )}

      <p style={{ marginTop: 16, color: "#aaa", fontSize: 14 }}>{dbStatus}</p>

      <div style={{ marginTop: 40 }}>
        <h2>Features:</h2>
        <ul style={{ marginTop: 20, lineHeight: 2 }}>
          <li>✨ Peer-to-Peer Video Calling</li>
          <li>💬 Group Chat & Messaging</li>
          <li>🔴 Live Streaming</li>
          <li>👥 Friend Management</li>
          <li>🛡️ Server/Channel Management</li>
        </ul>
      </div>

      <p style={{ marginTop: 40, color: "#888", fontSize: 13 }}>
        RSO • RNO • Double G Global Gangsters — 🕊️ RIP Booju
      </p>
    </div>
  );
}
