import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";

export default function Landing() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    axiosInstance
      .get("/health")
      .then((res) => setHealth(res.data))
      .catch(() => setHealth({ ok: false, db: "unreachable" }));
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

      <div style={{ marginTop: 30, display: "flex", gap: 12 }}>
        <a
          href="/login"
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
          href="/register"
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
    </div>
  );
}
