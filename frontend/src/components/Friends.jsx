import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";

// Friends are the logged-in user's real friends from the database.
// No sample friends.
export default function Friends({ onNavigate }) {
  const [friends, setFriends] = useState([]);
  const [presence, setPresence] = useState({}); // username -> { online, lastSeenAt }
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const userId =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tapin_user_id")
      : null;

  useEffect(() => {
    if (!userId) return;
    // Online dots for friends (only friends you already added can
    // see your status, and vice versa — never strangers).
    axiosInstance
      .get("/chat/presence", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` }
      })
      .then((res) => {
        const map = {};
        for (const p of res.data?.presence || []) map[p.username] = p;
        setPresence(map);
      })
      .catch(() => { /* presence is a bonus */ });
    setLoading(true);
    axiosInstance
      .get(`/users/${userId}`)
      .then((res) => setFriends(res.data?.friends || []))
      .catch(() => {
        setMessage("Could not load your friends — please try again.");
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const addFriend = async () => {
    const friendName = name.trim();
    if (!friendName) return;
    const userId = localStorage.getItem("tapin_user_id");
    if (!userId) {
      setMessage("Log in first — friends are saved to your account.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await axiosInstance.post("/friends/add", {
        userId,
        friendName
      });
      if (res.data.success) {
        setFriends(res.data.friends);
        setName("");
        setMessage(`Added ${friendName}.`);
      }
    } catch (err) {
      setMessage(
        err.response?.data?.error ||
          "Could not add friend — please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 40, color: "white" }}>
      <h1>Your Friends</h1>

      <div style={{ marginTop: 20 }}>
        {loading ? (
          <p style={{ color: "#aaa" }}>Loading your friends…</p>
        ) : friends.length === 0 ? (
          <p style={{ color: "#aaa" }}>No friends yet — add your first friend.</p>
        ) : (
          friends.map((friend, i) => (
          <div
            key={i}
            style={{
              background: "#1e1f22",
              padding: 15,
              borderRadius: 8,
              marginBottom: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <span>
              {presence[friend]?.online ? "🟢 " : "⚫ "}
              {friend}
              {presence[friend] && !presence[friend].online && presence[friend].lastSeenAt && (
                <span style={{ color: "#777", fontSize: 12 }}>
                  {" "}· last seen {new Date(presence[friend].lastSeenAt).toLocaleDateString()}
                </span>
              )}
            </span>
            <button
              onClick={() => onNavigate && onNavigate("video")}
              title="Open a video room to call"
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                background: "#00eaff",
                border: "none",
                cursor: "pointer",
                color: "black"
              }}
            >
              Call
            </button>
          </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 30 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addFriend();
          }}
          placeholder="Friend's username"
          style={{
            padding: 12,
            borderRadius: 8,
            border: "none",
            background: "#2b2d31",
            color: "white",
            marginRight: 10,
            width: 240
          }}
        />
        <button
          onClick={addFriend}
          disabled={busy}
          style={{
            padding: "12px 20px",
            borderRadius: 8,
            background: "#00eaff",
            border: "none",
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.6 : 1
          }}
        >
          {busy ? "Adding…" : "Add Friend"}
        </button>
        {message && (
          <p style={{ marginTop: 12, color: "#ffce54" }}>{message}</p>
        )}
      </div>
    </div>
  );
}
