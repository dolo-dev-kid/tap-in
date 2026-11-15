import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";

// Friends are the logged-in user's real friends from the database.
// Friend requests are real pending requests from the database too:
// "Add Friend" sends a request to the other person, and it shows up
// here at the top of this tab — same green-dot / last-seen treatment
// as online friends — until it is accepted or declined. No sample
// friends, no sample requests.
export default function Friends({ onNavigate }) {
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [presence, setPresence] = useState({}); // username -> { online, lastSeenAt }
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const userId =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tapin_user_id")
      : null;

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`
  });

  const loadRequests = () => {
    if (!localStorage.getItem("token")) return;
    axiosInstance
      .get("/friends/requests", { headers: authHeaders() })
      .then((res) => setRequests(res.data?.requests || []))
      .catch(() => { /* requests are a bonus if the call fails */ });
  };

  useEffect(() => {
    if (!userId) return;
    // Online dots for friends (only friends you already added can
    // see your status, and vice versa — never strangers).
    axiosInstance
      .get("/chat/presence", {
        headers: authHeaders()
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
    loadRequests();
    // Keep requests fresh while this tab is open, so a new request
    // shows up without leaving and coming back.
    const timer = setInterval(loadRequests, 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const res = await axiosInstance.post(
        "/friends/request",
        { friendName },
        { headers: authHeaders() }
      );
      if (res.data.success) {
        setName("");
        setMessage(
          res.data.accepted
            ? `${friendName} had already sent you a request — you're friends now.`
            : res.data.alreadySent
              ? `You already sent ${friendName} a friend request.`
              : `Friend request sent to ${friendName} — they'll see it in their Friend Requests.`
        );
        if (res.data.accepted && res.data.friends) setFriends(res.data.friends);
      }
    } catch (err) {
      setMessage(
        err.response?.data?.error ||
          "Could not send friend request — please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const acceptRequest = async (username) => {
    try {
      const res = await axiosInstance.post(
        `/friends/requests/${encodeURIComponent(username)}/accept`,
        {},
        { headers: authHeaders() }
      );
      if (res.data.success) {
        setRequests((prev) => prev.filter((r) => r.username !== username));
        if (res.data.friends) setFriends(res.data.friends);
        setMessage(`You and ${username} are friends now.`);
      }
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not accept — please try again.");
    }
  };

  const declineRequest = async (username) => {
    try {
      const res = await axiosInstance.post(
        `/friends/requests/${encodeURIComponent(username)}/decline`,
        {},
        { headers: authHeaders() }
      );
      if (res.data.success) {
        setRequests((prev) => prev.filter((r) => r.username !== username));
        setMessage(`Declined ${username}'s friend request.`);
      }
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not decline — please try again.");
    }
  };

  const presenceFor = (username) => {
    // Requests carry their own online/last-seen from the server; the
    // friends presence map is the fallback for accepted friends.
    const fromRequest = requests.find((r) => r.username === username);
    if (fromRequest && (fromRequest.online || fromRequest.lastSeenAt)) {
      return { online: fromRequest.online, lastSeenAt: fromRequest.lastSeenAt };
    }
    return presence[username];
  };

  return (
    <div style={{ padding: 40, color: "white" }}>
      <h1>Your Friends</h1>

      {/* Friend Requests — always visible at the top, with a count,
          so a request can never sit hidden the way it used to. */}
      <div
        style={{
          marginTop: 20,
          background: requests.length > 0 ? "#1a2b33" : "#1e1f22",
          border: requests.length > 0 ? "2px solid #00eaff" : "1px solid #2b2d31",
          padding: 15,
          borderRadius: 8
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>
          Friend Requests
          {requests.length > 0 && (
            <span
              style={{
                marginLeft: 10,
                background: "#ff3b30",
                color: "white",
                borderRadius: 12,
                padding: "2px 10px",
                fontSize: 14
              }}
            >
              {requests.length}
            </span>
          )}
        </h2>
        {requests.length === 0 ? (
          <p style={{ color: "#aaa", margin: "10px 0 0" }}>
            No friend requests right now — when someone adds you, they'll show up here.
          </p>
        ) : (
          requests.map((req) => {
            const p = presenceFor(req.username);
            return (
              <div
                key={req.username}
                style={{
                  background: "#1e1f22",
                  padding: 15,
                  borderRadius: 8,
                  marginTop: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10
                }}
              >
                <span>
                  {p?.online ? "🟢 " : "⚫ "}
                  {req.username}
                  {p && !p.online && p.lastSeenAt && (
                    <span style={{ color: "#777", fontSize: 12 }}>
                      {" "}· last seen {new Date(p.lastSeenAt).toLocaleDateString()}
                    </span>
                  )}
                  {req.createdAt && (
                    <span style={{ color: "#777", fontSize: 12 }}>
                      {" "}· {new Date(req.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </span>
                <span style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => acceptRequest(req.username)}
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
                    onClick={() => declineRequest(req.username)}
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
              </div>
            );
          })
        )}
      </div>

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
            <span>
              <button
                onClick={() => {
                  // Hand the friend's name to the Messages tab, which
                  // opens a private chat with them when it mounts.
                  localStorage.setItem("tapin_dm_username", friend);
                  onNavigate && onNavigate("chat");
                }}
                title="Send a private message"
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  background: "#00eaff",
                  border: "none",
                  cursor: "pointer",
                  color: "black",
                  marginRight: 8
                }}
              >
                Message
              </button>
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
            </span>
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
          {busy ? "Sending…" : "Add Friend"}
        </button>
        {message && (
          <p style={{ marginTop: 12, color: "#ffce54" }}>{message}</p>
        )}
      </div>
    </div>
  );
}
