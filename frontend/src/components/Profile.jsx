import { useState } from "react";

// Avatar is a local inline SVG (initial "D" on a gradient) — the old
// Imgur URL (i.imgur.com/4ZQZ4ZQ.png) was a removed-image placeholder
// (161x81 1-bit PNG), so the profile picture was always broken.
const AVATAR_SVG =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00eaff"/><stop offset="1" stop-color="#7b2fff"/></linearGradient></defs><circle cx="60" cy="60" r="60" fill="url(#g)"/><text x="60" y="82" font-family="Arial, sans-serif" font-size="64" font-weight="bold" fill="#0f0f0f" text-anchor="middle">D</text></svg>`
  );

export default function Profile() {
  const username =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tapin_username")
      : null;
  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem("tapin_display_name") || "DOLO45"
  );
  const [bio, setBio] = useState(
    () =>
      localStorage.getItem("tapin_bio") || "Streamer • Creator • Dreamer"
  );
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(displayName);
  const [bioInput, setBioInput] = useState(bio);

  const save = () => {
    const name = nameInput.trim() || "DOLO45";
    const nextBio = bioInput.trim();
    localStorage.setItem("tapin_display_name", name);
    localStorage.setItem("tapin_bio", nextBio);
    setDisplayName(name);
    setBio(nextBio);
    setEditing(false);
  };

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
          src={AVATAR_SVG}
          alt="avatar"
          style={{
            width: 120,
            height: 120,
            borderRadius: "50%",
            marginBottom: 20
          }}
        />

        <h2>{displayName}</h2>
        <p style={{ marginTop: 10 }}>{bio}</p>
        <p style={{ marginTop: 10, color: "#aaa", fontSize: 14 }}>
          {username
            ? `Logged in as ${username}`
            : "Not logged in — log in to save your profile to your account."}
        </p>

        {editing ? (
          <div style={{ marginTop: 20 }}>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Display name"
              style={input}
            />
            <input
              value={bioInput}
              onChange={(e) => setBioInput(e.target.value)}
              placeholder="Bio"
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
            <p style={{ marginTop: 10, color: "#aaa", fontSize: 13 }}>
              Saved on this device for now — it syncs to your account once
              you are logged in and the database is connected.
            </p>
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
