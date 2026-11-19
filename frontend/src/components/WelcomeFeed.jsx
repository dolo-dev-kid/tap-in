import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";
import VerifiedBadge from "./VerifiedBadge";

// Global Welcome feed on the Tap In landing page (Wesley, 19 Nov
// 2026): "I need a global feed not my profile but tap in landing
// page." Every member who shares Tap In gets ONE "Welcome to Tap In"
// post here — the first share creates it, later shares create nothing.
// Real posts only, from GET /posts?kind=welcome-share (public read,
// newest first). No sample posts, no fake users. A visitor can open a
// sharer's invite link straight from their post.
export default function WelcomeFeed() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axiosInstance
      .get("/posts?kind=welcome-share")
      .then((res) => setPosts(res.data?.posts || []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      style={{
        marginTop: 24,
        background: "#1e1f22",
        border: "1px solid #00eaff",
        borderRadius: 12,
        padding: 20,
        maxWidth: 920
      }}
    >
      <div style={{ fontSize: 22, fontWeight: "bold" }}>🌍 Welcome to Tap In</div>
      <p style={{ marginTop: 8, color: "#aaa", fontSize: 14 }}>
        Members sharing Tap In with the world — every share puts a welcome
        post right here.
      </p>

      {loading ? (
        <p style={{ marginTop: 12, color: "#aaa" }}>Loading welcomes…</p>
      ) : posts.length === 0 ? (
        <p style={{ marginTop: 12, color: "#aaa" }}>
          No shares yet — be the first to share Tap In.
        </p>
      ) : (
        posts.map((p) => (
          <div
            key={p.id || p.createdAt}
            style={{
              background: "#2b2d31",
              padding: 16,
              borderRadius: 10,
              marginTop: 14
            }}
          >
            <strong>
              {p.username}
              <VerifiedBadge verified={p.verified} />
            </strong>
            {p.createdAt && (
              <span style={{ color: "#aaa", fontSize: 12, marginLeft: 10 }}>
                {new Date(p.createdAt).toLocaleString()}
              </span>
            )}
            {p.text && <p style={{ marginTop: 8 }}>{p.text}</p>}
            {p.link && (
              <a
                href={p.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#00eaff", fontSize: 14, display: "inline-block", marginTop: 6 }}
              >
                Join with {p.username}&apos;s invite →
              </a>
            )}
          </div>
        ))
      )}
    </div>
  );
}
