import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3001",
  withCredentials: true
});

// A banned account must not stay "logged in" in the app: if any API
// call comes back 403 banned, clear the saved login and reload to the
// landing page. This only fires on a banned response — a normal 403
// (e.g. "admin only") does not log anyone out.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = String(err?.response?.data?.error || "");
    if (err?.response?.status === 403 && /banned/i.test(msg)) {
      try {
        ["token", "tapin_username", "tapin_user_id", "tapin_role", "tapin_bio"].forEach((k) =>
          localStorage.removeItem(k)
        );
      } catch (e) { /* storage unavailable */ }
      if (typeof window !== "undefined") window.location.reload();
    }
    return Promise.reject(err);
  }
);

export default api;
