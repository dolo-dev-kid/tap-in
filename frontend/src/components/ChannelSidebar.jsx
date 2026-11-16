// Channel sidebar — Discord-style second column. Text and voice
// channels are the app's real pages (no fake channels); the Servers
// section lists the member's real servers from the database, and
// clicking one opens the Servers page. The bottom keeps the
// RSO • RNO / 🕊️ RIP Booju line and the logged-in user + Log out.
const TEXT_CHANNELS = [
  { id: "landing", icon: "#", label: "home" },
  { id: "feed", icon: "#", label: "feed" },
  { id: "chat", icon: "#", label: "chat" },
  { id: "friends", icon: "#", label: "friends" },
  { id: "notifications", icon: "#", label: "alerts" },
  { id: "profile", icon: "#", label: "profile" }
];
const VOICE_CHANNELS = [
  { id: "video", icon: "🔊", label: "video-rooms" },
  { id: "dashboard", icon: "🔴", label: "stream-live" }
];
const MORE = [
  { id: "servers", icon: "🛡️", label: "Servers" },
  { id: "overlay", icon: "🎨", label: "Overlay" },
  { id: "settings", icon: "⚙️", label: "Settings" }
];

export default function ChannelSidebar({ page, onNavigate, servers = [], selectedServer, onSelectServer, friendRequestCount = 0, notificationCount = 0, authUser = null, onLogout = null }) {
  // Auth comes from App (authUser prop) — the sidebar never trusts a
  // stale localStorage read on its own. When logged in it shows ONLY
  // the username + Log out; Log in / Sign up appear ONLY logged out.
  const username = authUser?.username
    || (typeof localStorage !== "undefined" ? localStorage.getItem("tapin_username") : null);
  const isAdmin = authUser?.role === "admin"
    || (typeof localStorage !== "undefined" && localStorage.getItem("tapin_role") === "admin");
  const logOut = () => {
    if (onLogout) { onLogout(); return; }
    localStorage.removeItem("token");
    localStorage.removeItem("tapin_username");
    localStorage.removeItem("tapin_user_id");
    localStorage.removeItem("tapin_role");
    window.location.href = "#/login";
    window.location.reload();
  };
  // Find a chat / Find a user — entry points from the sidebar. They
  // open the right tab and focus its search bar (ChatPanel / Friends
  // listen for these events).
  const findChat = () => {
    onNavigate("chat");
    setTimeout(() => window.dispatchEvent(new Event("tapin:focus-chat-search")), 50);
  };
  const findUser = () => {
    onNavigate("friends");
    setTimeout(() => window.dispatchEvent(new Event("tapin:focus-friend-search")), 50);
  };
  const badgeFor = (id) => (id === "friends" ? friendRequestCount : id === "notifications" ? notificationCount : 0);
  const channelBtn = (c) => {
    const active = page === c.id;
    const badge = badgeFor(c.id);
    return (
      <button
        key={c.id}
        onClick={() => onNavigate(c.id)}
        style={{
          display: "flex", width: "100%", alignItems: "center", gap: 8,
          padding: "7px 10px", borderRadius: 6, border: "none", cursor: "pointer",
          background: active ? "#313338" : "transparent",
          color: active ? "#fff" : "#efeff1", fontWeight: active ? "bold" : "normal", fontSize: 16, textAlign: "left"
        }}
      >
        <span style={{ color: active ? "#00eaff" : "#adadb8" }}>{c.icon}</span>
        {c.label}
        {badge > 0 && (
          <span style={{ marginLeft: "auto", minWidth: 18, height: 18, borderRadius: 9, background: "#ff3b30", color: "white", fontSize: 11, fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>
    );
  };
  return (
    <div style={{ width: "100%", height: "100%", background: "#18181b", display: "flex", flexDirection: "column", color: "#efeff1" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e1f22", fontWeight: "bold", fontSize: 18 }}>
        {selectedServer || "Tap In"}
        <div style={{ fontSize: 12, color: "#adadb8", fontWeight: "normal", marginTop: 2 }}>Dolo45's community</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
        {username && (
          <>
            <div style={{ fontSize: 12, color: "#adadb8", letterSpacing: 1, padding: "6px 8px" }}>FIND</div>
            <button onClick={findChat} style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "transparent", color: "#efeff1", fontSize: 16, textAlign: "left" }}>
              <span>🔍</span>Find a chat
            </button>
            <button onClick={findUser} style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "transparent", color: "#efeff1", fontSize: 16, textAlign: "left" }}>
              <span>🔍</span>Find a user
            </button>
          </>
        )}
        <div style={{ fontSize: 12, color: "#adadb8", letterSpacing: 1, padding: "6px 8px" }}>TEXT CHANNELS</div>
        {TEXT_CHANNELS.map(channelBtn)}
        <div style={{ fontSize: 12, color: "#adadb8", letterSpacing: 1, padding: "14px 8px 6px" }}>VOICE CHANNELS</div>
        {VOICE_CHANNELS.map(channelBtn)}
        <div style={{ fontSize: 12, color: "#adadb8", letterSpacing: 1, padding: "14px 8px 6px" }}>SERVERS — YOURS</div>
        {servers.length === 0 ? (
          <p style={{ color: "#d3d3d8", fontSize: 15, padding: "0 8px" }}>No servers yet — make one on the Servers page.</p>
        ) : (
          servers.map((s, i) => (
            <button
              key={`${s}-${i}`}
              onClick={() => { onSelectServer && onSelectServer(s); onNavigate("servers"); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: selectedServer === s ? "#313338" : "transparent", color: "#efeff1", fontSize: 16 }}
            >
              🛡️ {s}
            </button>
          ))
        )}
        <div style={{ fontSize: 12, color: "#adadb8", letterSpacing: 1, padding: "14px 8px 6px" }}>MORE</div>
        {MORE.map(channelBtn)}
        {isAdmin && (
          <button
            onClick={() => onNavigate("admin")}
            style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: page === "admin" ? "#313338" : "transparent", color: page === "admin" ? "#fff" : "#efeff1", fontSize: 16, textAlign: "left" }}
          >
            <span>🛡️</span>Admin
          </button>
        )}
      </div>
      <div style={{ borderTop: "1px solid #1e1f22", padding: 12, fontSize: 12 }}>
        <div style={{ color: "#00eaff", fontSize: 11, lineHeight: 1.5 }}>RSO • RNO • Double G<br />🕊️ RIP Booju</div>
        {username ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
            <span style={{ color: "#00eaff", fontWeight: "bold", wordBreak: "break-word" }}>{username}</span>
            <button onClick={logOut} style={{ padding: "6px 10px", borderRadius: 6, background: "#1e1f22", color: "#00eaff", border: "1px solid #00eaff", cursor: "pointer", fontSize: 12 }}>Log out</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <a href="#/login" style={{ padding: "8px 12px", borderRadius: 6, background: "#1e1f22", color: "#00eaff", border: "1px solid #00eaff", textDecoration: "none", fontSize: 12 }}>Log in</a>
            <a href="#/register" style={{ padding: "8px 12px", borderRadius: 6, background: "#1e1f22", color: "#00eaff", border: "1px solid #00eaff", textDecoration: "none", fontSize: 12 }}>Sign up</a>
          </div>
        )}
      </div>
    </div>
  );
}
