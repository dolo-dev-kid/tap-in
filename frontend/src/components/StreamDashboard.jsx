export default function StreamDashboard({ onNavigate }) {
  return (
    <div style={{ padding: 40, color: "white" }}>
      <h1>Stream Dashboard</h1>

      <div
        style={{
          marginTop: 20,
          background: "#1e1f22",
          padding: 20,
          borderRadius: 12
        }}
      >
        <h2>Live Stats</h2>
        <p style={{ marginTop: 15 }}>Viewers: 0</p>
        <p>Duration: --:--</p>
        <p>Bitrate: -- mbps</p>

        <p style={{ marginTop: 16, color: "#aaa", fontSize: 14 }}>
          Streaming happens in a video room — join one and your camera goes
          live to everyone in that room.
        </p>
        <button
          onClick={() => onNavigate && onNavigate("video")}
          style={{
            marginTop: 20,
            padding: "12px 20px",
            borderRadius: 8,
            background: "#ff0000",
            border: "none",
            cursor: "pointer",
            color: "white",
            fontWeight: "bold"
          }}
        >
          Go Live — Join a Video Room
        </button>
      </div>
    </div>
  );
}
