import { useEffect, useState } from "react";
import io from "socket.io-client";
import axiosInstance from "./api/axios";
import Sidebar from "./components/Sidebar";
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

// Twitch + Discord layout, Streamlabs feel: Discord server rail +
// channels on the left, a Twitch-style main area that takes the
// WHOLE page (full width, full height — no narrow centered column),
// and the live/chat panel on the right as a collapsible OVERLAY, so
// it never squeezes the main content. Every old page is still
// reachable — same page ids, same navigate(). Dark Discord palette
// (#1e1f22 / #2b2d31 / #313338) with the existing cyan (#00eaff)
// accent. Auth, admin (exact Dolo45 only) and the banned lowercase
// dolo45 account are untouched.
const MEMBER_PANEL_PAGES = ["chat", "video", "servers", "dashboard"];

export default function App() {
  const [page, setPage] = useState("landing");
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  // Video room to open when a live notification is tapped.
  const [liveRoom, setLiveRoom] = useState("");
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState("");
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

  // Real servers for the rail + channel sidebar, from the member's
  // own account. Empty when logged out or when they have none.
  const loadServers = () => {
    const userId =
      typeof localStorage !== "undefined" ? localStorage.getItem("tapin_user_id") : null;
    if (!userId) { setServers([]); return; }
    axiosInstance
      .get(`/users/${userId}`)
      .then((res) => setServers(res.data?.servers || []))
      .catch(() => { /* servers are a bonus — the rail still works */ });
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

  const showMemberPanel = MEMBER_PANEL_PAGES.includes(page);
  // Right panel is an overlay, not a column — open by default on
  // live/chat pages, closable with the 👥 button so the tab takes
  // the full page when you want it to.
  const [memberPanelOpen, setMemberPanelOpen] = useState(true);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", background: "#313338", color: "#fff", overflow: "hidden" }}>
      <Sidebar
        onNavigate={navigate}
        page={page}
        servers={servers}
        selectedServer={selectedServer}
        onSelectServer={setSelectedServer}
      />
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

      <div style={{ flex: 1, minWidth: 0, height: "100vh", overflowY: "auto", overflowX: "hidden", background: "#313338", position: "relative" }}>
        {showMemberPanel && (
          <button
            onClick={() => setMemberPanelOpen((v) => !v)}
            title={memberPanelOpen ? "Hide live & online panel" : "Show live & online panel"}
            style={{ position: "absolute", top: 12, right: 12, zIndex: 30, padding: "8px 12px", borderRadius: 8, background: "#2b2d31", color: "#00eaff", border: "1px solid #00eaff", cursor: "pointer", fontWeight: "bold", fontSize: 13 }}
          >
            {memberPanelOpen ? "👥 Hide panel" : "👥 Live & online"}
          </button>
        )}
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
      </div>

      {showMemberPanel && memberPanelOpen && (
        <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, zIndex: 25, boxShadow: "-8px 0 24px rgba(0,0,0,0.5)", borderLeft: "1px solid #1e1f22" }}>
          <MemberPanel onNavigate={navigate} />
        </div>
      )}
    </div>
  );
}
