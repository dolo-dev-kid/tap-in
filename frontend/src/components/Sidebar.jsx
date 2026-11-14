// Sidebar — every tab labelled, active tab highlighted, and the gear now
// opens a real Settings page (Stream Dashboard gets its own 📊 button).
// The bottom shows Log in / Sign up, or the logged-in username + Log out.
const TABS = [
  { id: "landing", icon: "🏠", label: "Home" },
  { id: "feed", icon: "📱", label: "Feed" },
  { id: "video", icon: "🎥", label: "Video" },
  { id: "chat", icon: "💬", label: "Chat" },
  { id: "profile", icon: "👤", label: "Profile" },
  { id: "friends", icon: "👥", label: "Friends" },
  { id: "servers", icon: "🛡️", label: "Servers" },
  { id: "dashboard", icon: "📊", label: "Stream" },
  { id: "overlay", icon: "🎨", label: "Overlay" },
  { id: "settings", icon: "⚙️", label: "Settings" }
];

export default function Sidebar({ onNavigate, page }) {
  const username =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tapin_username")
      : null;

  const logOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("tapin_username");
    localStorage.removeItem("tapin_user_id");
    window.location.href = "/";
  };

  return (
    <div
      style={{
        width: 92,
        background: "#1e1f22",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 16,
        paddingBottom: 16,
        gap: 8,
        flexShrink: 0
      }}
    >
      {TABS.map((t) => {
        const active = page === t.id;
        return (
          <button
            key={t.id}
            title={t.label}
            aria-label={t.label}
            onClick={() => onNavigate(t.id)}
            style={{
              ...btn,
              background: active ? "#00eaff" : "#2b2d31",
              color: active ? "#000" : "#fff",
              outline: active ? "2px solid #fff" : "none"
            }}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontSize: 10, marginTop: 3 }}>{t.label}</span>
          </button>
        );
      })}

      <div style={{ flex: 1 }} />

      {username ? (
        <div style={{ textAlign: "center", width: "100%", padding: "0 6px" }}>
          <div
            style={{
              color: "#00eaff",
              fontSize: 11,
              wordBreak: "break-word",
              marginBottom: 6
            }}
          >
            {username}
          </div>
          <button onClick={logOut} style={authBtn}>
            Log out
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <a href="/login" style={{ ...authBtn, textDecoration: "none", textAlign: "center" }}>
            Log in
          </a>
          <a href="/register" style={{ ...authBtn, textDecoration: "none", textAlign: "center" }}>
            Sign up
          </a>
        </div>
      )}
    </div>
  );
}

const btn = {
  width: 72,
  height: 56,
  borderRadius: 12,
  border: "none",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center"
};

const authBtn = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "#2b2d31",
  color: "#00eaff",
  border: "1px solid #00eaff",
  cursor: "pointer",
  fontSize: 12,
  display: "block"
};
