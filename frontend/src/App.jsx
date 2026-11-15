import { useEffect, useState } from "react";
import io from "socket.io-client";
import axiosInstance from "./api/axios";
import Sidebar from "./components/Sidebar";
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

export default function App() {
  const [page, setPage] = useState("landing");
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  // Video room to open when a live notification is tapped.
  const [liveRoom, setLiveRoom] = useState("");

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
    return () => {
      presenceSocket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0f0f0f" }}>
      <Sidebar
        onNavigate={navigate}
        page={page}
        friendRequestCount={friendRequestCount}
        notificationCount={notificationCount}
      />

      <div style={{ flex: 1, overflowY: "auto" }}>
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
    </div>
  );
}
