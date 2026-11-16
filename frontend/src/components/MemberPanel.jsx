import { useEffect, useState } from "react";
import io from "socket.io-client";
import axiosInstance from "../api/axios";

// Member / activity panel — Discord-style right rail, real data only.
// LIVE NOW comes from GET /live (username, room, since — the backend
// returns no viewer count, so none is shown). ONLINE NOW comes from
// GET /chat/presence (people you already chat with) plus GET /members.
// Refreshes every 15s and on live-started / live-ended / notification
// socket events. Empty states say so plainly — never fake members.
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("token") || ""}` };
}

export default function MemberPanel({ onNavigate }) {
  const [live, setLive] = useState([]);
  const [presence, setPresence] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const [liveRes, presRes, memRes] = await Promise.all([
        axiosInstance.get("/live", { headers: authHeaders() }),
        axiosInstance.get("/chat/presence", { headers: authHeaders() }),
        axiosInstance.get("/members", { headers: authHeaders() })
      ]);
      setLive(liveRes.data?.live || []);
      setPresence(presRes.data?.presence || []);
      setMembers(memRes.data?.members || []);
      setError("");
    } catch {
      setError("Could not load who's live / online right now.");
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    const token = localStorage.getItem("token");
    let socket = null;
    if (token) {
      socket = io(import.meta.env.VITE_API_URL || "http://localhost:3001", { auth: { token } });
      socket.on("live-started", load);
      socket.on("live-ended", load);
      socket.on("notification", load);
    }
    return () => {
      clearInterval(timer);
      socket?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const online = members.filter((m) => m.online);
  const onlineNames = new Set(online.map((m) => m.username));
  const presenceOnline = presence.filter((p) => p.online && !onlineNames.has(p.username));
  const since = (startedAt) => {
    if (!startedAt) return "";
    const mins = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
    return mins < 1 ? "just now" : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div style={{ width: 240, flexShrink: 0, background: "#2b2d31", padding: 16, overflowY: "auto", color: "white" }}>
      <h3 style={{ fontSize: 13, color: "#00eaff", letterSpacing: 1 }}>🔴 LIVE NOW</h3>
      {live.length === 0 ? (
        <p style={{ marginTop: 8, color: "#aaa", fontSize: 13 }}>Nobody is live right now.</p>
      ) : (
        live.map((b, i) => (
          <div key={`${b.username}-${b.room}-${i}`} style={{ marginTop: 10, background: "#1e1f22", padding: 10, borderRadius: 8 }}>
            <div style={{ fontWeight: "bold" }}>🔴 {b.username}</div>
            <div style={{ color: "#aaa", fontSize: 12, marginTop: 4 }}>
              Room “{b.room}” · live {since(b.startedAt)}
            </div>
            <button
              onClick={() => onNavigate && onNavigate("video", b.room)}
              style={{ marginTop: 8, padding: "6px 12px", borderRadius: 6, background: "#00eaff", border: "none", cursor: "pointer", fontWeight: "bold", fontSize: 12 }}
            >
              Watch live
            </button>
          </div>
        ))
      )}

      <h3 style={{ fontSize: 13, color: "#00eaff", letterSpacing: 1, marginTop: 24 }}>🟢 ONLINE NOW</h3>
      {online.length === 0 && presenceOnline.length === 0 ? (
        <p style={{ marginTop: 8, color: "#aaa", fontSize: 13 }}>Nobody else is online right now.</p>
      ) : (
        <>
          {online.map((m) => (
            <div key={m.id} style={{ marginTop: 8, fontSize: 14 }}>
              🟢 {m.username}{m.role === "admin" ? " 🛡️" : ""}
            </div>
          ))}
          {presenceOnline.map((p) => (
            <div key={p.userId} style={{ marginTop: 8, fontSize: 14 }}>🟢 {p.username}</div>
          ))}
        </>
      )}
      {error && <p style={{ marginTop: 16, color: "#ffce54", fontSize: 12 }}>{error}</p>}
    </div>
  );
}
