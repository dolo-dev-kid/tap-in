import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";
import VerifiedBadge from "./VerifiedBadge";
import AdminProfileView from "./AdminProfileView";

// Admin panel — visible ONLY to accounts with role "admin" (the owner).
// Lists every Tap In account so the owner can moderate his own app:
// promote/demote other users, and ban/unban accounts that break the
// rules (e.g. creeps targeting kids). No passwords are ever shown here —
// the backend never sends them. The one exception is a password-reset
// code, and only when email is not set up: then the owner (exact
// "Dolo45") sees the code in this panel so he can share it with the
// member himself. The backend never returns a code to any other admin.
// The admin cannot change their own role or ban themselves.
export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [emailConfigured, setEmailConfigured] = useState(null);
  const [resetRequests, setResetRequests] = useState([]);
  const [resetNote, setResetNote] = useState("");
  // Owner-only relay code: when email is not set up, approving a
  // reset returns the 6-digit code in the response, and it is shown
  // here ONLY to the owner (exact "Dolo45") so he can share it with
  // the member himself. The backend never sends a code to any other
  // admin, and this box is never rendered for them.
  const [approvedCode, setApprovedCode] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [flags, setFlags] = useState([]);
  const [chatRooms, setChatRooms] = useState([]);
  const [viewingRoom, setViewingRoom] = useState(null);
  const [viewingProfileId, setViewingProfileId] = useState(null);
  const [roomMessages, setRoomMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const myId =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tapin_user_id")
      : null;
  // Private-chat review is OWNER ONLY (exact "Dolo45") — Wesley
  // screens private chats himself. Other admins never see these
  // sections, and the backend (requireOwner) refuses them too.
  const isOwner =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("tapin_username") === "Dolo45";

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
      setEmailConfigured(res.data.emailConfigured === true);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Could not load users — are you logged in as admin?"
      );
    } finally {
      setLoading(false);
    }
  };

  const loadResetRequests = async () => {
    try {
      const res = await axiosInstance.get("/admin/password-resets", { headers: authHeaders() });
      setResetRequests(res.data.requests || []);
      setEmailConfigured(res.data.emailConfigured === true);
    } catch { /* reset queue is secondary */ }
  };
  const decideReset = async (id, action) => {
    setResetNote("");
    setApprovedCode(null);
    try {
      const res = await axiosInstance.post(`/admin/password-resets/${id}/${action}`, {}, { headers: authHeaders() });
      setResetNote(res.data?.message || `${action} done.`);
      // No-email fallback: the code comes back in the approve
      // response. Show it only to the owner — the backend only ever
      // returns it to Dolo45, and this state is never rendered for
      // other admins.
      if (action === "approve" && res.data?.code && isOwner) {
        setApprovedCode({ username: res.data.username || "", code: res.data.code });
      }
      loadResetRequests();
    } catch (err) {
      setResetNote(err.response?.data?.error || "Could not decide that request.");
    }
  };
  const revokeVerified = async (user) => {
    if (!window.confirm(`Take the verified checkmark off ${user.username}?`)) return;
    try {
      await axiosInstance.post(`/admin/users/${user.id}/verify-revoke`, {}, { headers: authHeaders() });
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || "Could not revoke verification");
    }
  };

  const loadFlags = async () => {
    try {
      const res = await axiosInstance.get("/admin/chat/flags", {
        headers: authHeaders()
      });
      setFlags(res.data.flags || []);
    } catch (err) {
      // Flags list is secondary — users list already reports auth errors.
    }
  };

  const loadChatRooms = async () => {
    try {
      const res = await axiosInstance.get("/admin/chat/rooms", {
        headers: authHeaders()
      });
      setChatRooms(res.data.rooms || []);
    } catch (err) {
      // Chat rooms list is secondary — users list already reports auth errors.
    }
  };

  const viewRoomMessages = async (room) => {
    try {
      const res = await axiosInstance.get(`/admin/chat/rooms/${room.id}/messages`, {
        headers: authHeaders()
      });
      setViewingRoom(room);
      setRoomMessages(res.data.messages || []);
    } catch (err) {
      setError(err.response?.data?.error || "Could not open that chat");
    }
  };

  const markFlagReviewed = async (flag, reviewed) => {
    try {
      await axiosInstance.post(
        `/admin/chat/flags/${flag.id}/review`,
        { reviewed },
        { headers: authHeaders() }
      );
      loadFlags();
    } catch (err) {
      setError(err.response?.data?.error || "Could not update that flag");
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
    if (isOwner) { loadFlags(); loadChatRooms(); }
    loadResetRequests();
    // Refresh the users list every 30 seconds so "online now" stays
    // current while the admin panel is open.
    const timer = setInterval(loadUsers, 30000);
    return () => clearInterval(timer);
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
    <div style={{ padding: 40, color: "white", width: "100%" }}>
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

      <p style={{ marginTop: 16, color: "#7CFC9A", fontSize: 15 }}>
        🟢 {users.filter((u) => u.online).length} online now
        {" · "}
        <span style={{ color: "#aaa" }}>{users.length} total accounts</span>
      </p>

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
                    {u.online ? "🟢 " : "⚫ "}
                    {u.username}<VerifiedBadge verified={u.verified} />
                    {u.email && (
                      <span style={{ color: "#aaa", fontSize: 12, display: "block" }}>{u.email}{u.emailVerified ? " ✓ email confirmed" : " · email not confirmed"}</span>
                    )}
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
                    {u.online ? (
                      <span style={{ color: "#7CFC9A" }}>Online now</span>
                    ) : u.lastSeenAt ? (
                      <span>Last seen {new Date(u.lastSeenAt).toLocaleString()}</span>
                    ) : (
                      <span>Never seen online</span>
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

                <button onClick={() => setViewingProfileId(u.id)} style={btn}>
                  👤 View full profile
                </button>
                {!isMe && u.verified && (
                  <button onClick={() => revokeVerified(u)} style={{ ...btn, background: "#3a2f00" }}>
                    Revoke ✓
                  </button>
                )}
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

      <h2 style={{ marginTop: 40 }}>🔑 Password reset requests — your approval needed</h2>
      <p style={{ marginTop: 10, color: "#aaa", fontSize: 14 }}>
        A member asks for a reset, you approve or deny it here — no reset code is emailed until you approve.
        {emailConfigured === false && " Email sending is not set up yet, so approving shows the code here for you (the owner) to share with the member yourself — it expires in 15 minutes."}
        {emailConfigured === true && " Email sending is on."}
      </p>
      {resetNote && <p style={{ marginTop: 10, color: "#ffce54", fontSize: 14 }}>{resetNote}</p>}
      {approvedCode && isOwner && (
        <div style={{ marginTop: 12, background: "#1e3a1e", border: "2px solid #7CFC9A", padding: 16, borderRadius: 12 }}>
          <div style={{ fontWeight: "bold", fontSize: 16, color: "#7CFC9A" }}>
            ✅ Approved for {approvedCode.username} — share this code with the member yourself
          </div>
          <div style={{ color: "#fff", fontSize: 14, marginTop: 6 }}>
            Email is not set up, so no code was emailed. Read this code to {approvedCode.username} — it expires in 15 minutes.
          </div>
          <div style={{ fontSize: 36, fontWeight: "bold", letterSpacing: 8, color: "#fff", marginTop: 10, textAlign: "center" }}>
            {approvedCode.code}
          </div>
        </div>
      )}
      {resetRequests.length === 0 ? (
        <p style={{ marginTop: 16, color: "#aaa" }}>No pending reset requests.</p>
      ) : (
        resetRequests.map((r) => (
          <div key={r.id} style={{ marginTop: 12, background: "#1e1f22", padding: 16, borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span>
              <strong>{r.username}</strong> · {r.email}
              <span style={{ color: "#aaa", fontSize: 12, display: "block" }}>Asked {r.requestedAt ? new Date(r.requestedAt).toLocaleString() : "—"}</span>
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              <button onClick={() => decideReset(r.id, "approve")} style={{ ...btn, background: "#2e7d32", color: "white" }}>{emailConfigured === false ? "Approve — show me the code" : "Approve — email code"}</button>
              <button onClick={() => decideReset(r.id, "deny")} style={{ ...btn, background: "#b3261e", color: "white" }}>Deny</button>
            </span>
          </div>
        ))
      )}
      <button onClick={loadResetRequests} style={{ ...btn, marginTop: 16 }}>Refresh reset requests</button>

      {isOwner ? (
        <>
      <h2 style={{ marginTop: 40 }}>🚨 Safety — flagged chats</h2>
      <p style={{ marginTop: 10, color: "#aaa", fontSize: 14 }}>
        Messages the safety scan flagged for your review — grooming or
        sexual content involving minors, threats, drug dealing, or
        planning violence. A flag bans nobody by itself: you look at it
        and decide. Mark it reviewed once you've handled it.
      </p>
      {flags.length === 0 ? (
        <p style={{ marginTop: 16, color: "#aaa" }}>No flagged messages — nothing to review right now.</p>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {flags.map((f) => (
            <div
              key={f.id}
              style={{
                background: f.reviewed ? "#1e1f22" : "#3a1a1a",
                padding: 16,
                borderRadius: 12,
                opacity: f.reviewed ? 0.7 : 1
              }}
            >
              <div style={{ fontWeight: "bold", fontSize: 15 }}>
                {(f.reasons || []).join(" · ")}
                {f.reviewed && <span style={{ color: "#7CFC9A" }}> · ✓ Reviewed</span>}
              </div>
              <div style={{ color: "#fff", fontSize: 14, marginTop: 6 }}>
                "{f.text}"
              </div>
              <div style={{ color: "#aaa", fontSize: 13, marginTop: 6 }}>
                by <strong style={{ color: "#fff" }}>{f.senderUsername}</strong>
                {" · "}in {f.roomName || "a private chat"}
                {" · "}{f.createdAt ? new Date(f.createdAt).toLocaleString() : "—"}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => {
                    const room = chatRooms.find((r) => String(r.id) === String(f.room));
                    if (room) viewRoomMessages(room);
                  }}
                  style={btn}
                >
                  View chat
                </button>
                <button
                  onClick={() => markFlagReviewed(f, !f.reviewed)}
                  style={btn}
                >
                  {f.reviewed ? "Mark unreviewed" : "Mark reviewed"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button onClick={loadFlags} style={{ ...btn, marginTop: 16 }}>
        Refresh flags
      </button>

      <h2 style={{ marginTop: 40 }}>💬 Private chats (safety review)</h2>
      <p style={{ marginTop: 10, color: "#aaa", fontSize: 14 }}>
        Every private 1-to-1 and group chat on Tap In, newest activity
        first. Open one to read its history when you need to check on
        something. Only you (the owner) can see these — other members
        only ever see their own chats.
      </p>
      {chatRooms.length === 0 ? (
        <p style={{ marginTop: 16, color: "#aaa" }}>No private chats yet.</p>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {chatRooms.map((r) => (
            <div
              key={r.id}
              style={{ background: "#1e1f22", padding: 16, borderRadius: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}
            >
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: "bold", fontSize: 15 }}>
                  {r.type === "group" ? `👥 ${r.name}` : `🔒 ${r.displayName}`}
                </div>
                <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
                  {(r.members || []).join(", ")} · {r.messageCount || 0} message{(r.messageCount || 0) === 1 ? "" : "s"}
                </div>
              </div>
              <button onClick={() => viewRoomMessages(r)} style={btn}>
                View chat
              </button>
            </div>
          ))}
        </div>
      )}
      {viewingRoom && (
        <div style={{ marginTop: 20, background: "#1e1f22", padding: 16, borderRadius: 12 }}>
          <h3>
            {viewingRoom.type === "group" ? viewingRoom.name : viewingRoom.displayName}
            <button onClick={() => setViewingRoom(null)} style={{ ...btn, marginLeft: 12 }}>
              Close
            </button>
          </h3>
          <div style={{ marginTop: 12, maxHeight: 300, overflowY: "auto" }}>
            {roomMessages.length === 0 ? (
              <p style={{ color: "#aaa" }}>No messages in this chat.</p>
            ) : (
              roomMessages.map((m) => (
                <div key={m.id} style={{ marginBottom: 10 }}>
                  <strong>{m.senderUsername}</strong>
                  <span style={{ color: "#777", fontSize: 12 }}>
                    {" "}{m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}
                    {m.flagged ? " · 🚩 flagged" : ""}
                  </span>
                  <div>{m.text}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

        </>
      ) : (
        <div style={{ marginTop: 40, background: "#1e1f22", padding: 16, borderRadius: 12 }}>
          <h2>🚨 Safety — private chats</h2>
          <p style={{ marginTop: 10, color: "#aaa", fontSize: 14 }}>
            Private chat is private — only the people in that chat can see it. Wesley (Dolo45) screens
            private chats himself. Other admins cannot read someone else's private chats or safety flags.
            The safety monitor only alerts Dolo45, for his review only — it never blocks, filters, or
            auto-bans a message.
          </p>
        </div>
      )}

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
      {viewingProfileId && (
        <AdminProfileView userId={viewingProfileId} onClose={() => setViewingProfileId(null)} />
      )}
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
