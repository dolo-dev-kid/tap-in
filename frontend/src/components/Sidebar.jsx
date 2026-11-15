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
  { id: "notifications", icon: "🔔", label: "Alerts" },
  { id: "servers", icon: "🛡️", label: "Servers" },
  { id: "dashboard", icon: "📊", label: "Stream" },
  { id: "overlay", icon: "🎨", label: "Overlay" },
  { id: "settings", icon: "⚙️", label: "Settings" }
];

export default function Sidebar({ onNavigate, page, friendRequestCount = 0, notificationCount = 0 }) {
  const username =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tapin_username")
      : null;
  // Admin tab shows only for the owner's admin account.
  const isAdmin =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("tapin_role") === "admin";
  const tabs = isAdmin
    ? [...TABS, { id: "admin", icon: "🛡️", label: "Admin" }]
    : TABS;

  const logOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("tapin_username");
    localStorage.removeItem("tapin_user_id");
    localStorage.removeItem("tapin_role");
    window.location.href = "#/";
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
      {tabs.map((t) => {
        const active = page === t.id;
        // Red badge counts: pending friend requests on Friends, unread
        // notifications on Alerts — visible on the sidebar the moment
        // the app opens, no tab to open first.
        const badgeCount =
          t.id === "friends" ? friendRequestCount
          : t.id === "notifications" ? notificationCount
          : 0;
        const showBadge = badgeCount > 0;
        const badgeLabel =
          t.id === "friends"
            ? `Friends — ${badgeCount} friend request${badgeCount === 1 ? "" : "s"} waiting`
            : `Alerts — ${badgeCount} unread notification${badgeCount === 1 ? "" : "s"}`;
        return (
          <button
            key={t.id}
            title={showBadge ? badgeLabel : t.label}
            aria-label={showBadge ? badgeLabel : t.label}
            onClick={() => onNavigate(t.id)}
            style={{
              ...btn,
              position: "relative",
              background: active ? "#00eaff" : "#2b2d31",
              color: active ? "#000" : "#fff",
              outline: active ? "2px solid #fff" : "none"
            }}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontSize: 10, marginTop: 3 }}>{t.label}</span>
            {showBadge && (
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  minWidth: 20,
                  height: 20,
                  borderRadius: 10,
                  background: "#ff3b30",
                  color: "white",
                  fontSize: 12,
                  fontWeight: "bold",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 5px"
                }}
              >
                {badgeCount > 9 ? "9+" : badgeCount}
              </span>
            )}
          </button>
        );
      })}

      <div style={{ flex: 1 }} />

      <div
        style={{
          textAlign: "center",
          width: "100%",
          padding: "0 4px",
          marginBottom: 10,
          color: "#00eaff",
          fontSize: 9,
          lineHeight: 1.5
        }}
      >
        RSO • RNO
        <br />
        Double G
        <br />
        🕊️ RIP Booju
      </div>

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
          <a href="#/login" style={{ ...authBtn, textDecoration: "none", textAlign: "center" }}>
            Log in
          </a>
          <a href="#/register" style={{ ...authBtn, textDecoration: "none", textAlign: "center" }}>
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
