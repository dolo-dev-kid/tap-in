export default function StreamDashboard() {
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

        <button
          style={{
            marginTop: 20,
            padding: "12px 20px",
            borderRadius: 8,
            background: "#ff0000",
            border: "none",
            cursor: "pointer",
            color: "white"
          }}
        >
          Start Stream
        </button>
      </div>
    </div>
  );
}