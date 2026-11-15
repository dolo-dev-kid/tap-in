import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";

// Servers are the logged-in user's real servers from the database.
// No sample servers.
export default function Servers() {
  const [servers, setServers] = useState([]);
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
    setLoading(true);
    axiosInstance
      .get(`/users/${userId}`)
      .then((res) => setServers(res.data?.servers || []))
      .catch(() => {
        setMessage("Could not load your servers — please try again.");
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const createServer = async () => {
    const serverName = name.trim();
    if (!serverName) return;
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

      {loading ? (
        <p style={{ marginTop: 20, color: "#aaa" }}>Loading your servers…</p>
      ) : servers.length === 0 ? (
        <p style={{ marginTop: 20, color: "#aaa" }}>
          No servers yet — create your first one.
        </p>
      ) : (
        servers.map((s, i) => (
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
        ))
      )}

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
