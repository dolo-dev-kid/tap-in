import { useState } from "react";
import axiosInstance from "../api/axios";

// Friends are stored per-account, so Add Friend calls the real API.
// Without a login it says so plainly instead of pretending to work;
// while the database is down the server's 503 message is shown as-is.
export default function Friends({ onNavigate }) {
  const [friends, setFriends] = useState(["Alex", "Mia", "Jay", "Sam"]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

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
      <p style={{ marginTop: 8, color: "#aaa", fontSize: 14 }}>
        Sample friends below — your real friends list appears once you log in
        and the database is connected.
      </p>

      <div style={{ marginTop: 20 }}>
        {friends.map((friend, i) => (
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
            <span>{friend}</span>
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
        ))}
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
