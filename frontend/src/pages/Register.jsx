import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";
import { readRefFromUrl } from "../components/ReferralBox";
import GoogleSignInButton from "../components/GoogleSignInButton";

export default function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [email, setEmail] = useState("");
  const [invitedBy, setInvitedBy] = useState("");
  const [referralWarning, setReferralWarning] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dbDown, setDbDown] = useState(false);

  // Referral link (?ref=DOLO45-K7Q2): pre-fill the code from the
  // link, and show who invited you — signing up from a friend's
  // link makes you friends automatically. The code is optional:
  // an invalid one can be cleared and signup still works.
  useEffect(() => {
    const ref = readRefFromUrl();
    if (!ref) return;
    setReferralCode(ref.toUpperCase());
    axiosInstance
      .get(`/referral/${encodeURIComponent(ref)}`)
      .then((res) => {
        if (res.data?.valid) setInvitedBy(res.data.username);
        else setReferralWarning("That referral code doesn't belong to anyone — you can clear it and sign up anyway.");
      })
      .catch(() => { /* lookup is a bonus; signup still validates */ });
  }, []);

  // If the database is not connected yet, say so up front instead of
  // letting the user fill in a form that cannot work.
  useEffect(() => {
    axiosInstance
      .get("/health")
      .then((res) => setDbDown(res.data?.db !== "connected"))
      .catch(() => setDbDown(false));
  }, []);

  // Google sign-in (Wesley, 20 Nov 2026): a Google signup logs the
  // new member straight in (same as a password login) — token and
  // user saved, app shell reloaded. A Google account whose email is
  // already on an admin account links to that account instead, and
  // the admin two-factor step lives on the login page, so that case
  // is sent there with a note.
  const finishGoogleLogin = (data) => {
    localStorage.setItem("token", data.token);
    if (data.user?.username) localStorage.setItem("tapin_username", data.user.username);
    if (data.user?.id) localStorage.setItem("tapin_user_id", data.user.id);
    if (data.user?.role) localStorage.setItem("tapin_role", data.user.role);
    window.dispatchEvent(new Event("tapin:auth-changed"));
    window.location.href = "#/";
    window.location.reload();
  };
  const handleGoogleTwoFactor = () => {
    setError("That Google account is linked to an admin — please log in on the login page and enter the admin sign-in code there.");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const response = await axiosInstance.post("/auth/register", {
        username,
        password,
        ...(referralCode.trim() ? { referralCode: referralCode.trim().toUpperCase() } : {}),
        ...(email.trim() ? { email: email.trim() } : {})
      });

      if (response.data.success) {
        window.location.href = "#/login";
      }
    } catch (err) {
      const serverError = err.response?.data?.error || "Registration failed";
      setError(
        serverError.includes("Database not connected")
          ? "Tap In's database is still being connected — sign-ups will work once it is up. Please try again soon."
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
        <h1 style={{ marginBottom: 30 }}>Register for Tap-In</h1>

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
            Heads up: sign-ups are paused while Tap In's database is being
            connected. You can still look around the app — your account will
            work once the database is up.
          </p>
        )}

        <GoogleSignInButton
          onSuccess={finishGoogleLogin}
          onTwoFactor={handleGoogleTwoFactor}
          referralCode={referralCode.trim() ? referralCode.trim().toUpperCase() : ""}
        />

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

          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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

          <input
            type="email"
            placeholder="Email (optional — for the verified checkmark, admin 2FA, and password reset)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            type="text"
            placeholder="Referral code (optional — from a friend's invite link)"
            value={referralCode}
            onChange={(e) => {
              setReferralCode(e.target.value.toUpperCase());
              setInvitedBy("");
              setReferralWarning("");
            }}
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
          {invitedBy && (
            <p style={{ color: "#00eaff", marginBottom: 15, fontSize: 14 }}>
              👋 You were invited by <b>{invitedBy}</b> — you'll be friends automatically when you sign up.
            </p>
          )}
          {referralWarning && (
            <p style={{ color: "#ffce54", marginBottom: 15, fontSize: 14 }}>
              {referralWarning}{" "}
              <button
                type="button"
                onClick={() => {
                  setReferralCode("");
                  setReferralWarning("");
                }}
                style={{ background: "none", border: "none", color: "#00eaff", cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: 14 }}
              >
                Clear the code
              </button>
            </p>
          )}

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
            {loading ? "Registering..." : "Register"}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: "center" }}>
          Already have an account? <a href="#/login" style={{ color: "#00eaff" }}>Login</a>
        </p>
        <p style={{ marginTop: 10, textAlign: "center" }}>
          <a href="#/" style={{ color: "#aaa" }}>← Back to Tap-In</a>
        </p>
      </div>
    </div>
  );
}