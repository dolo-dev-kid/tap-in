import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";

// Email verification — the only way to earn the ✓ checkmark (other
// than the owner Dolo45, who is verified by seed). A member adds the
// email on their account, Tap In emails them a 6-digit code, they
// enter it here. No ID documents, no admin judging socials, no
// self-verification. When email sending is not configured on the
// backend, the form says so plainly and no code can be sent.
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("token") || ""}` };
}

export default function EmailVerification() {
  const [status, setStatus] = useState(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const load = async () => {
    try {
      const res = await axiosInstance.get("/verification/status", { headers: authHeaders() });
      setStatus(res.data || null);
      setEmail(res.data?.email || "");
    } catch {
      setStatus(null);
    }
  };

  useEffect(() => { load(); }, []);

  const requestCode = async () => {
    setBusy(true); setNote("");
    try {
      const res = await axiosInstance.post("/verification/request", { email }, { headers: authHeaders() });
      setCodeSent(true);
      setNote(res.data?.maskedEmail ? `Code sent to ${res.data.maskedEmail} — check your email, it expires in 15 minutes.` : "Code sent — check your email.");
    } catch (err) {
      setNote(err.response?.data?.error || "Could not send a code — please try again.");
    } finally { setBusy(false); }
  };

  const confirmCode = async () => {
    setBusy(true); setNote("");
    try {
      await axiosInstance.post("/verification/confirm", { code }, { headers: authHeaders() });
      setNote("You're verified ✓ — the checkmark now shows next to your name everywhere on Tap In.");
      setCodeSent(false); setCode("");
      load();
    } catch (err) {
      setNote(err.response?.data?.error || "Could not verify that code — please try again.");
    } finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 16, background: "#2b2d31", border: "1px solid #00eaff", borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 13, color: "#aaa" }}>✓ Account verification — by email</div>
      {status?.verified ? (
        <p style={{ marginTop: 8, color: "#7CFC9A", fontWeight: "bold" }}>✓ Verified{status?.email ? ` — ${status.email}` : ""}</p>
      ) : (
        <>
          <p style={{ marginTop: 8, color: "#aaa", fontSize: 13 }}>
            Get the verified checkmark: add your email, we'll send you a 6-digit code, enter it here. No ID, no documents.
          </p>
          {status && status.emailConfigured === false && (
            <p style={{ marginTop: 8, color: "#ffce54", fontSize: 13 }}>
              Email sending isn't set up on Tap In yet, so a code can't be sent right now. Dolo45 needs to connect an email service on the backend first — your email will be saved for when it is.
            </p>
          )}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email address"
            type="email"
            style={{ width: "100%", padding: 12, marginTop: 10, borderRadius: 8, border: "none", background: "#1e1f22", color: "white" }}
          />
          <button onClick={requestCode} disabled={busy || !email} style={{ marginTop: 10, padding: "10px 16px", borderRadius: 8, background: "#00eaff", border: "none", cursor: "pointer", fontWeight: "bold", color: "black" }}>
            {busy ? "Sending…" : "Send verification code"}
          </button>
          {codeSent && (
            <div style={{ marginTop: 12 }}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit code"
                inputMode="numeric"
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#1e1f22", color: "white" }}
              />
              <button onClick={confirmCode} disabled={busy || code.length !== 6} style={{ marginTop: 10, padding: "10px 16px", borderRadius: 8, background: "#00eaff", border: "none", cursor: "pointer", fontWeight: "bold", color: "black" }}>
                {busy ? "Checking…" : "Verify my email"}
              </button>
            </div>
          )}
        </>
      )}
      {note && <p style={{ marginTop: 10, color: "#ffce54", fontSize: 13 }}>{note}</p>}
    </div>
  );
}
