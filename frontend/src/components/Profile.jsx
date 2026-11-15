import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";

// Profile shows the LOGGED-IN user's own data — never a template.
// Display name is the account username (from localStorage, then from the
// server). Logged out, it reads "New user". Bio defaults to empty with a
// placeholder. Avatar is the first letter of the username on a gradient;
// a saved avatar URL is used when the user set one.
function avatarSvg(initial) {
  const letter = (initial || "?").toUpperCase();
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00eaff"/><stop offset="1" stop-color="#7b2fff"/></linearGradient></defs><circle cx="60" cy="60" r="60" fill="url(#g)"/><text x="60" y="82" font-family="Arial, sans-serif" font-size="64" font-weight="bold" fill="#0f0f0f" text-anchor="middle">${letter}</text></svg>`
    )
  );
}

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`
  };
}

export default function Profile() {
  const storedUsername =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tapin_username")
      : null;
  const userId =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tapin_user_id")
      : null;

  const [displayName, setDisplayName] = useState(storedUsername || "New user");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("");
  const [editing, setEditing] = useState(false);
  const [bioInput, setBioInput] = useState("");
  const [avatarInput, setAvatarInput] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(Boolean(userId));

  // Load the real profile from the server when logged in.
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    axiosInstance
      .get(`/users/${userId}`)
      .then((res) => {
        if (res.data?.username) {
          setDisplayName(res.data.username);
          localStorage.setItem("tapin_username", res.data.username);
        }
        setBio(res.data?.bio || "");
        setAvatar(res.data?.avatar || "");
        setBioInput(res.data?.bio || "");
        setAvatarInput(res.data?.avatar || "");
      })
      .catch(() => {
        // Keep the local fallback (username from login) and say so below.
        setNote("Could not load your saved profile — showing what's on this device.");
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const save = async () => {
    const nextBio = bioInput.trim();
    const nextAvatar = avatarInput.trim();
    if (!userId) {
      // Logged out: nothing to save to — keep it on this device only.
      localStorage.setItem("tapin_bio", nextBio);
      setBio(nextBio);
      setAvatar(nextAvatar);
      setEditing(false);
      setNote("Saved on this device only — log in to save your profile to your account.");
      return;
    }
    try {
      const res = await axiosInstance.patch(
        `/users/${userId}`,
        { bio: nextBio, avatar: nextAvatar },
        { headers: authHeaders() }
      );
      setBio(res.data?.bio || "");
      setAvatar(res.data?.avatar || "");
      setNote("");
      setEditing(false);
    } catch (err) {
      // API failed: fall back to this device and say so plainly.
      localStorage.setItem("tapin_bio", nextBio);
      setBio(nextBio);
      setAvatar(nextAvatar);
      setEditing(false);
      setNote(
        "Could not save to your account right now — saved on this device only. Try again once you're back online."
      );
    }
  };

  const initial = (displayName || "?").charAt(0);
  const avatarSrc = avatar || avatarSvg(initial);

  return (
    <div style={{ padding: 40, color: "white" }}>
      <h1>Your Profile</h1>

      <div
        style={{
          marginTop: 20,
          background: "#1e1f22",
          padding: 20,
          borderRadius: 12,
          width: 400,
          maxWidth: "100%"
        }}
      >
        <img
          src={avatarSrc}
          alt="avatar"
          style={{
            width: 120,
            height: 120,
            borderRadius: "50%",
            marginBottom: 20,
            objectFit: "cover"
          }}
        />

        <h2>{displayName}</h2>
        {loading ? (
          <p style={{ marginTop: 10, color: "#aaa" }}>Loading your profile…</p>
        ) : bio ? (
          <p style={{ marginTop: 10 }}>{bio}</p>
        ) : (
          <p style={{ marginTop: 10, color: "#aaa", fontStyle: "italic" }}>
            No bio yet — tap Edit Profile to add one.
          </p>
        )}
        <p style={{ marginTop: 10, color: "#aaa", fontSize: 14 }}>
          {storedUsername
            ? `Logged in as ${storedUsername}`
            : "Not logged in — log in to save your profile to your account."}
        </p>
        {note && (
          <p style={{ marginTop: 10, color: "#ffce54", fontSize: 14 }}>{note}</p>
        )}

        {editing ? (
          <div style={{ marginTop: 20 }}>
            <input
              value={bioInput}
              onChange={(e) => setBioInput(e.target.value)}
              placeholder="Bio"
              style={input}
            />
            <input
              value={avatarInput}
              onChange={(e) => setAvatarInput(e.target.value)}
              placeholder="Avatar image URL (optional)"
              style={input}
            />
            <button onClick={save} style={btn}>
              Save
            </button>{" "}
            <button
              onClick={() => setEditing(false)}
              style={{ ...btn, background: "#2b2d31", color: "white" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} style={{ ...btn, marginTop: 20 }}>
            Edit Profile
          </button>
        )}
      </div>
    </div>
  );
}

const btn = {
  padding: "12px 20px",
  borderRadius: 8,
  background: "#00eaff",
  border: "none",
  cursor: "pointer",
  color: "black",
  fontWeight: "bold"
};

const input = {
  width: "100%",
  padding: 12,
  marginBottom: 12,
  borderRadius: 8,
  border: "none",
  background: "#2b2d31",
  color: "white"
};
