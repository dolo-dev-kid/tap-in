import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";
import { uploadFile } from "../api/upload";
import MediaView from "./MediaView";
import VerifiedBadge from "./VerifiedBadge";
import { getFeaturedTrack, ROTATION_DAYS } from "../data/featuredTracks";

// Featured Dolo45 track — a feed FEATURE, not a member post. One track,
// rotating every 2 weeks, linking out to Wesley's YouTube video (never
// re-uploaded). Clearly labelled as Dolo45's music.
function FeaturedTrack() {
  const featured = getFeaturedTrack();
  return (
    <div
      style={{
        background: "#1e1f22",
        border: "1px solid #00eaff",
        padding: 20,
        borderRadius: 12,
        marginBottom: 24
      }}
    >
      <div style={{ color: "#00eaff", fontSize: 13, fontWeight: "bold" }}>
        🔥 FEATURED — DOLO45'S MUSIC
      </div>
      <h3 style={{ marginTop: 8 }}>{featured.title}</h3>
      <p style={{ marginTop: 6, color: "#aaa", fontSize: 13 }}>
        Dolo45's track, featured in everyone's Feed — a new one drops every{" "}
        {ROTATION_DAYS} days. This is Dolo45's music, not a member post.
        Featured track {featured.index + 1} of {featured.total} · changes{" "}
        {featured.rotationEnd.toLocaleDateString()}.
      </p>
      <div style={{ marginTop: 12 }}>
        <iframe
          width="100%"
          height="220"
          src={`https://www.youtube-nocookie.com/embed/${featured.youtubeId}`}
          title={`${featured.title} — Dolo45`}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ borderRadius: 8, maxWidth: 560 }}
        />
      </div>
      <a
        href={featured.youtubeUrl}
        target="_blank"
        rel="noreferrer"
        style={{ color: "#00eaff", fontSize: 14, display: "inline-block", marginTop: 12 }}
      >
        ▶ Watch "{featured.title}" on YouTube
      </a>
    </div>
  );
}

// Real feed: posts come from GET /posts in the database. No sample posts.
export default function Feed() {
  const [posts, setPosts] = useState([]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [attachFile, setAttachFile] = useState(null);
  const [attachPreview, setAttachPreview] = useState("");
  const [posting, setPosting] = useState(false);
  const loggedIn = Boolean(
    typeof localStorage !== "undefined" && localStorage.getItem("token")
  );
  const myUsername =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tapin_username")
      : null;
  const isAdmin =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("tapin_role") === "admin";

  const loadPosts = async () => {
    try {
      const res = await axiosInstance.get("/posts");
      setPosts(res.data?.posts || []);
    } catch (err) {
      setNote(
        err.response?.data?.error || "Could not load posts — please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const post = async () => {
    const text = draft.trim();
    if (!text && !attachFile) return;
    if (!loggedIn) {
      setNote("Log in to post.");
      return;
    }
    setPosting(true);
    try {
      let mediaUploadId = null;
      if (attachFile) {
        const uploaded = await uploadFile(attachFile);
        mediaUploadId = uploaded.id;
      }
      const res = await axiosInstance.post(
        "/posts",
        { text, mediaUploadId },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`
          }
        }
      );
      if (res.data?.post) {
        setPosts([res.data.post, ...posts]);
      }
      setDraft("");
      setAttachFile(null);
      setAttachPreview("");
      setNote("");
    } catch (err) {
      setNote(
        err.response?.data?.error || err.message || "Could not post — please try again."
      );
    } finally {
      setPosting(false);
    }
  };

  const removePost = async (postId) => {
    if (!window.confirm("Delete this post?")) return;
    try {
      await axiosInstance.delete(`/posts/${postId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`
        }
      });
      setPosts(posts.filter((p) => p.id !== postId));
    } catch (err) {
      setNote(err.response?.data?.error || "Could not delete that post.");
    }
  };

  return (
    <div style={{ padding: 30, color: "white" }}>
      <h2 style={{ marginBottom: 8 }}>Your Feed</h2>

      <FeaturedTrack />

      <div style={{ marginBottom: 24 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") post();
          }}
          placeholder={loggedIn ? "What's happening?" : "Log in to post"}
          disabled={!loggedIn}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 8,
            border: "none",
            background: "#2b2d31",
            color: "white",
            marginRight: 10,
            opacity: loggedIn ? 1 : 0.6
          }}
        />
        <button
          onClick={post}
          disabled={!loggedIn || posting}
          style={{
            padding: "12px 20px",
            borderRadius: 8,
            background: "#00eaff",
            border: "none",
            cursor: loggedIn ? "pointer" : "not-allowed",
            opacity: loggedIn ? 1 : 0.6
          }}
        >
          {posting ? "Posting…" : "Post"}
        </button>
        <div style={{ marginTop: 12 }}>
          <label style={{ color: "#aaa", fontSize: 13, display: "block", marginBottom: 6 }}>
            Attach a photo, video, song (MP3/WAV) or file — almost anything (photos up to 10 MB, video/audio up to 50 MB):
          </label>
          <input
            type="file"
            accept="image/*,video/*,audio/*,.pdf,.txt,.zip"
            disabled={!loggedIn}
            onChange={(e) => {
              const file = e.target.files?.[0];
              setAttachFile(file || null);
              setAttachPreview(
                file && file.type.startsWith("image/")
                  ? URL.createObjectURL(file)
                  : ""
              );
            }}
            style={{
              padding: 8,
              borderRadius: 8,
              border: "none",
              background: "#2b2d31",
              color: "white",
              width: "100%"
            }}
          />
          {attachFile && (
            <div style={{ marginTop: 10, color: "#aaa", fontSize: 13 }}>
              Attached: {attachFile.name} ({(attachFile.size / 1024 / 1024).toFixed(2)} MB){" "}
              <button
                onClick={() => {
                  setAttachFile(null);
                  setAttachPreview("");
                }}
                style={{ background: "none", border: "none", color: "#ff6b6b", cursor: "pointer" }}
              >
                Remove
              </button>
              {attachPreview && (
                <img
                  src={attachPreview}
                  alt="Attached preview"
                  style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, marginTop: 8, display: "block" }}
                />
              )}
            </div>
          )}
        </div>
        {note && (
          <p style={{ marginTop: 10, color: "#ffce54", fontSize: 14 }}>{note}</p>
        )}
      </div>

      {loading ? (
        <p style={{ color: "#aaa" }}>Loading posts…</p>
      ) : posts.length === 0 ? (
        <p style={{ color: "#aaa" }}>No posts yet — be the first to post.</p>
      ) : (
        posts.map((p) => (
          <div
            key={p.id || p.createdAt}
            style={{
              background: "#1e1f22",
              padding: 20,
              borderRadius: 12,
              marginBottom: 20
            }}
          >
            <strong>{p.username}<VerifiedBadge verified={p.verified} /></strong>
            {p.createdAt && (
              <span style={{ color: "#aaa", fontSize: 12, marginLeft: 10 }}>
                {new Date(p.createdAt).toLocaleString()}
              </span>
            )}
            {(isAdmin || (myUsername && p.username === myUsername)) && (
              <button
                onClick={() => removePost(p.id)}
                style={{
                  float: "right",
                  background: "none",
                  border: "none",
                  color: "#ff6b6b",
                  cursor: "pointer",
                  fontSize: 13
                }}
              >
                Delete
              </button>
            )}
            {p.text && <p style={{ marginTop: 10 }}>{p.text}</p>}
            <MediaView media={p.media} />
          </div>
        ))
      )}
    </div>
  );
}
