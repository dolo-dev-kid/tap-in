import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";

// Real feed: posts come from GET /posts in the database. No sample posts.
export default function Feed() {
  const [posts, setPosts] = useState([]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const loggedIn = Boolean(
    typeof localStorage !== "undefined" && localStorage.getItem("token")
  );

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
    if (!text) return;
    if (!loggedIn) {
      setNote("Log in to post.");
      return;
    }
    try {
      const res = await axiosInstance.post(
        "/posts",
        { text },
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
      setNote("");
    } catch (err) {
      setNote(
        err.response?.data?.error || "Could not post — please try again."
      );
    }
  };

  return (
    <div style={{ padding: 30, color: "white" }}>
      <h2 style={{ marginBottom: 8 }}>Your Feed</h2>

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
            width: "70%",
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
          disabled={!loggedIn}
          style={{
            padding: "12px 20px",
            borderRadius: 8,
            background: "#00eaff",
            border: "none",
            cursor: loggedIn ? "pointer" : "not-allowed",
            opacity: loggedIn ? 1 : 0.6
          }}
        >
          Post
        </button>
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
            <strong>{p.username}</strong>
            {p.createdAt && (
              <span style={{ color: "#aaa", fontSize: 12, marginLeft: 10 }}>
                {new Date(p.createdAt).toLocaleString()}
              </span>
            )}
            <p style={{ marginTop: 10 }}>{p.text}</p>
          </div>
        ))
      )}
    </div>
  );
}
