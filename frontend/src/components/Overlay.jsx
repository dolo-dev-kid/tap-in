import { useState } from "react";

// Overlay editor — the Add Widget button used to do nothing. Now each
// widget can be toggled on/off and shows in the preview below, so the
// overlay can actually be built on screen (frontend-only for now).
const WIDGETS = [
  { id: "chat", label: "Chat box", preview: "💬 Chat messages appear here" },
  { id: "follow", label: "New follower alert", preview: "🎉 Mia just followed!" },
  { id: "donation", label: "Donation goal", preview: "💰 Donation goal: $120 / $500" }
];

export default function Overlay() {
  const [active, setActive] = useState(["chat"]);

  const toggle = (id) => {
    setActive((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]
    );
  };

  return (
    <div
      style={{
        padding: 40,
        color: "white",
        background: "rgba(0,0,0,0.7)",
        height: "100%"
      }}
    >
      <h1>Overlay Editor</h1>

      <div
        style={{
          marginTop: 20,
          background: "#1e1f22",
          padding: 20,
          borderRadius: 12
        }}
      >
        <p>Add text, alerts, widgets, and more.</p>

        <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {WIDGETS.map((w) => {
            const on = active.includes(w.id);
            return (
              <button
                key={w.id}
                onClick={() => toggle(w.id)}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  background: on ? "#00eaff" : "#2b2d31",
                  border: "none",
                  cursor: "pointer",
                  color: on ? "black" : "white",
                  fontWeight: on ? "bold" : "normal"
                }}
              >
                {on ? "✓ " : "+ "}{w.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          background: "#0a0a0a",
          border: "1px dashed #555",
          padding: 20,
          borderRadius: 12,
          minHeight: 160
        }}
      >
        <p style={{ color: "#aaa", fontSize: 13, marginBottom: 12 }}>
          Preview — this is what viewers would see:
        </p>
        {active.length === 0 ? (
          <p style={{ color: "#777" }}>No widgets on — pick one above.</p>
        ) : (
          active.map((id) => {
            const w = WIDGETS.find((x) => x.id === id);
            return (
              <div
                key={id}
                style={{
                  background: "#1e1f22",
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 10
                }}
              >
                {w.preview}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
