import { useState } from "react";
import axiosInstance from "../api/axios";

// Create Server calls the real API. Without a login it says so plainly
// instead of pretending to work; while the database is down the server's
// 503 message is shown as-is.
export default function Servers() {
  const [servers, setServers] = useState([
    "Creators Hub",
    "Gamers Lounge",
    "Music Zone"
  ]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const createServer = async () => {
    const serverName = name.trim();
    if (!serverName) return;
    const userId = localStorage.getItem("tapin_user_id");
    if (!userId) {
      setMessage("Log in first — servers are saved to your account.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await axiosInstance.post("/servers/create", {
        userId,
        serverName
      });
      if (res.data.success) {
        setServers(res.data.servers);
        setName("");
        setMessage(`Created server “${serverName}”.`);
      }
    } catch (err) {
      setMessage(
        err.response?.data?.error ||
          "Could not create server — please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 40, color: "white" }}>
      <h1>Your Servers</h1>
      <p style={{ marginTop: 8, color: "#aaa", fontSize: 14 }}>
        Sample servers below — your real servers appear once you log in and
        the database is connected.
      </p>

      {servers.map((s, i) => (
        <div
          key={i}
          style={{
            background: "#1e1f22",
            padding: 20,
            borderRadius: 12,
            marginTop: 20
          }}
        >
          {s}
        </div>
      ))}

      <div style={{ marginTop: 30 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") createServer();
          }}
          placeholder="New server name"
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
          onClick={createServer}
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
          {busy ? "Creating…" : "Create Server"}
        </button>
        {message && (
          <p style={{ marginTop: 12, color: "#ffce54" }}>{message}</p>
        )}
      </div>
    </div>
  );
}
