// Tap In — Twitch layout (Nov 16, 2026).
//
// Why this rewrite: Wesley said "The app.jsx is trash I can't see
// shit" — and he was right. The old shell had THREE things eating the
// screen at once: a 72px Discord server rail + a 240px channel
// sidebar (312px fixed, before any content) AND a 260px member panel
// rendered as an absolute overlay ON TOP of the main area. On a phone
// (~375px wide) that left about 60px for the actual page. Text was
// 11–14px grey (#80848e / #aaa) on grey (#313338), and pages sat in
// narrow 560px boxes. So: make it like Twitch.
//
// New layout, Twitch-style:
// - Top bar (56px): hamburger (mobile), TAP IN logo, big nav
//   (Browse / Live / Chat / Friends / Profile), search, Alerts bell
//   with unread badge, username + Log out (or Log in / Sign up).
// - ONE left nav (240px, collapsible): the channel sidebar. The
//   Discord server rail is gone — servers still live in the sidebar's
//   SERVERS section. On phones the nav is hidden until the hamburger
//   opens it as a drawer, so the page takes the whole screen.
// - Main area: flex:1, full width, full height, Twitch-dark
//   (#0e0e10), 16px base text, white/high-contrast. No narrow
//   centered column, nothing hidden behind a panel.
// - Right panel (LIVE NOW / ONLINE NOW): a REAL flex column, 340px,
//   only on live/chat pages — never an absolute overlay, so it can't
//   cover the page. Closable with the "Chat" button in the top bar /
//   page header; on phones it opens as a drawer instead.
// - Live stream stays front and center: the video page is the main
//   area, chat sits in the right column when live.
// Auth, admin (exact Dolo45 only), banned lowercase dolo45, referral,
// uploads, private chats, alerts, social links, Stream Destinations —
// all untouched. No fake/sample data, ever.
import { useEffect, useState } from "react";
import io from "socket.io-client";
import axiosInstance from "./api/axios";
import ChannelSidebar from "./components/ChannelSidebar";
import MemberPanel from "./components/MemberPanel";
import Landing from "./components/Landing";
import Feed from "./components/Feed";
import VideoChat from "./components/VideoChat";
import ChatPanel from "./components/ChatPanel";
import Profile from "./components/Profile";
import Friends from "./components/Friends";
import Notifications from "./components/Notifications";
import Servers from "./components/Servers";
import StreamDashboard from "./components/StreamDashboard";
import Overlay from "./components/Overlay";
import Settings from "./components/Settings";
import AdminPanel from "./components/AdminPanel";

// Pages where the LIVE NOW / ONLINE NOW right column belongs.
const MEMBER_PANEL_PAGES = ["chat", "video", "servers", "dashboard"];

const PAGE_TITLES = {
  landing: "Home",
  feed: "Feed",
  video: "Video Rooms — Live",
  chat: "Chat",
  profile: "Profile",
  friends: "Friends",
  notifications: "Alerts",
  servers: "Servers",
  dashboard: "Stream Dashboard",
  overlay: "Overlay",
  settings: "Settings",
  admin: "Admin",
};

export default function App() {
  const [page, setPage] = useState("landing");
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  // Video room to open when a live notification is tapped.
  const [liveRoom, setLiveRoom] = useState("");
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState("");
  // Left nav: open on desktop, closed on phones (CSS also hides it
  // under 900px unless .open — this state drives that class).
  const [leftOpen, setLeftOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 900
  );
  // Right live/chat column: open on desktop live pages, closed on
  // phones — the user opens it with the Chat button when they want it.
  const [rightOpen, setRightOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 900
  );
  const [topSearch, setTopSearch] = useState("");
  // Auth state lives HERE, not scattered as localStorage reads in
  // every component. That was the Log in / Sign up bug (Nov 16):
  // the shell read tapin_username once at mount, so after a login
  // (or an older session that stored a token but no username) the
  // sidebar and Landing kept showing Log in / Sign up while logged
  // in. syncAuth re-reads storage on mount, on storage/hash changes
  // and on focus, and recovers the username from the token alone
  // via GET /auth/me when localStorage has no username saved.
  const [authUser, setAuthUser] = useState(null);
  const syncAuth = async () => {
    if (typeof localStorage === "undefined") return;
    const token = localStorage.getItem("token");
    if (!token) { setAuthUser(null); return; }
    let username = localStorage.getItem("tapin_username");
    let userId = localStorage.getItem("tapin_user_id");
    let role = localStorage.getItem("tapin_role");
    if (!username) {
      try {
        const res = await axiosInstance.get("/auth/me", { headers: { Authorization: `Bearer ${token}` } });
        if (res.data?.user?.username) {
          username = res.data.user.username;
          userId = String(res.data.user.id);
          role = res.data.user.role || role;
          localStorage.setItem("tapin_username", username);
          localStorage.setItem("tapin_user_id", userId);
          if (role) localStorage.setItem("tapin_role", role);
        }
      } catch (err) { /* token may be stale — shell stays logged out */ }
    }
    setAuthUser(username ? { username, id: userId, role } : null);
  };
  // Log out: clear everything, then force a fresh load on the login
  // page. A plain hash change to "#/" does nothing when the app is
  // already on "#/", which left the old username on screen.
  const handleLogout = () => {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("tapin_username");
      localStorage.removeItem("tapin_user_id");
      localStorage.removeItem("tapin_role");
    }
    setAuthUser(null);
    window.location.href = "#/login";
    window.location.reload();
  };
  useEffect(() => {
    syncAuth();
    const onAuthChange = () => syncAuth();
    window.addEventListener("storage", onAuthChange);
    window.addEventListener("hashchange", onAuthChange);
    window.addEventListener("focus", onAuthChange);
    window.addEventListener("tapin:auth-changed", onAuthChange);
    return () => {
      window.removeEventListener("storage", onAuthChange);
      window.removeEventListener("hashchange", onAuthChange);
      window.removeEventListener("focus", onAuthChange);
      window.removeEventListener("tapin:auth-changed", onAuthChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // navigate(page, room?) — a live notification passes the room name
  // so Video Chat opens on that person's live room.
  const navigate = (nextPage, room) => {
    if (room) setLiveRoom(room);
    setPage(nextPage);
    // On phones, tapping a nav item closes the drawer so the page
    // itself is what you see — not the menu covering it.
    if (typeof window !== "undefined" && window.innerWidth <= 900) setLeftOpen(false);
  };

  // Top-bar search: jump to Friends and focus its search box.
  const submitTopSearch = (e) => {
    e.preventDefault();
    navigate("friends");
    setTimeout(() => window.dispatchEvent(new Event("tapin:focus-friend-search")), 50);
  };

  const loadBadgeCounts = () => {
    const token =
      typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    axiosInstance
      .get("/friends/requests", { headers })
      .then((res) => setFriendRequestCount((res.data?.requests || []).length))
      .catch(() => { /* badge is a bonus */ });
    axiosInstance
      .get("/notifications", { headers })
      .then((res) => setNotificationCount(res.data?.unreadCount || 0))
      .catch(() => { /* badge is a bonus */ });
  };

  // Real servers for the nav + channel sidebar, from the member's
  // own account. Empty when logged out or when they have none.
  const loadServers = () => {
    const userId =
      typeof localStorage !== "undefined" ? localStorage.getItem("tapin_user_id") : null;
    if (!userId) { setServers([]); return; }
    axiosInstance
      .get(`/users/${userId}`)
      .then((res) => setServers(res.data?.servers || []))
      .catch(() => { /* servers are a bonus — the nav still works */ });
  };

  // Badge counts: pending friend requests on the Friends tab, unread
  // notifications on the Alerts (bell) tab — visible the moment the
  // app opens, same idea as the who's-online dots. Refreshed every
  // 30 seconds while logged in, and immediately whenever a live
  // "notification" event arrives over the socket.
  useEffect(() => {
    const token =
      typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return undefined;
    loadBadgeCounts();
    loadServers();
    const timer = setInterval(loadBadgeCounts, 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Online presence: one authenticated socket for the logged-in user,
  // so "who's online now" works no matter which tab they're on. The
  // backend only ever shows your online status to your DM/group
  // partners, your friends, and the admin — never to strangers, and
  // it tracks no location, only online / last seen. The same socket
  // also carries live "notification" events, so the bell badge lights
  // up the moment something happens — no waiting for the next poll.
  useEffect(() => {
    const token =
      typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return undefined;
    const presenceSocket = io(
      import.meta.env.VITE_API_URL || "http://localhost:3001",
      { auth: { token } }
    );
    presenceSocket.on("notification", () => loadBadgeCounts());
    presenceSocket.on("live-started", () => loadBadgeCounts());
    return () => {
      presenceSocket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showRightPanel = MEMBER_PANEL_PAGES.includes(page);
  const isAdmin = authUser?.role === "admin";
  const username = authUser?.username || null;

  const topNavBtn = (id, label, badge = 0) => (
    <button
      key={id}
      onClick={() => navigate(id)}
      className="tapin-topnav-btn"
      style={{
        background: page === id ? "#00eaff" : "transparent",
        color: page === id ? "#000" : "#efeff1",
      }}
    >
      {label}
      {badge > 0 && (
        <span className="tapin-badge">{badge > 9 ? "9+" : badge}</span>
      )}
    </button>
  );

  return (
    <div className="tapin-root">
      {/* ── Twitch-style top bar ─────────────────────────────── */}
      <header className="tapin-topbar">
        <button
          className="tapin-hamburger"
          onClick={() => setLeftOpen((v) => !v)}
          aria-label={leftOpen ? "Hide menu" : "Show menu"}
          title="Menu"
        >
          ☰
        </button>
        <button
          className="tapin-logo"
          onClick={() => navigate("landing")}
          title="Tap In — Home"
        >
          <span className="tapin-logo-badge">D45</span>
          TAP&nbsp;IN
        </button>
        <nav className="tapin-topnav" aria-label="Main">
          {topNavBtn("feed", "Browse")}
          {topNavBtn("dashboard", "🔴 Live")}
          {topNavBtn("chat", "Chat")}
          {topNavBtn("friends", "Friends", friendRequestCount)}
          {topNavBtn("profile", "Profile")}
          {isAdmin && topNavBtn("admin", "🛡️ Admin")}
        </nav>
        <form className="tapin-topsearch" onSubmit={submitTopSearch}>
          <input
            type="search"
            value={topSearch}
            onChange={(e) => setTopSearch(e.target.value)}
            placeholder="Find a friend or chat…"
            aria-label="Find a friend or chat"
          />
          <button type="submit" aria-label="Search">🔍</button>
        </form>
        <div className="tapin-topbar-right">
          {showRightPanel && (
            <button
              className="tapin-panel-toggle"
              onClick={() => setRightOpen((v) => !v)}
              title={rightOpen ? "Hide live & online panel" : "Show live & online panel"}
            >
              {rightOpen ? "💬 Hide chat" : "💬 Chat"}
            </button>
          )}
          {username ? (
            <>
              <button
                className="tapin-bell"
                onClick={() => navigate("notifications")}
                title="Alerts"
                aria-label={`Alerts, ${notificationCount} unread`}
              >
                🔔
                {notificationCount > 0 && (
                  <span className="tapin-badge">{notificationCount > 9 ? "9+" : notificationCount}</span>
                )}
              </button>
              <span className="tapin-user-chip" title={`Logged in as ${username}`}>
                {username}
              </span>
              <button className="tapin-logout-btn" onClick={handleLogout}>Log out</button>
            </>
          ) : (
            <>
              <a className="tapin-login-btn" href="#/login">Log in</a>
              <a className="tapin-signup-btn" href="#/register">Sign up</a>
            </>
          )}
        </div>
      </header>

      {/* ── Body: left nav | main | right live/chat column ───── */}
      <div className="tapin-body">
        <div className={`tapin-left ${leftOpen ? "open" : "closed"}`}>
          <ChannelSidebar
            page={page}
            onNavigate={navigate}
            authUser={authUser}
            onLogout={handleLogout}
            servers={servers}
            selectedServer={selectedServer}
            onSelectServer={setSelectedServer}
            friendRequestCount={friendRequestCount}
            notificationCount={notificationCount}
          />
        </div>
        {leftOpen && (
          <button
            className="tapin-left-scrim"
            aria-label="Close menu"
            onClick={() => setLeftOpen(false)}
          />
        )}

        <main className="tapin-main">
          <div className="tapin-page-head">
            <h1>{PAGE_TITLES[page] || "Tap In"}</h1>
            {showRightPanel && (
              <button
                className="tapin-panel-toggle"
                onClick={() => setRightOpen((v) => !v)}
              >
                {rightOpen ? "💬 Hide chat" : "💬 Show chat"}
              </button>
            )}
          </div>
          {page === "landing" && <Landing authUser={authUser} />}
          {page === "feed" && <Feed />}
          {page === "video" && <VideoChat initialRoom={liveRoom} />}
          {page === "chat" && <ChatPanel />}
          {page === "profile" && <Profile />}
          {page === "friends" && <Friends onNavigate={navigate} />}
          {page === "notifications" && (
            <Notifications onNavigate={navigate} onCountChange={setNotificationCount} />
          )}
          {page === "servers" && <Servers />}
          {page === "dashboard" && <StreamDashboard onNavigate={navigate} />}
          {page === "overlay" && <Overlay />}
          {page === "settings" && <Settings />}
          {page === "admin" && <AdminPanel />}
        </main>

        {showRightPanel && rightOpen && (
          <aside className="tapin-right">
            <div className="tapin-right-head">
              <span>🔴 LIVE &amp; 🟢 ONLINE</span>
              <button
                className="tapin-right-close"
                onClick={() => setRightOpen(false)}
                aria-label="Hide live and online panel"
              >
                ✕
              </button>
            </div>
            <MemberPanel onNavigate={navigate} />
          </aside>
        )}
      </div>
    </div>
  );
}
