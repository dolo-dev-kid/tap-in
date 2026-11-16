// Server rail — Discord-style left rail: round server icons.
// Home is Dolo45 (the owner's home server), then one round icon per
// real server from the member's account, then + to create a server.
// No sample servers — empty means no icons, just Home and +.
// The old 92px tab sidebar is replaced by this rail + the channel
// sidebar in App.jsx; every page is still reachable from there.
export default function Sidebar({ onNavigate, page, servers = [], selectedServer, onSelectServer }) {
  const goHome = () => { onSelectServer && onSelectServer(""); onNavigate("landing"); };
  return (
    <div style={{ width: 72, background: "#1e1f22", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, paddingBottom: 12, gap: 10, flexShrink: 0 }}>
      <button
        onClick={goHome}
        title="Tap In — Home"
        aria-label="Tap In — Home"
        style={{
          width: 48, height: 48, borderRadius: page === "landing" && !selectedServer ? 14 : "50%",
          border: "none", cursor: "pointer", background: page === "landing" && !selectedServer ? "#00eaff" : "#2b2d31",
          color: page === "landing" && !selectedServer ? "#000" : "#00eaff", fontWeight: "bold", fontSize: 13,
          transition: "border-radius 0.15s"
        }}
      >
        D45
      </button>
      <div style={{ width: 32, height: 1, background: "#2b2d31" }} />
      {servers.map((s, i) => {
        const active = selectedServer === s;
        const initial = (s || "?").trim().charAt(0).toUpperCase();
        return (
          <button
            key={`${s}-${i}`}
            onClick={() => { onSelectServer && onSelectServer(s); onNavigate("servers"); }}
            title={`Server: ${s}`}
            aria-label={`Server: ${s}`}
            style={{
              width: 48, height: 48, borderRadius: active ? 14 : "50%",
              border: "none", cursor: "pointer", background: active ? "#00eaff" : "#2b2d31",
              color: active ? "#000" : "#fff", fontWeight: "bold", fontSize: 18,
              transition: "border-radius 0.15s"
            }}
          >
            {initial}
          </button>
        );
      })}
      <button
        onClick={() => onNavigate("servers")}
        title="Create a server"
        aria-label="Create a server"
        style={{ width: 48, height: 48, borderRadius: "50%", border: "none", cursor: "pointer", background: "#2b2d31", color: "#22c55e", fontSize: 24, fontWeight: "bold" }}
      >
        +
      </button>
      <div style={{ flex: 1 }} />
      <div style={{ textAlign: "center", color: "#00eaff", fontSize: 9, lineHeight: 1.5 }}>
        RSO • RNO
        <br />
        🕊️ RIP Booju
      </div>
    </div>
  );
}
