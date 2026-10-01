import { useState } from "react";
import axiosInstance from "../api/axios";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await axiosInstance.post("/auth/login", {
        username,
        password
      });

      if (response.data.success) {
        localStorage.setItem("token", response.data.token);
        window.location.href = "/";
      }
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        background: "#0f0f0f",
        color: "white"
      }}
    >
      <div
        style={{
          background: "#1e1f22",
          padding: 40,
          borderRadius: 12,
          width: 400
        }}
      >
        <h1 style={{ marginBottom: 30 }}>Login to Tap-In</h1>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              width: "100%",
              padding: 12,
              marginBottom: 15,
              borderRadius: 8,
              border: "none",
              background: "#2b2d31",
              color: "white"
            }}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              padding: 12,
              marginBottom: 15,
              borderRadius: 8,
              border: "none",
              background: "#2b2d31",
              color: "white"
            }}
          />

          {error && <p style={{ color: "#ff6b6b", marginBottom: 15 }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 8,
              background: "#00eaff",
              border: "none",
              color: "black",
              fontSize: 16,
              fontWeight: "bold",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: "center" }}>
          Don't have an account? <a href="/register" style={{ color: "#00eaff" }}>Register</a>
        </p>
      </div>
    </div>
  );
}