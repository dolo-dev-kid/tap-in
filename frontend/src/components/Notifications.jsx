import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";

// Notifications — the bell. Tap In had NO notification system at all
// before this: no bell, no badge, no alert for friend requests,
// friends coming online, messages, new members, or anyone going
// live. This page lists them newest first, with a red unread count,
// and it refreshes itself plus updates live over the socket (the App
// reloads the badge the moment a "notification" event arrives).
const TYPE_ICON = {
  friend_request: "🙋",
  friend_accepted: "🎉",
  friend_online: "🟢",
  member_joined: "👋",
  message: "💬",
  live: "🔴"
};

export default function Notifications({ onNavigate, onCountChange }) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`
  });

  const load = () => {
    if (!localStorage.getItem("token")) return;
    axiosInstance
      .get("/notifications", { headers: authHeaders() })
      .then((res) => {
        setItems(res.data?.notifications || []);
        setUnread(res.data?.unreadCount || 0);
        if (onCountChange) onCountChange(res.data?.unreadCount || 0);
      })
      .catch(() => { /* list stays as it is */ });
  };

  useEffect(() => {
    setLoading(true);
    load();
    setLoading(false);
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markRead = async (id) => {
    try {
      await axiosInstance.post(`/notifications/${id}/read`, {}, { headers: authHeaders() });
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnread((u) => Math.max(0, u - 1));
      if (onCountChange) onCountChange(Math.max(0, unread - 1));
    } catch (err) { /* already read is fine */ }
  };

  const markAllRead = async () => {
    try {
      await axiosInstance.post("/notifications/read-all", {}, { headers: authHeaders() });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
      if (onCountChange) onCountChange(0);
    } catch (err) {
      setMessage("Could not mark all read — please try again.");
    }
  };

  const acceptRequest = async (n) => {
    try {
      await axiosInstance.post(
        `/friends/requests/${encodeURIComponent(n.fromUsername || n.refId)}/accept`,
        {},
        { headers: authHeaders() }
      );
      setMessage(`You and ${n.fromUsername} are friends now.`);
      await markRead(n.id);
      load();
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not accept — please try again.");
    }
  };

  const declineRequest = async (n) => {
    try {
      await axiosInstance.post(
        `/friends/requests/${encodeURIComponent(n.fromUsername || n.refId)}/decline`,
        {},
        { headers: authHeaders() }
      );
      setMessage(`Declined ${n.fromUsername}'s friend request.`);
      await markRead(n.id);
      load();
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not decline — please try again.");
    }
  };

  // Tapping a notification opens what it is about: a live one opens
  // that person's video room, a message opens chat, a friend request
  // stays here so you can Accept / Decline it.
  const openNotification = (n) => {
    if (!n.read) markRead(n.id);
    if (n.type === "live" && n.refId) {
      if (onNavigate) onNavigate("video", n.refId);
    } else if (n.type === "message" && n.refId && n.refId !== "global") {
      if (onNavigate) onNavigate("chat");
    } else if (n.type === "message" && n.refId === "global") {
      if (onNavigate) onNavigate("chat");
    } else if (n.type === "friend_request") {
      if (onNavigate) onNavigate("friends");
    }
  };

  return (
    <div style={{ padding: 40, color: "white" }}>
      <h1>
        🔔 Notifications
        {unread > 0 && (
          <span
            style={{
              marginLeft: 10,
              background: "#ff3b30",
              color: "white",
              borderRadius: 12,
              padding: "2px 10px",
              fontSize: 16
            }}
          >
            {unread} new
          </span>
        )}
      </h1>
      <p style={{ color: "#aaa", marginTop: 8 }}>
        Friend requests, friends coming online, new messages, new members, and anyone going live — all in one place.
      </p>

      {unread > 0 && (
        <button
          onClick={markAllRead}
          style={{
            marginTop: 16,
            padding: "10px 18px",
            borderRadius: 8,
            background: "#2b2d31",
            border: "1px solid #00eaff",
            color: "#00eaff",
            cursor: "pointer"
          }}
        >
          Mark all read
        </button>
      )}

      {message && <p style={{ marginTop: 12, color: "#ffce54" }}>{message}</p>}

      <div style={{ marginTop: 20 }}>
        {loading ? (
          <p style={{ color: "#aaa" }}>Loading notifications…</p>
        ) : items.length === 0 ? (
          <p style={{ color: "#aaa" }}>
            Nothing yet — when someone adds you, comes online, messages you, or goes live, it'll show up here.
          </p>
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              onClick={() => openNotification(n)}
              style={{
                background: n.read ? "#1e1f22" : "#1a2b33",
                border: n.read ? "1px solid #2b2d31" : "2px solid #00eaff",
                padding: 15,
                borderRadius: 8,
                marginBottom: 10,
                cursor: "pointer"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontWeight: n.read ? "normal" : "bold" }}>
                  {TYPE_ICON[n.type] || "🔔"} {n.title}
                </span>
                {n.createdAt && (
                  <span style={{ color: "#777", fontSize: 12, whiteSpace: "nowrap" }}>
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                )}
              </div>
              {n.body && (
                <p style={{ color: "#ccc", margin: "8px 0 0", fontSize: 14 }}>{n.body}</p>
              )}
              {n.type === "friend_request" && (
                <span
                  style={{ display: "flex", gap: 8, marginTop: 12 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => acceptRequest(n)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      background: "#22c55e",
                      border: "none",
                      cursor: "pointer",
                      color: "white",
                      fontWeight: "bold"
                    }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => declineRequest(n)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      background: "#3a3b3f",
                      border: "1px solid #555",
                      cursor: "pointer",
                      color: "white"
                    }}
                  >
                    Decline
                  </button>
                </span>
              )}
              {n.type === "live" && (
                <p style={{ color: "#00eaff", margin: "8px 0 0", fontSize: 14 }}>
                  Tap to watch live →
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
