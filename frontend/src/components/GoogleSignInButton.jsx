import { useEffect, useRef, useState } from "react";
import axiosInstance from "../api/axios";

// "Continue with Google" — shared by the Login and Register screens
// (Wesley, 20 Nov 2026). Google Identity Services ID-token flow: the
// page loads Google's GIS script, renders the OFFICIAL Google button,
// and sends the ID token (credential JWT) to POST /auth/google. The
// backend verifies the token against GOOGLE_CLIENT_ID and only trusts
// the verified email in Google's payload — no client secret exists
// in this flow and no Google token is ever stored.
//
// The Client ID is NOT baked into the frontend: the button asks the
// backend (GET /auth/google/config) whether Google sign-in is set up.
// Until Wesley creates a Google Cloud OAuth client ID (Web
// application, authorized JavaScript origin
// https://tap-in-cakt.onrender.com) and sets GOOGLE_CLIENT_ID on the
// backend, the button shows the backend's clean "not set up yet"
// error and password login/signup keep working exactly as before.
// If Google's script fails to load (offline/blocked), the button
// degrades to a plain note instead of breaking the page.
const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";

let gisLoadPromise = null;
function loadGisScript() {
  if (typeof window !== "undefined" && window.google?.accounts?.id) {
    return Promise.resolve(true);
  }
  if (!gisLoadPromise) {
    gisLoadPromise = new Promise((resolve) => {
      const existing = document.querySelector(`script[src="${GIS_SCRIPT_URL}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(true));
        existing.addEventListener("error", () => resolve(false));
        return;
      }
      const script = document.createElement("script");
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }
  return gisLoadPromise;
}

// The Google "G" mark, drawn as an inline SVG (the official
// multi-colour G used on Google's own sign-in button).
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
      <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
      <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
      <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
    </svg>
  );
}

export default function GoogleSignInButton({ onSuccess, onTwoFactor, referralCode }) {
  const [status, setStatus] = useState("loading"); // loading | ready | unconfigured | gis-failed
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const buttonRef = useRef(null);
  const renderedRef = useRef(false);
  const mountedRef = useRef(true);
  // The GIS callback is registered once — it must always see the
  // latest props (the referral code is set after mount), so keep
  // them in a ref instead of closing over the first render.
  const latestRef = useRef({ onSuccess, onTwoFactor, referralCode });
  latestRef.current = { onSuccess, onTwoFactor, referralCode };

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    axiosInstance
      .get("/auth/google/config")
      .then((res) => {
        if (cancelled || !mountedRef.current) return;
        if (res.data?.configured && res.data?.clientId) {
          setClientId(res.data.clientId);
          setStatus("ready");
        } else {
          setStatus("unconfigured");
        }
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) setStatus("unconfigured");
      });
    return () => { cancelled = true; };
  }, []);

  const handleCredential = async (credential) => {
    setError("");
    setBusy(true);
    const { onSuccess: latestOnSuccess, onTwoFactor: latestOnTwoFactor, referralCode: latestReferral } = latestRef.current;
    try {
      const res = await axiosInstance.post("/auth/google", {
        credential,
        ...(latestReferral ? { referralCode: latestReferral } : {})
      });
      if (res.data?.success) {
        latestOnSuccess?.(res.data);
      } else if (res.data?.twoFactorRequired) {
        latestOnTwoFactor?.(res.data);
      } else {
        setError(res.data?.error || "Google sign-in didn't work — try again.");
      }
    } catch (err) {
      setError(err.response?.data?.error || "Google sign-in didn't work — try again.");
    } finally {
      setBusy(false);
    }
  };

  // Once configured, load GIS and render the official Google button.
  useEffect(() => {
    if (status !== "ready" || !clientId || renderedRef.current) return;
    let cancelled = false;
    loadGisScript().then((loaded) => {
      if (cancelled || !mountedRef.current) return;
      if (!loaded || !window.google?.accounts?.id) {
        setStatus("gis-failed");
        return;
      }
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => handleCredential(response?.credential || ""),
          auto_select: false
        });
        if (buttonRef.current) {
          window.google.accounts.id.renderButton(buttonRef.current, {
            theme: "outline",
            size: "large",
            width: 320,
            text: "continue_with"
          });
          renderedRef.current = true;
        }
      } catch (e) {
        setStatus("gis-failed");
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, clientId]);

  // Not configured yet: the button is still shown (so the option is
  // visible), and tapping it asks the backend — which answers with
  // its clean "not set up yet" error. Password login/signup below
  // are untouched.
  const handleUnconfiguredClick = async () => {
    setError("");
    setBusy(true);
    try {
      await axiosInstance.post("/auth/google", { credential: "" });
      setError("Google sign-in isn't set up yet.");
    } catch (err) {
      setError(err.response?.data?.error || "Google sign-in isn't set up yet.");
    } finally {
      setBusy(false);
    }
  };

  const fallbackBtnStyle = {
    width: "100%", padding: 12, borderRadius: 8, background: "#ffffff",
    border: "1px solid #dadce0", color: "#1f1f1f", fontSize: 16, fontWeight: 500,
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10
  };

  return (
    <div style={{ marginBottom: 15 }}>
      {status === "loading" && (
        <div style={{ width: "100%", padding: 12, borderRadius: 8, background: "#2b2d31", color: "#aaa", fontSize: 14, textAlign: "center" }}>
          Checking Google sign-in…
        </div>
      )}

      {status === "ready" && (
        <div ref={buttonRef} style={{ display: "flex", justifyContent: "center", minHeight: 40 }}>
          {/* The official Google button renders here. */}
        </div>
      )}

      {status === "gis-failed" && (
        <>
          <button type="button" disabled style={{ ...fallbackBtnStyle, opacity: 0.6, cursor: "not-allowed" }}>
            <GoogleG /> Continue with Google
          </button>
          <p style={{ color: "#ffce54", fontSize: 13, marginTop: 8, textAlign: "center" }}>
            Google sign-in couldn't load — check your connection, or use your password below.
          </p>
        </>
      )}

      {status === "unconfigured" && (
        <button type="button" onClick={handleUnconfiguredClick} disabled={busy} style={{ ...fallbackBtnStyle, opacity: busy ? 0.6 : 1 }}>
          <GoogleG /> {busy ? "Checking…" : "Continue with Google"}
        </button>
      )}

      {error && <p style={{ color: "#ff6b6b", marginTop: 10, fontSize: 14, textAlign: "center" }}>{error}</p>}

      {status !== "loading" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 15 }}>
          <div style={{ flex: 1, height: 1, background: "#333" }} />
          <span style={{ color: "#aaa", fontSize: 13 }}>or</span>
          <div style={{ flex: 1, height: 1, background: "#333" }} />
        </div>
      )}
    </div>
  );
}
