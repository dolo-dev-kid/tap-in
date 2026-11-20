import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";
import GoogleSignInButton from "../components/GoogleSignInButton";

const inputStyle = {
  width: "100%", padding: 12, marginBottom: 15, borderRadius: 8,
  border: "none", background: "#2b2d31", color: "white"
};
const btnStyle = {
  width: "100%", padding: 12, borderRadius: 8, background: "#00eaff",
  border: "none", color: "black", fontSize: 16, fontWeight: "bold", cursor: "pointer"
};

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [dbDown, setDbDown] = useState(false);
  // Admin 2FA: after the password, an admin gets a code emailed to
  // the verified email on their account and must enter it here.
  // Non-admins never see this step.
  const [step, setStep] = useState("login"); // login | 2fa | forgot | reset
  const [tempToken, setTempToken] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [needsEmail, setNeedsEmail] = useState(false);
  const [setupEmail, setSetupEmail] = useState("");
  const [setupNote, setSetupNote] = useState("");
  // Password reset (owner-approved): ask by email, Dolo45 approves
  // in the Admin panel, only then is a code emailed.
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    axiosInstance.get("/health")
      .then((res) => setDbDown(res.data?.db !== "connected"))
      .catch(() => setDbDown(false));
  }, []);

  const finishLogin = (data) => {
    localStorage.setItem("token", data.token);
    if (data.user?.username) localStorage.setItem("tapin_username", data.user.username);
    if (data.user?.id) localStorage.setItem("tapin_user_id", data.user.id);
    if (data.user?.role) localStorage.setItem("tapin_role", data.user.role);
    // Force a fresh load of the app shell: a bare hash change to "#/"
    // does not remount anything when the hash is already "#/", which
    // left Log in / Sign up on screen after logging in. The reload
    // guarantees the shell mounts with the new auth state.
    window.dispatchEvent(new Event("tapin:auth-changed"));
    window.location.href = "#/";
    window.location.reload();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(""); setInfo("");
    try {
      const response = await axiosInstance.post("/auth/login", { username, password });
      if (response.data.twoFactorRequired) {
        setTempToken(response.data.tempToken || "");
        setMaskedEmail(response.data.maskedEmail || "");
        setNeedsEmail(Boolean(response.data.needsEmail));
        setStep("2fa");
        setInfo(response.data.needsEmail
          ? "Admin sign-in needs a verified email first — add yours below and we'll send a verification code."
          : `Admin sign-in: a code was emailed to ${response.data.maskedEmail || "your email"}. Enter it below.`);
        return;
      }
      if (response.data.success) {
        if (response.data.twoFactorPending) {
          setInfo("You're logged in. Heads up: admin two-factor is not active yet — email sending isn't set up on Tap In, so no code can be sent. Dolo45 needs to connect an email service first.");
        }
        finishLogin(response.data);
      }
    } catch (err) {
      const serverError = err.response?.data?.error || "Login failed";
      setError(serverError.includes("Database not connected")
        ? "Tap In's database is still being connected — logins will work once it is up. Please try again soon."
        : serverError);
    } finally { setLoading(false); }
  };

  const submitTwoFactor = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await axiosInstance.post("/auth/verify-2fa", { tempToken, code: twoFactorCode });
      if (res.data.success) finishLogin(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "That code didn't work — try again.");
    } finally { setLoading(false); }
  };

  // Google sign-in (Wesley, 20 Nov 2026): a Google login for an
  // admin account follows the same two-factor step as a password
  // login — the code is emailed after Google verifies them.
  const handleGoogleTwoFactor = (data) => {
    setTempToken(data.tempToken || "");
    setMaskedEmail(data.maskedEmail || "");
    setNeedsEmail(Boolean(data.needsEmail));
    setStep("2fa");
    setInfo(data.needsEmail
      ? "Admin sign-in needs a verified email first — add yours below and we'll send a verification code."
      : `Admin sign-in: a code was emailed to ${data.maskedEmail || "your email"}. Enter it below.`);
  };

  const submitSetupEmail = async (e) => {
    e.preventDefault();
    setLoading(true); setSetupNote("");
    try {
      const res = await axiosInstance.post("/auth/2fa/setup-email", { email: setupEmail }, { headers: { Authorization: `Bearer ${tempToken}` } });
      setSetupNote(res.data?.maskedEmail ? `Verification code sent to ${res.data.maskedEmail}. Enter it on your Profile once you log in — or use the code below after logging in again.` : "Code sent — check your email.");
    } catch (err) {
      setSetupNote(err.response?.data?.error || "Could not send a verification code.");
    } finally { setLoading(false); }
  };

  const submitForgot = async (e) => {
    e.preventDefault();
    setLoading(true); setError(""); setInfo("");
    try {
      const res = await axiosInstance.post("/auth/forgot-password", { email: forgotEmail });
      setInfo(res.data?.message || "Request sent.");
      setResetEmail(forgotEmail);
      setStep("reset");
    } catch (err) {
      setInfo("If an account uses that email, Dolo45 will review the reset request.");
      setStep("reset");
    } finally { setLoading(false); }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setLoading(true); setError(""); setInfo("");
    try {
      const res = await axiosInstance.post("/auth/reset-password", { email: resetEmail, code: resetCode, newPassword });
      setInfo(res.data?.message || "Password changed — log in with your new password.");
      setStep("login");
    } catch (err) {
      setError(err.response?.data?.error || "That reset didn't work — check the code and try again.");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "#0f0f0f", color: "white" }}>
      <div style={{ background: "#1e1f22", padding: 40, borderRadius: 12, width: 400 }}>
        <h1 style={{ marginBottom: 30 }}>Login to Tap-In</h1>
        {dbDown && (
          <p style={{ background: "#3a2f00", color: "#ffce54", padding: 12, borderRadius: 8, marginBottom: 15, fontSize: 14 }}>
            Heads up: logins are paused while Tap In's database is being connected. You can still look around the app — your account will work once the database is up.
          </p>
        )}
        {info && <p style={{ color: "#7CFC9A", marginBottom: 15, fontSize: 14 }}>{info}</p>}
        {error && <p style={{ color: "#ff6b6b", marginBottom: 15 }}>{error}</p>}

        {step === "login" && (
          <>
            <GoogleSignInButton onSuccess={finishLogin} onTwoFactor={handleGoogleTwoFactor} />
            <form onSubmit={handleSubmit}>
              <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
              <button type="submit" disabled={loading} style={{ ...btnStyle, opacity: loading ? 0.6 : 1 }}>{loading ? "Logging in..." : "Login"}</button>
            </form>
          </>
        )}

        {step === "2fa" && (
          <form onSubmit={submitTwoFactor}>
            <p style={{ color: "#aaa", fontSize: 14, marginBottom: 15 }}>
              {needsEmail ? "Admins need a verified email for two-factor sign-in." : `A sign-in code was emailed${maskedEmail ? ` to ${maskedEmail}` : ""}. It expires in 15 minutes.`}
            </p>
            {needsEmail && (
              <>
                <input type="email" placeholder="Your email address" value={setupEmail} onChange={(e) => setSetupEmail(e.target.value)} style={inputStyle} />
                <button type="button" onClick={submitSetupEmail} disabled={loading || !setupEmail} style={{ ...btnStyle, background: "#2b2d31", color: "#00eaff", marginBottom: 15 }}>Send verification code to this email</button>
                {setupNote && <p style={{ color: "#ffce54", fontSize: 14, marginBottom: 15 }}>{setupNote}</p>}
                <p style={{ color: "#aaa", fontSize: 13, marginBottom: 15 }}>After your email is verified, log in again and the sign-in code will come to it.</p>
              </>
            )}
            {!needsEmail && (
              <>
                <input value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit sign-in code" inputMode="numeric" style={inputStyle} />
                <button type="submit" disabled={loading || twoFactorCode.length !== 6} style={{ ...btnStyle, opacity: loading ? 0.6 : 1 }}>{loading ? "Checking…" : "Verify & log in"}</button>
              </>
            )}
            <button type="button" onClick={() => setStep("login")} style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", marginTop: 15 }}>← Back to login</button>
          </form>
        )}

        {step === "forgot" && (
          <form onSubmit={submitForgot}>
            <p style={{ color: "#aaa", fontSize: 14, marginBottom: 15 }}>
              Enter the email on your Tap In account. Dolo45 has to approve the reset first — only then is a code emailed to you.
            </p>
            <input type="email" placeholder="Email on your account" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} style={inputStyle} />
            <button type="submit" disabled={loading || !forgotEmail} style={btnStyle}>{loading ? "Sending…" : "Ask for a reset"}</button>
            <button type="button" onClick={() => setStep("login")} style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", marginTop: 15 }}>← Back to login</button>
          </form>
        )}

        {step === "reset" && (
          <form onSubmit={submitReset}>
            <p style={{ color: "#aaa", fontSize: 14, marginBottom: 15 }}>
              If Dolo45 approved your reset, a 6-digit code was emailed to you. Enter it with a new password (at least 6 characters). The code expires in 15 minutes and works once.
            </p>
            <input type="email" placeholder="Email on your account" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} style={inputStyle} />
            <input value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit reset code" inputMode="numeric" style={inputStyle} />
            <input type="password" placeholder="New password (at least 6 characters)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputStyle} />
            <button type="submit" disabled={loading || resetCode.length !== 6 || newPassword.length < 6} style={btnStyle}>{loading ? "Resetting…" : "Reset my password"}</button>
            <button type="button" onClick={() => setStep("login")} style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", marginTop: 15 }}>← Back to login</button>
          </form>
        )}

        {step === "login" && (
          <p style={{ marginTop: 15, textAlign: "center" }}>
            <button type="button" onClick={() => { setStep("forgot"); setError(""); setInfo(""); }} style={{ background: "none", border: "none", color: "#00eaff", cursor: "pointer" }}>Forgot your password?</button>
          </p>
        )}
        <p style={{ marginTop: 20, textAlign: "center" }}>
          Don't have an account? <a href="#/register" style={{ color: "#00eaff" }}>Register</a>
        </p>
        <p style={{ marginTop: 10, textAlign: "center" }}>
          <a href="#/" style={{ color: "#aaa" }}>← Back to Tap-In</a>
        </p>
      </div>
    </div>
  );
}
