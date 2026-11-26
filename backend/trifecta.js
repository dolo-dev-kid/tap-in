// Trifecta full sync — Tap In side (Wesley, 25 Nov 2026).
// Tap In becomes the identity provider: one Tap In login works on
// Bangas-Only and Dolo45 Merch.
//
// Endpoints (shared contract — do NOT rename or reshape):
//   GET  /api/auth/me          Bearer JWT -> 200 {"username": ...} or 401
//   POST /api/daw/projects     Bearer JWT, {name, data, updatedAt} -> 200 {"ok": true, ...}
//   GET  /api/daw/projects     Bearer JWT -> 200 {"projects": [{name, data, updatedAt}, ...]}
//
// MOUNTING — this module is NOT wired in yet. server.js is the only
// backend entry point and it is currently dirty with unrelated work,
// so this file is staged here and needs TWO small edits in
// backend/server.js (from whoever pushes server.js next):
//
//   1. CORS — add the two trifecta origins to the ALLOWED_ORIGINS
//      list near the top of server.js:
//        "https://bangas-only.onrender.com",
//        "https://dolo45-merch.onrender.com",
//      (Required: the global cors middleware answers OPTIONS
//      preflights itself and ends the response, so a route-scoped
//      cors added later can never add the headers to a preflight.
//      The scoped cors installed by registerTrifecta below is
//      belt-and-braces for the actual GET/POST only.)
//   2. Routes — after requireAuth / requireDb are defined, add:
//        const { registerTrifecta } = require("./trifecta");
//        registerTrifecta(app, { requireAuth, requireDb });
//
// No token or secret is ever logged, printed or stored here. Auth
// behaviour is untouched: the endpoints reuse server.js's own
// requireAuth (same JWT, same banned / tokenVersion checks).

const cors = require("cors");
const DawProject = require("./models/DawProject");

// The ONLY origins the trifecta CORS rules ever allow. No wildcard.
const TRIFECTA_ORIGINS = [
  "https://bangas-only.onrender.com",
  "https://dolo45-merch.onrender.com"
];

function parseUpdatedAt(raw) {
  const d = raw === undefined || raw === null ? new Date() : new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function registerTrifecta(app, { requireAuth, requireDb }) {
  if ((typeof app !== "object" && typeof app !== "function") || typeof requireAuth !== "function" || typeof requireDb !== "function") {
    throw new Error("registerTrifecta needs app, requireAuth and requireDb from server.js");
  }

  // CORS on the trifecta routes for the two app origins only: GET +
  // POST, Authorization header allowed. (See the header comment: the
  // global ALLOWED_ORIGINS edit is still required for preflights.)
  const trifectaCors = cors({
    origin: TRIFECTA_ORIGINS,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"]
  });
  app.use("/api/auth/me", trifectaCors);
  app.use("/api/daw/projects", trifectaCors);

  // GET /api/auth/me — thin wrapper over the existing auth
  // middleware: 200 {"username": ...} when the Bearer token is good,
  // 401 when it is missing/invalid (requireAuth answers that).
  app.get("/api/auth/me", requireDb, requireAuth, (req, res) => {
    res.json({ username: req.user.username, id: req.user._id, role: req.user.role });
  });

  // POST /api/daw/projects — upsert one DAW project per (user, name).
  // Body: {"name": string, "data": <JSON project>, "updatedAt": <ISO string or ms>}.
  app.post("/api/daw/projects", requireDb, requireAuth, async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name || name.length > 200) {
        return res.status(400).json({ error: "Project name required" });
      }
      if (req.body?.data === undefined) {
        return res.status(400).json({ error: "Project data required" });
      }
      const updatedAt = parseUpdatedAt(req.body?.updatedAt);
      const doc = await DawProject.findOneAndUpdate(
        { userId: req.user._id, name },
        { $set: { username: req.user.username, data: req.body.data, updatedAt } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      res.json({ ok: true, name: doc.name, updatedAt: doc.updatedAt });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/daw/projects — my projects, newest first.
  app.get("/api/daw/projects", requireDb, requireAuth, async (req, res) => {
    try {
      const docs = await DawProject.find({ userId: req.user._id })
        .sort({ updatedAt: -1 })
        .lean();
      res.json({
        projects: docs.map((d) => ({ name: d.name, data: d.data, updatedAt: d.updatedAt }))
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerTrifecta, TRIFECTA_ORIGINS };
