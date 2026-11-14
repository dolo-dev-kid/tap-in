import { useState } from "react";

// The feed shows sample posts for now, clearly labelled as samples.
// The composer adds a post on this screen only (demo) — posts are not
// saved anywhere until the database is connected.
const SAMPLE_POSTS = [
  { user: "Alex", text: "Just went live 🔥" },
  { user: "Mia", text: "New stream layout dropping soon!" },
  { user: "Jay", text: "Anyone wanna VC?" }
];

export default function Feed() {
  const [posts, setPosts] = useState(SAMPLE_POSTS);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");

  const post = () => {
    if (!draft.trim()) return;
    setPosts([{ user: "You", text: draft.trim() }, ...posts]);
    setDraft("");
    setNote("Demo post — it only lives on this screen until the database is connected.");
  };

  return (
    <div style={{ padding: 30, color: "white" }}>
      <h2 style={{ marginBottom: 8 }}>Your Feed</h2>
      <p style={{ color: "#aaa", fontSize: 14, marginBottom: 20 }}>
        Sample posts below — your real feed appears once you log in and the
        database is connected.
      </p>

      <div style={{ marginBottom: 24 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") post();
          }}
          placeholder="What's happening?"
          style={{
            width: "70%",
            padding: 12,
            borderRadius: 8,
            border: "none",
            background: "#2b2d31",
            color: "white",
            marginRight: 10
          }}
        />
        <button
          onClick={post}
          style={{
            padding: "12px 20px",
            borderRadius: 8,
            background: "#00eaff",
            border: "none",
            cursor: "pointer"
          }}
        >
          Post
        </button>
        {note && (
          <p style={{ marginTop: 10, color: "#ffce54", fontSize: 14 }}>{note}</p>
        )}
      </div>

      {posts.map((p, i) => (
        <div
          key={i}
          style={{
            background: "#1e1f22",
            padding: 20,
            borderRadius: 12,
            marginBottom: 20
          }}
        >
          <strong>{p.user}</strong>
          <p style={{ marginTop: 10 }}>{p.text}</p>
        </div>
      ))}
    </div>
  );
}
