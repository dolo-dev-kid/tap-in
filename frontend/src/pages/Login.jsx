import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dbDown, setDbDown] = useState(false);

  // If the database is not connected yet, say so up front instead of
  // letting the user type credentials into a form that cannot work.
  useEffect(() => {
    axiosInstance
      .get("/health")
      .then((res) => setDbDown(res.data?.db !== "connected"))
      .catch(() => setDbDown(false));
  }, []);

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
        if (response.data.user?.username) {
          localStorage.setItem("tapin_username", response.data.user.username);
        }
        if (response.data.user?.id) {
          localStorage.setItem("tapin_user_id", response.data.user.id);
        }
        window.location.href = "/";
      }
    } catch (err) {
      const serverError = err.response?.data?.error || "Login failed";
      setError(
        serverError.includes("Database not connected")
          ? "Tap In's database is still being connected — logins will work once it is up. Please try again soon."
          : serverError
      );
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

        {dbDown && (
          <p
            style={{
              background: "#3a2f00",
              color: "#ffce54",
              padding: 12,
              borderRadius: 8,
              marginBottom: 15,
              fontSize: 14
            }}
          >
            Heads up: logins are paused while Tap In's database is being
            connected. You can still look around the app — your account will
            work once the database is up.
          </p>
        )}

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
        <p style={{ marginTop: 10, textAlign: "center" }}>
          <a href="/" style={{ color: "#aaa" }}>← Back to Tap-In</a>
        </p>
      </div>
    </div>
  );
}
