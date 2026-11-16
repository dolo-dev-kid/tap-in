import { useEffect, useRef, useState } from "react";
import axiosInstance from "../api/axios";
import { uploadFile, mediaUrl } from "../api/upload";
import MyMerch from "./MyMerch";
import { DOLO45_IG } from "../data/dolo45Photos";

// Dolo45's profile pic is his real Instagram profile pic
// (@nho_life_dolo45), shipped as a data URI in dolo45Photos.js. Used
// ONLY as the fallback for the exact username "Dolo45"
// (case-sensitive — the separate banned lowercase "dolo45" account
// never gets it). A saved avatar on his account always wins over
// this fallback.
export const DOLO45_AVATAR = DOLO45_IG;

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

// MySpace-style profile song player. Plays when the profile is opened
// (and only there — never on Home or Feed), with a visible play/pause
// and mute control so it can always be stopped. Browsers sometimes
// block autoplay with sound, so if the first play is blocked the big
// Play button stays up front instead of failing silently. The song
// stops when you leave the profile.
function ProfileSongPlayer({ song }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => { setPlaying(true); setBlocked(false); };
    const onPause = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    // Autoplay on profile open — the tap that opened the profile counts
    // as the user's gesture in most browsers.
    audio.play().catch(() => setBlocked(true));
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.pause();
    };
  }, [song?.url]);

  if (!song?.url) return null;
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => setBlocked(true));
    else audio.pause();
  };
  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setMuted(audio.muted);
  };
  return (
    <div
      style={{
        marginTop: 16,
        background: "#2b2d31",
        border: "1px solid #00eaff",
        borderRadius: 12,
        padding: 12
      }}
    >
      <div style={{ fontSize: 13, color: "#aaa" }}>🎵 Profile song</div>
      <div style={{ fontWeight: "bold", marginTop: 4, wordBreak: "break-word" }}>
        {song.filename || "Profile song"}
      </div>
      <audio ref={audioRef} src={mediaUrl(song.url)} preload="auto" loop />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={togglePlay} style={btn}>
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <button
          onClick={toggleMute}
          style={{ ...btn, background: "#2b2d31", color: "white" }}
        >
          {muted ? "🔇 Unmute" : "🔊 Mute"}
        </button>
      </div>
      {blocked && !playing && (
        <p style={{ marginTop: 8, color: "#ffce54", fontSize: 13 }}>
          Your browser stopped the song from starting by itself — tap Play to hear it.
        </p>
      )}
    </div>
  );
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
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [profileSong, setProfileSong] = useState(null);
  const [myAudio, setMyAudio] = useState([]);
  const [songChoice, setSongChoice] = useState("none");
  const [songChanged, setSongChanged] = useState(false);
  const [songFile, setSongFile] = useState(null);
  const [songUploading, setSongUploading] = useState(false);
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
        setProfileSong(res.data?.profileSong || null);
        setSongChoice(res.data?.profileSong?.uploadId ? String(res.data.profileSong.uploadId) : "none");
      })
      .catch(() => {
        // Keep the local fallback (username from login) and say so below.
        setNote("Could not load your saved profile — showing what's on this device.");
      })
      .finally(() => setLoading(false));
    // Your own audio uploads, for the profile-song picker.
    axiosInstance
      .get("/uploads/mine", { headers: authHeaders() })
      .then((res) => setMyAudio((res.data?.uploads || []).filter((u) => u.kind === "audio")))
      .catch(() => {});
  }, [userId]);

  const save = async () => {
    const nextBio = bioInput.trim();
    // A chosen photo file wins over a pasted URL — upload it first.
    let nextAvatar = avatarInput.trim();
    if (avatarFile) {
      if (!userId) {
        setNote("Log in to upload a profile photo to your account.");
        return;
      }
      setUploading(true);
      try {
        const uploaded = await uploadFile(avatarFile);
        nextAvatar = uploaded.url;
      } catch (err) {
        setNote(err.message || "Photo upload failed — please try again.");
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    if (!userId) {
      // Logged out: nothing to save to — keep it on this device only.
      localStorage.setItem("tapin_bio", nextBio);
      setBio(nextBio);
      setAvatar(nextAvatar);
      setEditing(false);
      setNote("Saved on this device only — log in to save your profile to your account.");
      return;
    }
    // Profile song: a newly uploaded song file wins; otherwise use the
    // picker's choice, but only if the member changed it.
    let songPatch = {};
    if (songFile) {
      setSongUploading(true);
      try {
        const uploaded = await uploadFile(songFile);
        songPatch = { profileSongUploadId: uploaded.id };
        setMyAudio([uploaded, ...myAudio]);
      } catch (err) {
        setNote(err.message || "Song upload failed — please try again.");
        setSongUploading(false);
        return;
      }
      setSongUploading(false);
    } else if (songChanged) {
      songPatch = { profileSongUploadId: songChoice === "none" ? null : songChoice };
    }
    try {
      const res = await axiosInstance.patch(
        `/users/${userId}`,
        { bio: nextBio, avatar: nextAvatar, ...songPatch },
        { headers: authHeaders() }
      );
      setBio(res.data?.bio || "");
      setAvatar(res.data?.avatar || "");
      setProfileSong(res.data?.profileSong || null);
      setSongChoice(res.data?.profileSong?.uploadId ? String(res.data.profileSong.uploadId) : "none");
      setSongChanged(false);
      setSongFile(null);
      setAvatarFile(null);
      setAvatarPreview("");
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
  const isDolo45 = displayName === "Dolo45";
  const avatarSrc =
    avatarPreview ||
    mediaUrl(avatar) ||
    (isDolo45 ? DOLO45_AVATAR : "") ||
    avatarSvg(initial);

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
        <ProfileSongPlayer song={profileSong} />
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
            />            <label style={{ display: "block", color: "#aaa", fontSize: 13, marginBottom: 6 }}>
              Profile photo — upload a picture (jpg, png, gif, webp, up to 10 MB):
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setAvatarFile(file || null);
                setAvatarPreview(file ? URL.createObjectURL(file) : "");
              }}
              style={{ ...input, padding: 8 }}
            />
            <input
              value={avatarInput}
              onChange={(e) => setAvatarInput(e.target.value)}
              placeholder="Or paste an avatar image URL (optional)"
              style={input}
            />
            <label style={{ display: "block", color: "#aaa", fontSize: 13, marginBottom: 6 }}>
              🎵 Profile song — pick one of your uploaded songs (plays when someone opens your profile):
            </label>
            <select
              value={songFile ? "__new__" : songChoice}
              onChange={(e) => {
                setSongChoice(e.target.value);
                setSongChanged(true);
                setSongFile(null);
              }}
              style={{ ...input, cursor: "pointer" }}
            >
              <option value="none">No profile song</option>
              {myAudio.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.filename}
                </option>
              ))}
              <option value="__new__" disabled>
                — or upload a new song below —
              </option>
            </select>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setSongFile(file || null);
                if (file) setSongChanged(true);
              }}
              style={{ ...input, padding: 8 }}
            />
            {songFile && (
              <p style={{ color: "#aaa", fontSize: 13, marginBottom: 12 }}>
                New song: {songFile.name} — will be uploaded and set as your profile song.
              </p>
            )}
            <button onClick={save} disabled={uploading || songUploading} style={{ ...btn, opacity: uploading || songUploading ? 0.6 : 1 }}>
              {uploading || songUploading ? "Uploading…" : "Save"}
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

      {isDolo45 && <MyMerch />}
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
