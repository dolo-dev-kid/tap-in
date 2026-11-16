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

// Discord-style shell: server rail (round icons) | channel sidebar
// (text / voice channels + real servers) | main content | member /
// activity panel (only on chat, video, servers and stream pages).
// Every old page is still reachable — same page ids, same navigate().
// Dark Discord palette (#1e1f22 / #2b2d31 / #313338) with the existing
// cyan (#00eaff) accent. Auth, admin (exact Dolo45 only) and the
// banned lowercase dolo45 account are untouched.
const MEMBER_PANEL_PAGES = ["chat", "video", "servers", "dashboard"];

export default function App() {
  const [page, setPage] = useState("landing");
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  // Video room to open when a live notification is tapped.
  const [liveRoom, setLiveRoom] = useState("");
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState("");

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

  return (
    <div style={{ display: "flex", height: "100vh", background: "#313338", color: "#fff" }}>
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
        servers={servers}
        selectedServer={selectedServer}
        onSelectServer={setSelectedServer}
        friendRequestCount={friendRequestCount}
        notificationCount={notificationCount}
      />

      <div style={{ flex: 1, overflowY: "auto", background: "#313338", minWidth: 0 }}>
        {page === "landing" && <Landing />}
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

      {showMemberPanel && <MemberPanel onNavigate={navigate} />}
    </div>
  );
}
