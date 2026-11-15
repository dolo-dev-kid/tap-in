import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";

// Admin panel — visible ONLY to accounts with role "admin" (the owner).
// Lists every Tap In account so the owner can moderate his own app:
// promote/demote other users, and ban/unban accounts that break the
// rules (e.g. creeps targeting kids). No passwords are ever shown here —
// the backend never sends them. The admin cannot change their own role
// or ban themselves.
export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const myId =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tapin_user_id")
      : null;

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`
  });

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axiosInstance.get("/admin/users", {
        headers: authHeaders()
      });
      setUsers(res.data.users || []);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Could not load users — are you logged in as admin?"
      );
    } finally {
      setLoading(false);
    }
  };

  const loadUploads = async () => {
    try {
      const res = await axiosInstance.get("/admin/uploads", {
        headers: authHeaders()
      });
      setUploads(res.data.uploads || []);
    } catch (err) {
      // Uploads list is secondary — users list already reports auth errors.
    }
  };

  const removeUpload = async (upload) => {
    if (!window.confirm(`Delete ${upload.filename} uploaded by ${upload.username}?`)) return;
    try {
      await axiosInstance.delete(`/uploads/${upload.id}`, {
        headers: authHeaders()
      });
      loadUploads();
    } catch (err) {
      setError(err.response?.data?.error || "Could not delete that upload");
    }
  };

  useEffect(() => {
    loadUsers();
    loadUploads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setRole = async (user, role) => {
    try {
      await axiosInstance.post(
        `/admin/users/${user.id}/role`,
        { role },
        { headers: authHeaders() }
      );
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || "Could not change role");
    }
  };

  const setBanned = async (user, banned) => {
    try {
      await axiosInstance.post(
        `/admin/users/${user.id}/ban`,
        { banned },
        { headers: authHeaders() }
      );
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || "Could not change ban status");
    }
  };

  return (
    <div style={{ padding: 40, color: "white", maxWidth: 900 }}>
      <h1>🛡️ Admin</h1>
      <p style={{ marginTop: 10, color: "#aaa", fontSize: 14 }}>
        Owner moderation for Tap In. You can see every account, promote or
        demote other users, and ban accounts for unlawful or ungodly
        conduct — predators, drug dealers, and violent people do not belong
        on this app. Banning keeps the community safe, especially the kids.
        Banned accounts cannot log in.
      </p>

      {error && (
        <p
          style={{
            marginTop: 16,
            background: "#3a1a1a",
            color: "#ff6b6b",
            padding: 12,
            borderRadius: 8
          }}
        >
          {error}
        </p>
      )}

      {loading ? (
        <p style={{ marginTop: 20 }}>Loading users…</p>
      ) : users.length === 0 ? (
        <p style={{ marginTop: 20, color: "#aaa" }}>No users yet.</p>
      ) : (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {users.map((u) => {
            const isMe = myId && String(u.id) === String(myId);
            return (
              <div
                key={u.id}
                style={{
                  background: "#1e1f22",
                  padding: 16,
                  borderRadius: 12,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 12
                }}
              >
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: "bold", fontSize: 16 }}>
                    {u.username}
                    {isMe && (
                      <span style={{ color: "#00eaff", fontSize: 12 }}> (you)</span>
                    )}
                  </div>
                  <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
                    Role: <strong style={{ color: u.role === "admin" ? "#00eaff" : "#fff" }}>{u.role}</strong>
                    {u.banned && (
                      <span style={{ color: "#ff6b6b" }}> · 🚫 Banned</span>
                    )}
                    {" · "}
                    {u.friendCount} friend{u.friendCount === 1 ? "" : "s"} ·{" "}
                    {u.serverCount} server{u.serverCount === 1 ? "" : "s"}
                  </div>
                  <div style={{ color: "#777", fontSize: 12, marginTop: 4 }}>
                    Joined {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                    {u.bio ? ` · ${u.bio}` : ""}
                  </div>
                </div>

                {!isMe && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {u.role === "admin" ? (
                      <button onClick={() => setRole(u, "user")} style={btn}>
                        Demote to user
                      </button>
                    ) : (
                      <button onClick={() => setRole(u, "admin")} style={btn}>
                        Make admin
                      </button>
                    )}
                    {u.banned ? (
                      <button
                        onClick={() => setBanned(u, false)}
                        style={{ ...btn, background: "#2e7d32" }}
                      >
                        Unban
                      </button>
                    ) : (
                      <button
                        onClick={() => setBanned(u, true)}
                        style={{ ...btn, background: "#b3261e" }}
                      >
                        Ban
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button onClick={loadUsers} style={{ ...btn, marginTop: 20 }}>
        Refresh list
      </button>

      <h2 style={{ marginTop: 40 }}>📁 Uploads</h2>
      <p style={{ marginTop: 10, color: "#aaa", fontSize: 14 }}>
        Every photo, video, song and file members uploaded — newest first.
        Delete anything that doesn't belong on Tap In.
      </p>
      {uploads.length === 0 ? (
        <p style={{ marginTop: 16, color: "#aaa" }}>No uploads yet.</p>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {uploads.map((u) => (
            <div
              key={u.id}
              style={{
                background: "#1e1f22",
                padding: 16,
                borderRadius: 12,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 12
              }}
            >
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: "bold", fontSize: 15 }}>{u.filename}</div>
                <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
                  {u.kind} · {(u.size / 1024 / 1024).toFixed(2)} MB · by{" "}
                  <strong style={{ color: "#fff" }}>{u.username}</strong>
                  {" · "}
                  {u.createdAt ? new Date(u.createdAt).toLocaleString() : "—"}
                </div>
              </div>
              <button
                onClick={() => removeUpload(u)}
                style={{ ...btn, background: "#b3261e", color: "white", borderColor: "#b3261e" }}
              >
                Delete file
              </button>
            </div>
          ))}
        </div>
      )}
      <button onClick={loadUploads} style={{ ...btn, marginTop: 20 }}>
        Refresh uploads
      </button>
    </div>
  );
}

const btn = {
  padding: "8px 14px",
  borderRadius: 8,
  background: "#2b2d31",
  color: "#00eaff",
  border: "1px solid #00eaff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: "bold"
};
