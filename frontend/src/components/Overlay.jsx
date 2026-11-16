import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";

// Overlay editor — widgets wired to real data where it exists, and
// honest where it doesn't. Chat box: a live-chat display (no fake
// messages in the preview). New follower alert: the latest real
// friend request / friend-accepted event from the member's real
// notifications — or "no new follower yet". Donation goal: Tap In
// has NO donation-goal state on the backend, so it shows
// "not connected yet" instead of a fake $0 / $500. Toggles are
// frontend-only (which widgets show in the preview), like before.
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("token") || ""}` };
}

const WIDGETS = [
  { id: "chat", label: "Chat box" },
  { id: "follow", label: "New follower alert" },
  { id: "donation", label: "Donation goal" }
];

export default function Overlay() {
  const [active, setActive] = useState(["chat"]);
  const [latestFollow, setLatestFollow] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { setLoading(false); return; }
    axiosInstance
      .get("/notifications", { headers: authHeaders() })
      .then((res) => {
        const follows = (res.data?.notifications || []).filter((n) =>
          ["friend_request", "friend_accepted", "member_joined"].includes(n.type)
        );
        setLatestFollow(follows[0] || null);
      })
      .catch(() => { /* follower alert falls back to "none yet" */ })
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id) => {
    setActive((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]
    );
  };

  const previewFor = (id) => {
    if (id === "chat") return "💬 Chat box — live chat messages show here when you're streaming.";
    if (id === "follow") {
      if (loading) return "🎉 New follower alert — checking for real follows…";
      if (!latestFollow) return "🎉 New follower alert — no new follower yet. Real friend requests and new members will pop up here.";
      return `🎉 ${latestFollow.title} — ${latestFollow.body || ""}`;
    }
    // Donation goal: no backend state exists for this. Never fake $0/$500.
    return "💰 Donation goal — not connected yet. Tap In has no donation goal set up, so there's no amount to show.";
  };

  return (
    <div style={{ padding: 40, color: "white", background: "rgba(0,0,0,0.7)", height: "100%" }}>
      <h1>Overlay Editor</h1>
      <div style={{ marginTop: 20, background: "#1e1f22", padding: 20, borderRadius: 12 }}>
        <p>Add text, alerts, widgets, and more.</p>
        <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {WIDGETS.map((w) => {
            const on = active.includes(w.id);
            return (
              <button
                key={w.id}
                onClick={() => toggle(w.id)}
                style={{
                  padding: "12px 20px", borderRadius: 8,
                  background: on ? "#00eaff" : "#2b2d31", border: "none",
                  cursor: "pointer", color: on ? "black" : "white",
                  fontWeight: on ? "bold" : "normal"
                }}
              >
                {on ? "✓ " : "+ "}{w.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 20, background: "#0a0a0a", border: "1px dashed #555", padding: 20, borderRadius: 12, minHeight: 160 }}>
        <p style={{ color: "#aaa", fontSize: 13, marginBottom: 12 }}>
          Preview — this is what viewers would see:
        </p>
        {active.length === 0 ? (
          <p style={{ color: "#777" }}>No widgets on — pick one above.</p>
        ) : (
          active.map((id) => (
            <div key={id} style={{ background: "#1e1f22", padding: 12, borderRadius: 8, marginBottom: 10 }}>
              {previewFor(id)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
