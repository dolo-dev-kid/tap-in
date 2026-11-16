import { useEffect, useState } from "react";
import io from "socket.io-client";
import axiosInstance from "../api/axios";
import VerifiedBadge from "./VerifiedBadge";
import StreamDestinations from "./StreamDestinations";

// Stream Dashboard — Streamlabs feel, real data only.
// WHO IS LIVE comes from GET /live (username, room, since). The
// backend returns NO viewer count and NO bitrate, so neither is
// shown as a number — the dashboard says so instead of inventing
// Viewers: 0. The alerts feed is the member's real notifications
// (live / friend / member-joined), newest first, plus live socket
// events. Go Live opens the existing VideoChat go-live flow (join a
// room, camera on, "go-live" is announced); Stop Live emits the
// existing "stop-live" event. Nothing here is fake.
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("token") || ""}` };
}

function durationSince(startedAt) {
  if (!startedAt) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
  if (mins < 1) return "just started";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function StreamDashboard({ onNavigate }) {
  const [live, setLive] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [stopping, setStopping] = useState(false);
  const myUsername =
    typeof localStorage !== "undefined" ? localStorage.getItem("tapin_username") : null;

  const load = async () => {
    const token = localStorage.getItem("token");
    if (!token) { setLoading(false); return; }
    try {
      const [liveRes, notifRes] = await Promise.all([
        axiosInstance.get("/live", { headers: authHeaders() }),
        axiosInstance.get("/notifications", { headers: authHeaders() })
      ]);
      setLive(liveRes.data?.live || []);
      setAlerts((notifRes.data?.notifications || []).filter((n) =>
        ["live", "friend_accepted", "friend_online", "member_joined"].includes(n.type)
      ));
      setNote("");
    } catch {
      setNote("Could not load live stats — check the backend connection.");
    } finally {
      setLoading(false);
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

  const amLive = myUsername ? live.some((b) => b.username === myUsername) : false;
  const myLive = live.find((b) => b.username === myUsername);

  const stopLive = () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    setStopping(true);
    const socket = io(import.meta.env.VITE_API_URL || "http://localhost:3001", { auth: { token } });
    socket.on("connect", () => {
      socket.emit("stop-live");
      setTimeout(() => { socket.disconnect(); setStopping(false); load(); }, 500);
    });
    setTimeout(() => { socket.disconnect(); setStopping(false); }, 3000);
  };

  // Twitch-style: the live stream is front and center — the first
  // live broadcast gets a big featured card, the rest are cards
  // below it, alerts feed underneath. Full page, no narrow column.
  const featured = live[0];
  return (
    <div style={{ padding: 24, color: "white", width: "100%", minHeight: "100%" }}>
      <h1>Stream Dashboard</h1>
      <p style={{ marginTop: 8, color: "#aaa", fontSize: 14 }}>
        Live stats from Tap In — real broadcasts only. Viewer count and
        bitrate aren't tracked by Tap In yet, so they're not shown here.
      </p>

      {featured && (
        <div style={{ marginTop: 20, background: "#1e1f22", border: "2px solid #ff4444", padding: 24, borderRadius: 12 }}>
          <div style={{ color: "#ff4444", fontWeight: "bold", fontSize: 13 }}>🔴 LIVE NOW — FEATURED</div>
          <h2 style={{ marginTop: 8, fontSize: 28 }}>{featured.username}<VerifiedBadge verified={true} size={18} /></h2>
          <p style={{ marginTop: 6, color: "#aaa" }}>Room “{featured.room}” · live {durationSince(featured.startedAt)}</p>
          <button onClick={() => onNavigate && onNavigate("video", featured.room)} style={{ marginTop: 14, padding: "12px 24px", borderRadius: 8, background: "#00eaff", border: "none", cursor: "pointer", fontWeight: "bold", fontSize: 15 }}>▶ Watch live</button>
        </div>
      )}

      <div style={{ marginTop: 20, background: "#1e1f22", padding: 20, borderRadius: 12 }}>
        <h2>Live Now</h2>
        {loading ? (
          <p style={{ marginTop: 15, color: "#aaa" }}>Loading live stats…</p>
        ) : live.length === 0 ? (
          <p style={{ marginTop: 15, color: "#aaa" }}>Nobody is live right now.</p>
        ) : (
          live.map((b, i) => (
            <div key={`${b.username}-${b.room}-${i}`} style={{ marginTop: 15, background: "#2b2d31", padding: 14, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span>
                🔴 <b>{b.username}</b> — room “{b.room}” · live {durationSince(b.startedAt)}
              </span>
              <button
                onClick={() => onNavigate && onNavigate("video", b.room)}
                style={{ padding: "8px 16px", borderRadius: 8, background: "#00eaff", border: "none", cursor: "pointer", fontWeight: "bold" }}
              >
                Watch live
              </button>
            </div>
          ))
        )}
        {note && <p style={{ marginTop: 12, color: "#ffce54", fontSize: 14 }}>{note}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
          {amLive ? (
            <>
              <span style={{ alignSelf: "center", color: "#7CFC9A", fontWeight: "bold" }}>
                ● You're live{myLive ? ` in “${myLive.room}”` : ""} — {myLive ? durationSince(myLive.startedAt) : ""}
              </span>
              <button
                onClick={stopLive}
                disabled={stopping}
                style={{ padding: "12px 20px", borderRadius: 8, background: "#ff4444", border: "none", cursor: stopping ? "not-allowed" : "pointer", color: "white", fontWeight: "bold" }}
              >
                {stopping ? "Stopping…" : "■ Stop Live"}
              </button>
            </>
          ) : (
            <button
              onClick={() => onNavigate && onNavigate("video")}
              style={{ padding: "12px 20px", borderRadius: 8, background: "#ff0000", border: "none", cursor: "pointer", color: "white", fontWeight: "bold" }}
            >
              🔴 Go Live — Join a Video Room
            </button>
          )}
        </div>
        <p style={{ marginTop: 12, color: "#aaa", fontSize: 13 }}>
          Going live happens in a video room — join one and your camera goes
          live to everyone in that room, and they get a “just went live” alert.
        </p>
      </div>

      <StreamDestinations />

      <div style={{ marginTop: 20, background: "#1e1f22", padding: 20, borderRadius: 12 }}>
        <h2>🔔 Live Alerts</h2>
        {alerts.length === 0 ? (
          <p style={{ marginTop: 12, color: "#aaa" }}>
            No live alerts yet — when someone goes live, follows you, or a new
            member joins, it shows up here.
          </p>
        ) : (
          alerts.slice(0, 20).map((n) => (
            <div key={n.id} style={{ marginTop: 10, background: "#2b2d31", padding: 12, borderRadius: 8 }}>
              <b>{n.title}</b>
              <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>{n.body}</div>
              {n.type === "live" && n.refId && (
                <button
                  onClick={() => onNavigate && onNavigate("video", n.refId)}
                  style={{ marginTop: 8, padding: "6px 12px", borderRadius: 6, background: "#00eaff", border: "none", cursor: "pointer", fontWeight: "bold", fontSize: 12 }}
                >
                  Watch live
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
