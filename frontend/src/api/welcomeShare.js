import axiosInstance from "./axios";

// Record a completed Tap In share as the member's ONE "Welcome to Tap
// In" post (Wesley, 19 Nov 2026). The backend dedupes: the first share
// creates the post, later shares return the existing one and create
// nothing. Call this ONLY after a share actually completed — a native
// share that resolved, a copy that succeeded, or a platform share link
// the member clicked. Never call it for a cancelled share sheet or a
// failed copy. Logged-out members get nothing (no token, no post).
// Errors are swallowed on purpose: recording the post must never break
// sharing itself. A module-level guard keeps one page load from firing
// repeat requests for the same link; the backend dedupe is the real
// guarantee.
const recordedLinks = new Set();

export async function recordWelcomeShare(link) {
  if (!link || recordedLinks.has(link)) return null;
  let token = null;
  try {
    token = localStorage.getItem("token");
  } catch {
    return null;
  }
  if (!token) return null;
  recordedLinks.add(link);
  try {
    const res = await axiosInstance.post(
      "/share/welcome",
      { link },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data || null;
  } catch {
    return null;
  }
}
