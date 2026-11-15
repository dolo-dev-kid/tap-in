import { useEffect, useState } from "react";
import io from "socket.io-client";
import Sidebar from "./components/Sidebar";
import Landing from "./components/Landing";
import Feed from "./components/Feed";
import VideoChat from "./components/VideoChat";
import ChatPanel from "./components/ChatPanel";
import Profile from "./components/Profile";
import Friends from "./components/Friends";
import Servers from "./components/Servers";
import StreamDashboard from "./components/StreamDashboard";
import Overlay from "./components/Overlay";
import Settings from "./components/Settings";
import AdminPanel from "./components/AdminPanel";

export default function App() {
  const [page, setPage] = useState("landing");

  // Online presence: one authenticated socket for the logged-in user,
  // so "who's online now" works no matter which tab they're on. The
  // backend only ever shows your online status to your DM/group
  // partners, your friends, and the admin — never to strangers, and
  // it tracks no location, only online / last seen.
  useEffect(() => {
    const token =
      typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return undefined;
    const presenceSocket = io(
      import.meta.env.VITE_API_URL || "http://localhost:3001",
      { auth: { token } }
    );
    return () => {
      presenceSocket.disconnect();
    };
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0f0f0f" }}>
      <Sidebar onNavigate={setPage} page={page} />

      <div style={{ flex: 1, overflowY: "auto" }}>
        {page === "landing" && <Landing />}
        {page === "feed" && <Feed />}
        {page === "video" && <VideoChat />}
        {page === "chat" && <ChatPanel />}
        {page === "profile" && <Profile />}
        {page === "friends" && <Friends onNavigate={setPage} />}
        {page === "servers" && <Servers />}
        {page === "dashboard" && <StreamDashboard onNavigate={setPage} />}
        {page === "overlay" && <Overlay />}
        {page === "settings" && <Settings />}
        {page === "admin" && <AdminPanel />}
      </div>
    </div>
  );
}
