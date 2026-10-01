export default function Friends() {
  const friends = ["Alex", "Mia", "Jay", "Sam"];

  return (
    <div style={{ padding: 40, color: "white" }}>
      <h1>Your Friends</h1>

      <div style={{ marginTop: 20 }}>
        {friends.map((friend, i) => (
          <div
            key={i}
            style={{
              background: "#1e1f22",
              padding: 15,
              borderRadius: 8,
              marginBottom: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <span>{friend}</span>
            <button
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                background: "#00eaff",
                border: "none",
                cursor: "pointer",
                color: "black"
              }}
            >
              Call
            </button>
          </div>
        ))}
      </div>

      <button
        style={{
          marginTop: 30,
          padding: "12px 20px",
          borderRadius: 8,
          background: "#00eaff",
          border: "none",
          cursor: "pointer"
        }}
      >
        Add Friend
      </button>
    </div>
  );
}