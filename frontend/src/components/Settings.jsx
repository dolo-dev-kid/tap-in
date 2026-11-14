import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";

// Real Settings page — the ⚙️ gear used to open the Stream Dashboard.
// Shows account state, backend + database status, and log out.
export default function Settings() {
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState("");

  const username =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tapin_username")
      : null;

  useEffect(() => {
    axiosInstance
      .get("/health")
      .then((res) => setHealth(res.data))
      .catch((err) => setHealthError(err.message || "Could not reach backend"));
  }, []);

  const logOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("tapin_username");
    localStorage.removeItem("tapin_user_id");
    window.location.href = "/";
  };

  return (
    <div style={{ padding: 40, color: "white", maxWidth: 640 }}>
      <h1>Settings</h1>

      <div style={{ marginTop: 20, background: "#1e1f22", padding: 20, borderRadius: 12 }}>
        <h2>Account</h2>
        {username ? (
          <>
            <p style={{ marginTop: 10 }}>Logged in as <strong>{username}</strong></p>
            <button onClick={logOut} style={btn}>
              Log out
            </button>
          </>
        ) : (
          <>
            <p style={{ marginTop: 10 }}>You are not logged in.</p>
            <p style={{ marginTop: 6, color: "#aaa", fontSize: 14 }}>
              Log in to save friends, servers, and your profile to your account.
            </p>
            <a href="/login" style={{ ...btn, display: "inline-block", textDecoration: "none", marginRight: 10 }}>
              Log in
            </a>
            <a href="/register" style={{ ...btn, display: "inline-block", textDecoration: "none" }}>
              Sign up
            </a>
          </>
        )}
      </div>

      <div style={{ marginTop: 20, background: "#1e1f22", padding: 20, borderRadius: 12 }}>
        <h2>Connection</h2>
        {health ? (
          <>
            <p style={{ marginTop: 10 }}>
              Backend: {health.ok ? "✅ Online" : "❌ Down"}
            </p>
            <p style={{ marginTop: 6 }}>
              Database:{" "}
              {health.db === "connected"
                ? "✅ Connected — logins and sign-ups work"
                : "⚠️ Not connected yet — logins and sign-ups are paused until the database is connected"}
            </p>
          </>
        ) : (
          <p style={{ marginTop: 10 }}>
            {healthError ? `❌ ${healthError}` : "Checking backend…"}
          </p>
        )}
      </div>

      <div style={{ marginTop: 20, background: "#1e1f22", padding: 20, borderRadius: 12 }}>
        <h2>About Tap-In</h2>
        <p style={{ marginTop: 10, color: "#aaa", fontSize: 14 }}>
          Peer-to-peer video calling, group chat, live streaming, and servers —
          built by Dolo45.
        </p>
      </div>
    </div>
  );
}

const btn = {
  marginTop: 16,
  padding: "12px 20px",
  borderRadius: 8,
  background: "#00eaff",
  border: "none",
  cursor: "pointer",
  color: "black",
  fontWeight: "bold"
};
