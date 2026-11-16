import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";
import VerifiedBadge from "./VerifiedBadge";
import SocialLinksRow from "./SocialLinks";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Admin-only full profile view. Shows a member's WHOLE profile —
// bio, avatar, uploads, profile music, social links, friends,
// servers, verification status, online / last seen, referral info —
// for moderation. Admin-only: the backend endpoint requires auth +
// admin role, and regular members never get this component rendered.
// The account email IS shown here, clearly marked admin-only — it is
// never shown to other members anywhere else. This view NEVER shows
// passwords, password hashes, auth tokens, or 2FA / reset codes:
// the backend builds the response field-by-field and never sends
// them, and nothing here asks for them.
export default function AdminProfileView({ userId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError("");
    axiosInstance
      .get(`/admin/users/${userId}/profile`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` }
      })
      .then((res) => setProfile(res.data))
      .catch((err) => setError(err.response?.data?.error || "Could not load that profile."))
      .finally(() => setLoading(false));
  }, [userId]);

  if (!userId) return null;
  const u = profile?.user;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.75)",
        display: "flex", justifyContent: "center", alignItems: "flex-start",
        overflowY: "auto", padding: 20
      }}
      onClick={onClose}
    >
      <div
        style={{ background: "#1e1f22", color: "white", borderRadius: 12, padding: 24, width: "100%", maxWidth: 720, marginTop: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0 }}>👤 Full profile — admin view</h2>
          <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 8, background: "#2b2d31", color: "#00eaff", border: "1px solid #00eaff", cursor: "pointer", fontWeight: "bold" }}>Close ✕</button>
        </div>
        <p style={{ marginTop: 8, color: "#ffce54", fontSize: 13, background: "#3a2f00", padding: 10, borderRadius: 8 }}>
          🔒 Admin-only. This is for moderation — do not share it with other members.
          Never shows passwords, tokens, or verification codes.
        </p>

        {loading && <p style={{ color: "#aaa", marginTop: 16 }}>Loading profile…</p>}
        {error && <p style={{ color: "#ff6b6b", marginTop: 16 }}>{error}</p>}

        {u && (
          <>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
              {u.avatar && (
                <img src={u.avatar} alt="" style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover" }} />
              )}
              <div>
                <div style={{ fontSize: 22, fontWeight: "bold" }}>
                  {u.online ? "🟢 " : "⚫ "}{u.username}<VerifiedBadge verified={u.verified} />
                  {u.role === "admin" && <span style={{ color: "#00eaff", fontSize: 14 }}> 🛡️ Admin</span>}
                  {u.banned && <span style={{ color: "#ff6b6b", fontSize: 14 }}> 🚫 Banned</span>}
                </div>
                <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
                  Joined {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                  {" · "}{u.online ? "Online now" : u.lastSeenAt ? `Last seen ${new Date(u.lastSeenAt).toLocaleString()}` : "Never seen online"}
                </div>
                <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
                  Verification: {u.verified ? "✓ Verified" : "Not verified"} · status {u.verificationStatus || "none"}
                  {" · "}email {u.emailVerified ? "✓ confirmed" : "not confirmed"}
                </div>
              </div>
            </div>

            {u.email && (
              <div style={{ marginTop: 16, background: "#2b2d31", padding: 12, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "#ffce54", fontWeight: "bold" }}>📧 ACCOUNT EMAIL — ADMIN-ONLY, NEVER SHOWN TO MEMBERS</div>
                <div style={{ marginTop: 4 }}>{u.email}</div>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <h3>Bio</h3>
              <p style={{ color: "#ddd", marginTop: 6 }}>{u.bio || "No bio."}</p>
            </div>

            <div style={{ marginTop: 16 }}>
              <h3>Other platforms</h3>
              <SocialLinksRow links={u.socialLinks} />
            </div>

            {profile.profileSong && (
              <div style={{ marginTop: 16 }}>
                <h3>🎵 Profile music</h3>
                <p style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>{profile.profileSong.filename || "Profile song"}</p>
                <audio controls src={profile.profileSong.url.startsWith("http") ? profile.profileSong.url : `${API}${profile.profileSong.url}`} style={{ width: "100%", marginTop: 8 }} />
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <h3>Friends ({(profile.friends || []).length})</h3>
              <p style={{ color: "#ddd", marginTop: 6 }}>
                {(profile.friends || []).length ? profile.friends.join(", ") : "No friends yet."}
              </p>
            </div>

            <div style={{ marginTop: 16 }}>
              <h3>Servers ({(profile.servers || []).length})</h3>
              <p style={{ color: "#ddd", marginTop: 6 }}>
                {(profile.servers || []).length ? profile.servers.join(", ") : "No servers."}
              </p>
            </div>

            <div style={{ marginTop: 16 }}>
              <h3>Referral info</h3>
              <p style={{ color: "#ddd", marginTop: 6 }}>
                Code: <strong>{profile.referral?.code || "—"}</strong>
                {" · "}Referred by: {profile.referral?.referredBy || "nobody"}
                {" · "}Brought in: {profile.referral?.referralCount ?? 0} member{(profile.referral?.referralCount ?? 0) === 1 ? "" : "s"}
              </p>
            </div>

            <div style={{ marginTop: 16 }}>
              <h3>Uploads ({(profile.uploads || []).length})</h3>
              {(profile.uploads || []).length === 0 ? (
                <p style={{ color: "#aaa", marginTop: 6 }}>No uploads.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                  {profile.uploads.map((up) => (
                    <div key={up.id} style={{ background: "#2b2d31", padding: 12, borderRadius: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: "bold" }}>{up.originalName}</div>
                      <div style={{ color: "#aaa", fontSize: 12, marginTop: 2 }}>
                        {up.kind} · {(up.size / 1024).toFixed(0)} KB · {up.createdAt ? new Date(up.createdAt).toLocaleDateString() : ""}
                      </div>
                      {up.kind === "image" && (
                        <img src={`${API}${up.url}`} alt={up.originalName} style={{ maxWidth: "100%", borderRadius: 8, marginTop: 8 }} />
                      )}
                      {up.kind === "video" && (
                        <video controls src={`${API}${up.url}`} style={{ maxWidth: "100%", borderRadius: 8, marginTop: 8 }} />
                      )}
                      {up.kind === "audio" && (
                        <audio controls src={`${API}${up.url}`} style={{ width: "100%", marginTop: 8 }} />
                      )}
                      {up.kind === "file" && (
                        <a href={`${API}${up.url}`} target="_blank" rel="noreferrer" style={{ color: "#00eaff", fontSize: 13 }}>Open file</a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
