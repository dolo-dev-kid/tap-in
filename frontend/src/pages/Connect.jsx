import { useEffect, useState } from "react";

// Trifecta authorize page (Wesley, 25 Nov 2026) — Tap In is the
// identity provider, so one Tap In login works on Bangas-Only and
// Dolo45 Merch.
//
// URL: https://tap-in-cakt.onrender.com/connect?app=<bangas-only|merch>&redirect_uri=<exact app URL>
// (also works as #/connect?app=...&redirect_uri=... inside the app.)
//
// Rules (shared contract — do NOT rename or reshape):
// - redirect_uri whitelist: ONLY exactly
//   "https://bangas-only.onrender.com" and
//   "https://dolo45-merch.onrender.com". Anything else shows an error
//   and does NOT redirect anywhere.
// - Display names: bangas-only -> "Bangas-Only", merch -> "Dolo45 Merch".
// - Not signed in: send them to Tap In sign-in first, then back here
//   with the same params (the return URL is kept in sessionStorage
//   and honoured by Login.jsx — only a /connect URL is ever honoured).
// - Allow: redirect to redirect_uri + "#token=" + the user's current
//   Tap In JWT (the same token stored in localStorage as "token").
// - Deny: redirect to redirect_uri + "#error=access_denied".
// The token is never logged, printed, or stored anywhere new — it is
// read from localStorage and handed straight to the redirect.

// Marker string so a deployed bundle can be checked for this page.
export const CONNECT_MARKER = "tap-in-connect-authorize";

export const TRIFECTA_APPS = {
  "bangas-only": { displayName: "Bangas-Only", redirectUri: "https://bangas-only.onrender.com" },
  merch: { displayName: "Dolo45 Merch", redirectUri: "https://dolo45-merch.onrender.com" }
};

// Only a /connect URL for a whitelisted app is ever honoured as a
// return destination after sign-in — anything else is ignored, so a
// stored value can never bounce the user to another site.
export function validConnectReturn(raw) {
  if (typeof raw !== "string" || !raw) return null;
  const path = raw.startsWith("#") ? raw.slice(1) : raw; // "#/connect?..." -> "/connect?..."
  if (!path.startsWith("/connect?")) return null;
  let params;
  try {
    params = new URLSearchParams(path.split("?")[1] || "");
  } catch (e) {
    return null;
  }
  const app = TRIFECTA_APPS[params.get("app")];
  if (!app) return null;
  if (params.get("redirect_uri") !== app.redirectUri) return null;
  return path;
}

function readConnectParams() {
  // Plain path form: /connect?app=...&redirect_uri=... (the Render
  // rewrite serves index.html for it). Hash form: #/connect?app=...
  const fromSearch = new URLSearchParams(window.location.search || "");
  let app = fromSearch.get("app");
  let redirectUri = fromSearch.get("redirect_uri");
  if (!app && window.location.hash.includes("?")) {
    const hashQuery = window.location.hash.split("?")[1] || "";
    const hp = new URLSearchParams(hashQuery);
    app = hp.get("app");
    redirectUri = hp.get("redirect_uri");
  }
  return { app: app || "", redirectUri: redirectUri || "" };
}

const cardStyle = {
  background: "#1e1f22", padding: 40, borderRadius: 12, width: 400,
  maxWidth: "calc(100vw - 32px)", boxSizing: "border-box"
};
const btnStyle = {
  width: "100%", padding: 12, borderRadius: 8, background: "#00eaff",
  border: "none", color: "black", fontSize: 16, fontWeight: "bold", cursor: "pointer"
};
const denyBtnStyle = {
  ...btnStyle, background: "#2b2d31", color: "#ff6b6b", marginTop: 12
};

export default function Connect() {
  const [params] = useState(readConnectParams);
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState("");
  const [checked, setChecked] = useState(false);

  const app = TRIFECTA_APPS[params.app];
  const redirectOk = Boolean(app) && params.redirectUri === app.redirectUri;

  useEffect(() => {
    // Signed-in check: the Tap In JWT lives in localStorage under
    // "token" (set by Login.jsx). No API call here — the receiving
    // app validates the token itself against /api/auth/me.
    let stored = null;
    let name = "";
    try {
      stored = localStorage.getItem("token") || null;
      name = localStorage.getItem("tapin_username") || "";
    } catch (e) { /* storage unavailable */ }
    setToken(stored);
    setUsername(name);
    setChecked(true);
    if (!stored) {
      // Not signed in: remember where to come back to, then send
      // them to Tap In sign-in. The return URL is the plain-path
      // /connect form so the rewrite serves it after login.
      try {
        sessionStorage.setItem(
          "tapin_connect_return",
          `/connect?app=${encodeURIComponent(params.app)}&redirect_uri=${encodeURIComponent(params.redirectUri)}`
        );
      } catch (e) { /* storage unavailable */ }
      window.location.href = "#/login";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goAllow = () => {
    if (!redirectOk || !token) return;
    window.location.href = `${params.redirectUri}#token=${token}`;
  };
  const goDeny = () => {
    if (!redirectOk) return;
    window.location.href = `${params.redirectUri}#error=access_denied`;
  };

  return (
    <div data-connect-page={CONNECT_MARKER} style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#0f0f0f", color: "white" }}>
      <div style={cardStyle}>
        <h1 style={{ marginBottom: 10 }}>Connect to Tap In</h1>
        {!checked && <p style={{ color: "#aaa", fontSize: 14 }}>Checking your Tap In sign-in…</p>}
        {checked && !redirectOk && (
          <>
            <p style={{ color: "#ff6b6b", marginBottom: 15 }}>
              That connection request isn&apos;t valid — the app or return address doesn&apos;t match. Nothing was connected.
            </p>
            <p style={{ color: "#aaa", fontSize: 14 }}>
              Only Bangas-Only and Dolo45 Merch can connect through Tap In. Go back to the app and try again.
            </p>
            <p style={{ marginTop: 20, textAlign: "center" }}>
              <a href="#/" style={{ color: "#00eaff" }}>Back to Tap In</a>
            </p>
          </>
        )}
        {checked && redirectOk && token && (
          <>
            <p style={{ color: "#aaa", fontSize: 14, marginBottom: 15 }}>
              <strong style={{ color: "white" }}>{app.displayName}</strong> wants to use your Tap In login
              so you don&apos;t need a separate account there.
            </p>
            <p style={{ color: "#aaa", fontSize: 14, marginBottom: 20 }}>
              Signed in as <strong style={{ color: "white" }}>{username || "your Tap In account"}</strong>.
              Allowing shares your Tap In sign-in with {app.displayName} — it does not share your password.
            </p>
            <button type="button" onClick={goAllow} style={btnStyle}>
              Allow — connect {app.displayName}
            </button>
            <button type="button" onClick={goDeny} style={denyBtnStyle}>
              Deny
            </button>
            <p style={{ marginTop: 20, textAlign: "center" }}>
              <a href="#/" style={{ color: "#aaa" }}>Cancel — back to Tap In</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
