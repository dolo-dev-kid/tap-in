require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const nodemailer = require("nodemailer");
const multer = require("multer");
const { GridFSBucket, ObjectId } = require("mongodb");
const { Server } = require("socket.io");
const User = require("./models/User");
const Post = require("./models/Post");
const Upload = require("./models/Upload");
const ChatRoom = require("./models/ChatRoom");
const ChatMessage = require("./models/ChatMessage");
const GlobalChatMessage = require("./models/GlobalChatMessage");
const ChatFlag = require("./models/ChatFlag");
const Notification = require("./models/Notification");
const { scanChatMessage } = require("./chatFlags");
const { sameUsername, findUserByUsername, usernameTaken } = require("./usernameLookup");

const app = express();
const server = http.createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
// CORS: only Tap In's own origins, never a wildcard. The live frontend
// is https://tap-in-cakt.onrender.com; local dev is :5173; the Play
// app talks over capacitor://localhost.
const ALLOWED_ORIGINS = [FRONTEND_URL, "http://localhost:5173", "capacitor://localhost", "https://tap-in-cakt.onrender.com"];
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Video-chat room registry: socket ids per room name. This is ONLY a
// live-connection registry — it is NOT where chats are stored. Private
// chat rooms and messages live in MongoDB (ChatRoom / ChatMessage),
// so a Render restart never loses anyone's chats.
const rooms = {};

// Who is live right now: room name -> { userId, username, room,
// startedAt }. A "go live" is joining a video room with the camera
// on (Stream Dashboard -> Video Chat) — there was no backend event
// for it at all before this, so nobody could ever be told someone
// went live. The map lives in memory; the notifications it triggers
// are stored in MongoDB, so they survive a restart even if the
// "live now" list does not.
const liveBroadcasts = new Map();

// MongoDB Connection — do not crash the server if the DB is down / not configured.
// Auth routes return 503 with a clear message until MongoDB is connected.
let dbConnected = false;
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.warn("⚠️  MONGODB_URI is not set — server will start, but auth/friends/servers need MongoDB. Copy backend/.env.example to backend/.env and set it.");
} else {
  mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
    .then(() => { dbConnected = true; console.log("✅ MongoDB Connected"); ensureVerifiedSeed(); })
    .catch((err) => console.error("❌ MongoDB Error:", err.message));
}
mongoose.connection.on("connected", () => { dbConnected = true; ensureVerifiedSeed(); });
mongoose.connection.on("disconnected", () => { dbConnected = false; });

function requireDb(req, res, next) {
  if (!dbConnected) {
    return res.status(503).json({ error: "Tap In's database is still being connected — logins and sign-ups will work once it is up. Please try again soon." });
  }
  next();
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn("⚠️  JWT_SECRET is not set — set a long random secret in backend/.env. Using a dev-only fallback; do NOT use in production.");
}
const jwtSecret = JWT_SECRET || "dev-only-change-me";
if (process.env.NODE_ENV === "production" && !JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is not set in production — refusing to start with a dev fallback.");
  process.exit(1);
}

// --- Owner / admin role -------------------------------------------------
// SAFETY: this is owner moderation for Wesley's own app (Tap In) —
// keeping the community safe, e.g. keeping creeps away from kids on the
// app. It is not a bypass for other people's accounts, and admin
// endpoints never return passwords or password hashes.
// The owner's username is set by env var, never hardcoded here. On
// register/login, an exact username match with ADMIN_USERNAME gets the
// "admin" role. Set ADMIN_USERNAME in the backend env (Render: env vars;
// local: backend/.env) to the owner's Tap In username.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
function isOwnerUsername(username) {
  // EXACT, case-sensitive match only: the owner is "Dolo45" (capital
  // D). The lowercase account "dolo45" is a separate account that
  // Wesley banned — it must NEVER get the admin role. Do not make
  // this case-insensitive. The env var is the only source of the
  // owner username; nothing is hardcoded here.
  return Boolean(ADMIN_USERNAME) && username === ADMIN_USERNAME;
}

// --- Google sign-in (Wesley, 20 Nov 2026) ----------------------------
// "Continue with Google" on the login + signup screens, via Google
// Identity Services ID tokens (no client secret needed — the backend
// only verifies the token). The Client ID comes from the
// GOOGLE_CLIENT_ID env var (Render backend env). It is NOT invented
// anywhere: until Wesley creates a Google Cloud OAuth client ID (Web
// application, authorized JavaScript origin
// https://tap-in-cakt.onrender.com) and sets it, Google sign-in fails
// closed with a clear "not configured" error and password login is
// completely unaffected.
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || "").trim();
let googleClient = null;
function getGoogleClient() {
  if (!GOOGLE_CLIENT_ID) return null;
  if (!googleClient) googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
  return googleClient;
}

// Verify the JWT from `Authorization: Bearer <token>` and load the user.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Login required" });
  try {
    const decoded = jwt.verify(token, jwtSecret);
    // A 2FA temp token (purpose "2fa") is NOT a login — it can only
    // finish the second factor, never call normal endpoints.
    if (decoded.purpose && decoded.purpose !== "full") {
      return res.status(401).json({ error: "Finish two-factor authentication first" });
    }
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: "User not found" });
    if (user.banned) return res.status(403).json({ error: "This account has been banned" });
    // A password reset bumps tokenVersion, so every token issued
    // before the reset stops working here (stale-token check).
    if (typeof decoded.tokenVersion === "number" && decoded.tokenVersion !== (user.tokenVersion || 0)) {
      return res.status(401).json({ error: "Your login was reset — please log in again" });
    }
    req.user = user;
    req.tokenTwoFactorVerified = decoded.twoFactorVerified === true;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired login" });
  }
}

// Admin only: must be logged in AND have role "admin".
// Admin 2FA: once email sending is configured, an admin token must
// also carry twoFactorVerified=true (earned by entering the code
// emailed at login). Until email sending is configured, 2FA cannot
// run — admins are NOT locked out, but the server logs a warning and
// the frontend shows "2FA not active yet". This is deliberate: never
// lock the owner out of a working login over a code that was never sent.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access only" });
  }
  if (emailConfigured() && !req.tokenTwoFactorVerified) {
    return res.status(403).json({ error: "Admin two-factor authentication required — log in again and enter the code sent to your email." });
  }
  next();
}

// authAny: accepts a full login token OR a 2FA temp token. Used
// only by the verification / 2FA-setup endpoints, where a member
// may be mid-login (temp token) or fully logged in. Temp tokens can
// never call normal endpoints (requireAuth rejects them).
async function authAny(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Login required" });
  try {
    const decoded = jwt.verify(token, jwtSecret);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: "User not found" });
    if (user.banned) return res.status(403).json({ error: "This account has been banned" });
    if (decoded.purpose === "full" && typeof decoded.tokenVersion === "number" && decoded.tokenVersion !== (user.tokenVersion || 0)) {
      return res.status(401).json({ error: "Your login was reset — please log in again" });
    }
    req.user = user;
    req.tokenPurpose = decoded.purpose || "full";
    req.tokenTwoFactorVerified = decoded.twoFactorVerified === true;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired login" });
  }
}

// requireOwner: ONLY the owner (exact username Dolo45, ADMIN_USERNAME)
// — not other admins. Private-chat review is owner-only: Wesley
// screens private chats himself. Other admins (AnneStar83,
// Alantanto, etc.) can moderate users/uploads, but they can NEVER
// read someone else's private chats or safety flags.
function requireOwner(req, res, next) {
  if (!req.user || !isOwnerUsername(req.user.username)) {
    return res.status(403).json({ error: "Only Dolo45 (the owner) can review private chats" });
  }
  next();
}

// Dolo45's profile pic is the AI studio pic (AI-generated recording
// booth, Pittsburgh skyline), shipped as a data URI in dolo45Avatar.js.
// Wesley said 16 Nov 2026 he never sent the real photos, so the real
// Instagram profile pic was REMOVED. Shown
// ONLY for the exact username "Dolo45" (case-sensitive — the separate
// banned lowercase "dolo45" account never gets it), and only when the
// account has no saved avatar of its own. A saved avatar always wins.
const { DOLO45_AVATAR_DATA_URI } = require("./dolo45Avatar");
const DOLO45_AVATAR_URL = DOLO45_AVATAR_DATA_URI;
function dolo45Avatar(u) {
  if (u && u.username === "Dolo45" && !u.avatar) return DOLO45_AVATAR_URL;
  return u.avatar || "";
}

// Social links — the seven platforms Tap In links out to (Discord
// added 16 Nov 2026, Wesley: "I got Discord as well so I'ma sync my
// Discord account to my tap in account"). A value is
// either empty, a plain handle (@name or name, letters/digits/./_/-),
// or a full http(s) URL. Anything else (javascript:, data:, spaces,
// over 200 chars) is rejected, never stored. Only the six keys are
// ever kept — anything else in the body is dropped.
const SOCIAL_PLATFORMS = ["instagram", "facebook", "tiktok", "youtube", "soundcloud", "bandlab", "discord"];
function cleanSocialLinks(input) {
  const out = {};
  for (const key of SOCIAL_PLATFORMS) out[key] = "";
  if (!input || typeof input !== "object") return out;
  for (const key of SOCIAL_PLATFORMS) {
    const raw = input[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "string") throw new Error(`${key} link must be text`);
    const v = raw.trim().slice(0, 200);
    if (!v) continue;
    if (/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v)) { out[key] = v; continue; }
    // Discord: a username (new style, 2-32 chars) or a legacy
    // name#1234, or a server invite link (discord.gg/… — caught by
    // the URL check above). A Discord username has no public profile
    // URL, so the frontend shows it as text, not a link.
    if (key === "discord" && /^@?[A-Za-z0-9._-]{2,32}(#[0-9]{4})?$/.test(v)) { out[key] = v; continue; }
    if (/^@?[A-Za-z0-9._-]{1,64}$/.test(v)) { out[key] = v; continue; }
    throw new Error(`${key} must be a link (https://…) or a handle (@name)`);
  }
  return out;
}
function publicSocialLinks(u) {
  const links = u.socialLinks || {};
  const out = {};
  for (const key of SOCIAL_PLATFORMS) out[key] = typeof links[key] === "string" ? links[key] : "";
  // Dolo45's own platforms, seeded (16 Nov 2026, Wesley: "sync all
  // my social media platforms") — his real accounts only, shown ONLY
  // for the exact username "Dolo45" (case-sensitive — the separate
  // banned lowercase "dolo45" never gets them), and ONLY when the
  // account has no saved links of its own. A saved link always wins:
  // as soon as any link is saved, the saved set is shown as-is.
  // Links only — no OAuth, no follower import, no auto-posting.
  // Discord IS seeded for Dolo45 now: Wesley gave his Discord
  // username "Dolo45" AND his server invite link on 16 Nov 2026.
  // Same pattern as his other six: exact username "Dolo45" only,
  // only when he has no saved links at all, a saved link always
  // wins, banned lowercase "dolo45" never gets it. The seeded value
  // is the invite link — the frontend shows it as "Discord: Dolo45"
  // (his username) linking to the invite. The invite is for Tap In
  // profile / Find Members ONLY — it is never posted publicly
  // anywhere else.
  if (u && u.username === "Dolo45" && !SOCIAL_PLATFORMS.some((k) => out[k])) {
    Object.assign(out, DOLO45_SOCIAL_LINKS);
  }
  // Booking — Dolo45 only (exact username), whether or not he has
  // saved social links. Wesley, 18 Nov 2026: book him for live shows
  // ($500) and features ($250) at his booking page.
  if (u && u.username === "Dolo45") out.booking = DOLO45_BOOKING_URL;
  return out;
}

// Dolo45's real accounts (Wesley, 16 Nov 2026). Nothing invented.
const DOLO45_SOCIAL_LINKS = {
  instagram: "https://instagram.com/nho_life_dolo45",
  facebook: "https://www.facebook.com/1Dolo45",
  tiktok: "@dolo45_music",
  youtube: "https://www.youtube.com/@Dolo45-ent",
  soundcloud: "https://soundcloud.com/dolo45",
  bandlab: "pgh_dolo45",
  // Wesley's Discord server invite link, given by him 16 Nov 2026.
  // Tap In profile / Find Members ONLY — never posted publicly.
  discord: "https://discord.gg/w6aX8NDK"
};

// Dolo45's music booking page (Wesley, 18 Nov 2026): live shows $500,
// features $250. Shown on his Tap In profile / Find Members ONLY,
// exact username "Dolo45" only — never for any other member, and
// never editable as a social link (it is seeded on read, not saved).
const DOLO45_BOOKING_URL = "https://muse.ai/s/book-dolo45-xlxd6xbxzxcxzxnwcp/XLlEc4Qgl2txoWdAKeys3S61ftrSEEFTLHMVpp8McCI";

// --- Email (verification + admin 2FA + password reset) --------------
// Tap In had NO email on accounts and NO mail service before this.
// Sending uses SMTP from env only: SMTP_HOST, SMTP_PORT, SMTP_USER,
// SMTP_PASS, SMTP_FROM (e.g. a Gmail app password, or any SMTP
// provider). If any of those are missing, emailConfigured() is false
// and NOTHING is sent — endpoints say so plainly and no code is
// issued, so a code can never be "confirmed" that was never emailed.
// Do NOT fake a sent email. To turn email on live, set those five
// vars on the Render backend service and redeploy; no code change.
function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}
let mailTransporter = null;
function getTransporter() {
  if (!emailConfigured()) return null;
  if (!mailTransporter) {
    mailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return mailTransporter;
}
async function sendEmail(to, subject, text) {
  const t = getTransporter();
  if (!t) return { sent: false, reason: "email_not_configured" };
  try {
    await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
    return { sent: true };
  } catch (err) {
    console.error("Email send failed:", err.message);
    return { sent: false, reason: "email_send_failed" };
  }
}
function makeSixDigitCode() {
  return String(crypto.randomInt(100000, 1000000));
}
function hashCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}
function codeMatches(code, hash) {
  if (!code || !hash) return false;
  const a = Buffer.from(hashCode(code));
  const b = Buffer.from(String(hash));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CODE_MAX_ATTEMPTS = 5;
// --- Stream key encryption (multistream destinations) ----------------
// AES-256-GCM, key from STREAM_KEY_SECRET (or JWT_SECRET as fallback
// — set STREAM_KEY_SECRET on Render for separation). Keys are
// encrypted before MongoDB, never logged, never returned by any API.
function streamKeyCipher() {
  const secret = process.env.STREAM_KEY_SECRET || jwtSecret;
  return crypto.createHash("sha256").update(String(secret)).digest();
}
function encryptStreamKey(key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", streamKeyCipher(), iv);
  const enc = Buffer.concat([cipher.update(String(key), "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc.toString("hex")}`;
}
function decryptStreamKey(enc) {
  const [ivHex, tagHex, dataHex] = String(enc).split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", streamKeyCipher(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}
function maskEmail(email) {
  const e = String(email || "");
  const at = e.indexOf("@");
  if (at <= 0) return "***";
  return e.slice(0, 2) + "***" + e.slice(at);
}
function validEmail(email) {
  return typeof email === "string" && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email.trim()) && email.trim().length <= 254;
}

// --- Login brute-force protection ------------------------------------
// In-memory: 5 failed logins for one username+IP in 15 minutes locks
// that login out for 15 minutes (429, clear message). Success clears
// it. No permanent lockout — a locked-out member waits, an admin can
// also reset the password (owner-approved). Counts are per
// username+IP so one person's failures never lock out everyone.
const loginFailures = new Map(); // key -> { count, firstAt, lockedUntil }
function loginRateKey(req, username) {
  const ip = req.ip || (req.headers["x-forwarded-for"] || "").split(",")[0] || "unknown";
  return `${ip}|${String(username || "").toLowerCase()}`;
}
function loginLocked(req, username) {
  const rec = loginFailures.get(loginRateKey(req, username));
  if (!rec) return null;
  if (rec.lockedUntil && Date.now() < rec.lockedUntil) return rec.lockedUntil;
  if (Date.now() - rec.firstAt > 15 * 60 * 1000) { loginFailures.delete(loginRateKey(req, username)); return null; }
  return null;
}
function recordLoginFailure(req, username) {
  const key = loginRateKey(req, username);
  const now = Date.now();
  const rec = loginFailures.get(key);
  if (!rec || now - rec.firstAt > 15 * 60 * 1000) {
    loginFailures.set(key, { count: 1, firstAt: now, lockedUntil: 0 });
    return;
  }
  rec.count += 1;
  if (rec.count >= 5) rec.lockedUntil = now + 15 * 60 * 1000;
}
function clearLoginFailures(req, username) {
  loginFailures.delete(loginRateKey(req, username));
}

// One-time verified seed (idempotent, runs on DB connect): the owner
// (exact username Dolo45) and accounts that are already admins are
// verified — they are known, trusted accounts, not self-verified
// strangers. The banned lowercase "dolo45" is a separate account and
// is never touched (sameUsername check excludes every case/whitespace
// variant of the owner name). New members earn the badge only by
// confirming their email.
let verifiedSeedRan = false;
async function ensureVerifiedSeed() {
  if (verifiedSeedRan) return;
  verifiedSeedRan = true;
  try {
    if (ADMIN_USERNAME) {
      await User.updateOne(
        { username: ADMIN_USERNAME, banned: { $ne: true } },
        { $set: { verified: true, verificationStatus: "approved" } }
      );
    }
    await User.updateMany(
      { role: "admin", banned: { $ne: true }, verified: { $ne: true } },
      { $set: { verified: true, verificationStatus: "approved" } }
    );
  } catch (err) { /* seed must never break startup */ }
}

// Public-safe shape for a user in admin listings: never include the
// password field (hash included — it is never selected here).
function publicUser(u) {
  return {
    id: u._id,
    username: u.username,
    bio: u.bio || "",
    avatar: dolo45Avatar(u),
    role: u.role,
    banned: Boolean(u.banned),
    verified: Boolean(u.verified),
    verificationStatus: u.verificationStatus || "none",
    createdAt: u.createdAt,
    friendCount: (u.friends || []).length,
    serverCount: (u.servers || []).length,
    socialLinks: publicSocialLinks(u),
    // Online presence (admin list only): live "online now" from the
    // socket counts, plus last seen from MongoDB.
    online: typeof onlineUserIds !== "undefined" ? onlineUserIds.has(String(u._id)) : false,
    lastSeenAt: u.lastSeenAt || null
  };
}

// Admin-only shape: publicUser plus the account's email and email
// verification state, for the Admin panel. Never used in any
// public/member response — emails stay admin-only.
function adminUser(u) {
  const base = publicUser(u);
  return { ...base, email: u.email || "", emailVerified: Boolean(u.emailVerified) };
}

// --- Referral codes -------------------------------------------------
// Wesley's rule (Nov 15): members can't find each other on Tap In —
// "it ain't like they going to be able to see who on here. You going
// to have to know who on here." So every member gets one unique,
// shareable referral code, e.g. DOLO45-K7Q2: the username (letters
// and digits only, first 6) + "-" + 4 unambiguous characters
// (no 0/O, 1/I/L, so a code read off a screenshot still types in).
// The code is public by design — it is meant to be shared — and it
// is NOT a password: it never logs anyone in, it only says who
// invited a new member at signup.
const REFERRAL_SUFFIX_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function makeReferralCode(username) {
  const base = String(username || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6) || "TAPIN";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += REFERRAL_SUFFIX_ALPHABET[crypto.randomInt(0, REFERRAL_SUFFIX_ALPHABET.length)];
  }
  return `${base}-${suffix}`;
}

async function findReferrerByCode(code) {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return null;
  return User.findOne({ referralCode: { $regex: `^${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
}

// Backfill: accounts created before referral codes (every current
// member) get one on next login / first load of their referral box.
// Never touches the password, never renames anyone, never fails the
// login if the code can't be saved — the login is the priority.
async function ensureReferralCode(user) {
  if (!user) return null;
  if (user.referralCode) return user.referralCode;
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = makeReferralCode(user.username);
    try {
      const clash = await User.findOne({ referralCode: code });
      if (clash && String(clash._id) !== String(user._id)) continue;
      user.referralCode = code;
      await user.save();
      return code;
    } catch (err) {
      // A duplicate-key race with another signup: try a fresh code.
      if (err && err.code === 11000) continue;
      return null;
    }
  }
  return null;
}

// --- Uploads: files live in MongoDB GridFS (persistent) -------------
// Render's disk is ephemeral, so uploads are NOT written to the
// server filesystem. They go to GridFS in the same Atlas database, in
// bucket "uploads", with an Upload document recording who posted them.
// No paid service and no new API keys — same database Tap In already uses.
// NOTE: the Atlas free tier (M0) holds 512 MB total, so heavy video use
// will fill it; the owner can delete uploads from the Admin panel.
let uploadBucket = null;
function getUploadBucket() {
  if (!uploadBucket && mongoose.connection.db) {
    uploadBucket = new GridFSBucket(mongoose.connection.db, { bucketName: "uploads" });
  }
  return uploadBucket;
}

const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/webm",
  "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/mp4",
  "application/pdf", "text/plain", "application/zip"
];
const BLOCKED_EXTENSIONS = [
  ".exe", ".bat", ".sh", ".js", ".mjs", ".html", ".htm", ".php",
  ".py", ".rb", ".pl", ".com", ".scr", ".msi", ".apk", ".dll", ".jar"
];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_MEDIA_BYTES = 50 * 1024 * 1024; // 50 MB for video / audio
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB for other files

function kindForMime(mime) {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}
function maxBytesForKind(kind) {
  if (kind === "image" || kind === "file") return MAX_IMAGE_BYTES;
  return MAX_MEDIA_BYTES;
}

const uploadParser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEDIA_BYTES },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || "").toLowerCase();
    if (BLOCKED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      return cb(new Error("That file type is not allowed"));
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error("That file type is not allowed — photos, videos, audio (MP3/WAV), PDF, text and ZIP files only"));
    }
    cb(null, true);
  }
});

// Upload the buffer to GridFS and return the file id.
function storeInGridFS(bucket, file, owner) {
  return new Promise((resolve, reject) => {
    const stream = bucket.openUploadStream(file.originalname, {
      contentType: file.mimetype,
      metadata: {
        ownerId: String(owner._id),
        ownerUsername: owner.username,
        originalName: file.originalname
      }
    });
    stream.on("error", reject);
    stream.on("finish", () => resolve(stream.id));
    stream.end(file.buffer);
  });
}

async function deleteUploadAndFile(upload) {
  const bucket = getUploadBucket();
  if (bucket && upload.fileId) {
    try { await bucket.delete(upload.fileId); } catch (err) { /* already gone */ }
  }
  await Upload.deleteOne({ _id: upload._id });
  // Clear any references to the deleted file so posts and profile songs
  // don't point at a file that no longer exists.
  await Post.updateMany(
    { "media.uploadId": upload._id },
    { $set: { media: {} } }
  );
  await User.updateMany(
    { "profileSong.uploadId": upload._id },
    { $set: { profileSong: {} } }
  );
}

function publicUpload(u) {
  return {
    id: u._id,
    fileId: u.fileId,
    url: `/uploads/${u.fileId}`,
    username: u.username,
    userId: u.userId,
    filename: u.originalName,
    mimeType: u.mimeType,
    size: u.size,
    kind: u.kind,
    createdAt: u.createdAt
  };
}

function publicPost(p) {
  return {
    id: p._id,
    username: p.username,
    userId: p.userId,
    text: p.text,
    media: p.media && p.media.url ? {
      uploadId: p.media.uploadId,
      url: p.media.url,
      filename: p.media.filename,
      mimeType: p.media.mimeType,
      kind: p.media.kind
    } : null,
    kind: p.kind || "post",
    link: p.link || "",
    createdAt: p.createdAt
  };
}

// Routes
app.get("/", (req, res) => {
  res.send("✨ Tap-In Backend Running");
});

app.get("/health", (req, res) => {
  res.json({ ok: true, db: dbConnected ? "connected" : "disconnected", uptime: process.uptime() });
});

app.post("/auth/register", requireDb, async (req, res) => {
  try {
    // Trim the username at signup: an untrimmed name (e.g. a trailing
    // space from a phone keyboard) is invisible in the UI but then
    // never matches anything anyone types — that is how Eatmyass68's
    // account became unfindable for DMs. Reject a second account that
    // only differs by case, so "Dolo45" / "dolo45" confusion can't
    // happen again for new signups (existing accounts are untouched).
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const { password } = req.body;
    // Optional referral code from a friend's share link
    // (?ref=DOLO45-K7Q2). A code is never required — signup works
    // fine without one. A code that was typed in but belongs to
    // nobody fails here, before the account is created, with a clear
    // message so the person can fix it or sign up without it.
    const referralCode = typeof (req.body?.referralCode || req.body?.ref) === "string"
      ? String(req.body.referralCode || req.body.ref).trim()
      : "";

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password required"
      });
    }

    let referrer = null;
    if (referralCode) {
      referrer = await findReferrerByCode(referralCode);
      if (!referrer || referrer.banned) {
        return res.status(400).json({
          error: "That referral code doesn't belong to anyone — check the code, or sign up without one."
        });
      }
    }

    const existing = await usernameTaken(User, username);

    if (existing) {
      return res.status(400).json({
        error: "Username already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Optional email at signup (for verification / 2FA / reset
    // later). Stored unverified — the member still has to confirm
    // it by code before the checkmark or any reset works.
    let signupEmail = "";
    if (typeof req.body?.email === "string" && req.body.email.trim()) {
      signupEmail = req.body.email.trim().toLowerCase();
      if (!validEmail(signupEmail)) return res.status(400).json({ error: "Enter a valid email address" });
      const clash = await User.findOne({ email: signupEmail });
      if (clash) return res.status(400).json({ error: "That email is already on another Tap In account" });
    }
    const user = await User.create({
      username,
      password: hashedPassword,
      email: signupEmail,
      role: isOwnerUsername(username) ? "admin" : "user",
      // Owner account (exact "Dolo45") is verified by seed, never by
      // self-service. The banned lowercase "dolo45" never matches.
      verified: isOwnerUsername(username),
      verificationStatus: isOwnerUsername(username) ? "approved" : "none",
      referredBy: referrer ? referrer.username : ""
    });

    // Every account gets its own referral code at signup (so the new
    // member can invite the next person right away).
    let myCode = null;
    try { myCode = await ensureReferralCode(user); } catch (err) { /* signup already succeeded */ }

    // Referred signup: the new member and the referrer become friends
    // automatically, both ways — the same mutual add the auto-friend
    // helper uses, so no Accept/Decline tap is needed. Stale pending
    // requests between them are cleared. The referrer gets an Alert
    // that someone joined with their code.
    if (referrer) {
      try {
        const freshReferrer = await User.findById(referrer._id);
        if (freshReferrer && !freshReferrer.banned) {
          removeFriendRequest(freshReferrer, user.username);
          removeFriendRequest(user, freshReferrer.username);
          addFriendBothWays(freshReferrer, user);
          await freshReferrer.save();
          await user.save();
          await createNotification(freshReferrer._id, {
            type: "member_joined",
            title: "Someone joined with your referral code",
            body: `${username} signed up with your referral code — you're friends now.`,
            fromUsername: username,
            refId: username
          });
        }
      } catch (err) { /* referral friending must never break signup */ }
    }

    // A new member joined: tell the owner (admins only — not every
    // member, or every signup would spam the whole app).
    try {
      const admins = await User.find({ role: "admin" }).select("_id");
      for (const admin of admins) {
        if (String(admin._id) === String(user._id)) continue;
        await createNotification(admin._id, {
          type: "member_joined",
          title: "New member joined Tap In",
          body: `${username} just joined Tap In.`,
          fromUsername: username,
          refId: username
        });
      }
    } catch (err) { /* signup already succeeded */ }

    res.json({
      success: true,
      userId: user._id,
      role: user.role,
      referralCode: myCode || user.referralCode || null,
      referredBy: user.referredBy || ""
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

app.post("/auth/login", requireDb, async (req, res) => {
  try {
    const { password } = req.body;
    // Trim the typed name, and fall back to the tolerant lookup so a
    // member whose stored name has invisible whitespace/case drift
    // can still log in with the name they see on screen. Exact match
    // first, so "Dolo45" and the banned "dolo45" stay distinct.
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password required"
      });
    }

    // Brute-force protection: too many failed logins for this
    // username+IP locks this login out for 15 minutes (429).
    const lockedUntil = loginLocked(req, username);
    if (lockedUntil) {
      const mins = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
      return res.status(429).json({ error: `Too many failed logins — try again in about ${mins} minute${mins === 1 ? "" : "s"}.` });
    }

    const user = (await User.findOne({ username })) || (await findUserByUsername(User, username));

    if (!user) {
      recordLoginFailure(req, username);
      return res.status(400).json({
        error: "User not found"
      });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      recordLoginFailure(req, username);
      return res.status(400).json({
        error: "Incorrect password"
      });
    }
    clearLoginFailures(req, username);

    if (user.banned) {
      return res.status(403).json({
        error: "This account has been banned"
      });
    }

    // Owner account created before ADMIN_USERNAME was set still becomes
    // admin on login when the env var matches its username exactly.
    if (isOwnerUsername(user.username) && user.role !== "admin") {
      user.role = "admin";
      await user.save();
    }
    // Owner is always verified (exact "Dolo45" only).
    if (isOwnerUsername(user.username) && !user.verified) {
      user.verified = true;
      user.verificationStatus = "approved";
      await user.save();
    }

    // --- Admin two-factor (email code) --------------------------------
    // Admins (including Dolo45) must enter a one-time code emailed to
    // the verified email on their account, AFTER the password, before
    // they get a full admin token. Non-admins log in normally.
    // If email sending is NOT configured, 2FA cannot run: the admin
    // logs in normally instead (token twoFactorVerified=false) and
    // requireAdmin lets them through — never lock the owner out over
    // a code that was never sent. The frontend shows "2FA not active
    // yet" in that case. If email IS configured but the admin has no
    // verified email yet, they get a temp token and must set + verify
    // their email first (needsEmail).
    if (user.role === "admin") {
      if (emailConfigured() && user.emailVerified && user.email) {
        const code = makeSixDigitCode();
        const sent = await sendEmail(user.email, "Tap In admin sign-in code",
          `Your Tap In admin sign-in code is ${code}. It expires in 15 minutes. If this wasn't you, change your password and tell Dolo45.`);
        if (sent.sent) {
          user.twoFactorCodeHash = hashCode(code);
          user.twoFactorCodeExpiresAt = new Date(Date.now() + CODE_TTL_MS);
          user.twoFactorCodeAttempts = 0;
          user.twoFactorCodeSentAt = new Date();
          await user.save();
          const tempToken = jwt.sign({ id: user._id, username: user.username, role: user.role, purpose: "2fa" }, jwtSecret, { expiresIn: "10m" });
          return res.json({ success: false, twoFactorRequired: true, emailConfigured: true, maskedEmail: maskEmail(user.email), tempToken });
        }
        console.warn("Admin 2FA code could not be sent — email send failed; admin login continues without 2FA this time.");
      } else if (emailConfigured()) {
        const tempToken = jwt.sign({ id: user._id, username: user.username, role: user.role, purpose: "2fa" }, jwtSecret, { expiresIn: "10m" });
        return res.json({ success: false, twoFactorRequired: true, needsEmail: true, emailConfigured: true, tempToken });
      }
    }

    // Backfill: accounts created before referral codes get theirs
    // on login, so every existing member has a code to share.
    let myCode = user.referralCode || null;
    try { myCode = (await ensureReferralCode(user)) || myCode; } catch (err) { /* login already succeeded */ }

    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
        role: user.role,
        purpose: "full",
        tokenVersion: user.tokenVersion || 0,
        twoFactorVerified: user.role !== "admin" || !emailConfigured()
      },
      jwtSecret,
      {
        expiresIn: "30d"
      }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        bio: user.bio,
        avatar: user.avatar,
        referralCode: myCode,
        referredBy: user.referredBy || "",
        profileSong: user.profileSong && user.profileSong.url ? user.profileSong : null,
        role: user.role,
        banned: Boolean(user.banned),
        verified: Boolean(user.verified),
        emailConfigured: emailConfigured(),
        twoFactorPending: user.role === "admin" && !emailConfigured()
      }
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// --- Google sign-in (Wesley, 20 Nov 2026) ----------------------------
// GET /auth/google/config — public: tells the login/signup screens
// whether Google sign-in is configured, so the button can render (or
// explain it isn't set up yet) without a rebuild. The Client ID is
// public by design (Google requires it in the page); the client
// SECRET is never used or stored — there is none in this flow.
app.get("/auth/google/config", (req, res) => {
  res.json({ configured: Boolean(GOOGLE_CLIENT_ID), clientId: GOOGLE_CLIENT_ID || null });
});

// POST /auth/google — sign in (or sign up) with a Google ID token.
// Body: { credential: "<Google ID token JWT>", referralCode?: "<code>" }.
// The token is verified with google-auth-library against
// GOOGLE_CLIENT_ID (audience + expiry checked by the library). Only
// the VERIFIED email/subject from Google's payload are ever used — a
// client-sent email is never trusted. The Google ID token itself is
// never stored. Fails closed with 503 when no Client ID is set.
// Linking is by verified email: an existing account with that email
// is logged in as that account (so Dolo45 signing in with
// Robinsonwesley206@gmail.com stays exactly Dolo45, admin intact).
// Otherwise a new account is created with a unique username derived
// from the Google name, email verified by Google (skips the 6-digit
// email-code step), the referral code honoured if one was supplied,
// and the normal new-member defaults. Banned accounts can never log
// in this way, and a Google signup can never create an admin or the
// owner username.
app.post("/auth/google", async (req, res) => {
  try {
    const client = getGoogleClient();
    if (!client) {
      return res.status(503).json({ error: "Google sign-in is not set up yet — Dolo45 needs to add the Google client ID on the backend first. You can still log in with your password." });
    }
    const credential = typeof req.body?.credential === "string" ? req.body.credential : "";
    if (!credential) return res.status(400).json({ error: "Google sign-in didn't return a credential — try again." });

    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch (err) {
      return res.status(401).json({ error: "That Google sign-in couldn't be verified — try again." });
    }
    if (!payload || !payload.email || !payload.email_verified || !payload.sub) {
      return res.status(401).json({ error: "Google didn't confirm a verified email for this account — try another Google account." });
    }
    const googleEmail = String(payload.email).toLowerCase();
    const googleSub = String(payload.sub);

    if (!dbConnected) {
      return res.status(503).json({ error: "Tap In's database is still being connected — logins and sign-ups will work once it is up. Please try again soon." });
    }

    // Link by Google subject first, then by verified email.
    let user = await User.findOne({ googleId: googleSub });
    if (!user) user = await User.findOne({ email: googleEmail });
    if (user && user.banned) {
      return res.status(403).json({ error: "This account has been banned" });
    }

    if (user) {
      // Existing account: link the Google subject (so next time the
      // subject lookup hits first) and mark the email verified —
      // Google already proved they own it.
      let changed = false;
      if (user.googleId !== googleSub) { user.googleId = googleSub; changed = true; }
      if (!user.emailVerified || !user.verified) {
        user.emailVerified = true;
        user.verified = true;
        if (user.verificationStatus === "none") user.verificationStatus = "approved";
        changed = true;
      }
      if (changed) await user.save();
    } else {
      // New account: derive a unique username from the Google name
      // (or the email's local part). Never "Dolo45" in any case —
      // that name (and the admin role) can only come from the
      // existing owner account, never from a Google signup.
      const referralCode = typeof (req.body?.referralCode || req.body?.ref) === "string"
        ? String(req.body.referralCode || req.body.ref).trim()
        : "";
      let referrer = null;
      if (referralCode) {
        referrer = await findReferrerByCode(referralCode);
        if (!referrer || referrer.banned) {
          return res.status(400).json({ error: "That referral code doesn't belong to anyone — check the code, or sign up without one." });
        }
      }
      const base = String(payload.name || googleEmail.split("@")[0] || "member")
        .replace(/[^A-Za-z0-9_]/g, "")
        .slice(0, 20) || "member";
      let username = base;
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = attempt === 0 ? base : `${base}${attempt + 1}`;
        if (sameUsername(candidate, ADMIN_USERNAME || "Dolo45")) continue;
        if (!(await usernameTaken(User, candidate))) { username = candidate; break; }
        username = candidate;
      }
      if (await usernameTaken(User, username) || sameUsername(username, ADMIN_USERNAME || "Dolo45")) {
        return res.status(500).json({ error: "Couldn't pick a username for this Google account — try signing up with a username and password instead." });
      }
      // A password is required by the schema but a Google-only
      // account never uses it: store a random hash nobody knows.
      // The member can set a real password later via forgot-password
      // (their email is verified, so the reset flow works).
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      user = await User.create({
        username,
        password: hashedPassword,
        email: googleEmail,
        googleId: googleSub,
        role: "user",
        emailVerified: true,
        verified: true,
        verificationStatus: "approved",
        referredBy: referrer ? referrer.username : ""
      });
      let myCode = null;
      try { myCode = await ensureReferralCode(user); } catch (err) { /* signup already succeeded */ }
      if (referrer) {
        try {
          const freshReferrer = await User.findById(referrer._id);
          if (freshReferrer && !freshReferrer.banned) {
            removeFriendRequest(freshReferrer, user.username);
            removeFriendRequest(user, freshReferrer.username);
            addFriendBothWays(freshReferrer, user);
            await freshReferrer.save();
            await user.save();
            await createNotification(freshReferrer._id, {
              type: "member_joined",
              title: "Someone joined with your referral code",
              body: `${username} signed up with your referral code — you're friends now.`,
              fromUsername: username,
              refId: username
            });
          }
        } catch (err) { /* referral friending must never break signup */ }
      }
      try {
        const admins = await User.find({ role: "admin" }).select("_id");
        for (const admin of admins) {
          if (String(admin._id) === String(user._id)) continue;
          await createNotification(admin._id, {
            type: "member_joined",
            title: "New member joined Tap In",
            body: `${username} just joined Tap In.`,
            fromUsername: username,
            refId: username
          });
        }
      } catch (err) { /* signup already succeeded */ }
    }

    // Owner account created before ADMIN_USERNAME was set still
    // becomes admin on login when the env var matches exactly.
    if (isOwnerUsername(user.username) && user.role !== "admin") {
      user.role = "admin";
      await user.save();
    }
    if (isOwnerUsername(user.username) && !user.verified) {
      user.verified = true;
      user.verificationStatus = "approved";
      await user.save();
    }

    // Admin two-factor (same rule as password login): admins must
    // enter a one-time code emailed to their verified email AFTER
    // signing in, before they get a full token. If email sending is
    // NOT configured, 2FA cannot run — the admin logs in normally
    // (twoFactorVerified=false) and the frontend shows "2FA not
    // active yet". Google's own verification is the sign-in here;
    // the emailed code is the second factor, exactly as with a
    // password login.
    if (user.role === "admin") {
      if (emailConfigured() && user.emailVerified && user.email) {
        const code = makeSixDigitCode();
        const sent = await sendEmail(user.email, "Tap In admin sign-in code",
          `Your Tap In admin sign-in code is ${code}. It expires in 15 minutes. If this wasn't you, change your password and tell Dolo45.`);
        if (sent.sent) {
          user.twoFactorCodeHash = hashCode(code);
          user.twoFactorCodeExpiresAt = new Date(Date.now() + CODE_TTL_MS);
          user.twoFactorCodeAttempts = 0;
          user.twoFactorCodeSentAt = new Date();
          await user.save();
          const tempToken = jwt.sign({ id: user._id, username: user.username, role: user.role, purpose: "2fa" }, jwtSecret, { expiresIn: "10m" });
          return res.json({ success: false, twoFactorRequired: true, emailConfigured: true, maskedEmail: maskEmail(user.email), tempToken });
        }
        console.warn("Admin 2FA code could not be sent — email send failed; admin login continues without 2FA this time.");
      } else if (emailConfigured()) {
        const tempToken = jwt.sign({ id: user._id, username: user.username, role: user.role, purpose: "2fa" }, jwtSecret, { expiresIn: "10m" });
        return res.json({ success: false, twoFactorRequired: true, needsEmail: true, emailConfigured: true, tempToken });
      }
    }

    // Backfill: accounts created before referral codes get theirs
    // on login, so every existing member has a code to share.
    let myCode = user.referralCode || null;
    try { myCode = (await ensureReferralCode(user)) || myCode; } catch (err) { /* login already succeeded */ }

    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
        role: user.role,
        purpose: "full",
        tokenVersion: user.tokenVersion || 0,
        twoFactorVerified: user.role !== "admin" || !emailConfigured()
      },
      jwtSecret,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        bio: user.bio,
        avatar: user.avatar,
        referralCode: myCode,
        referredBy: user.referredBy || "",
        profileSong: user.profileSong && user.profileSong.url ? user.profileSong : null,
        role: user.role,
        banned: Boolean(user.banned),
        verified: Boolean(user.verified),
        emailConfigured: emailConfigured(),
        twoFactorPending: user.role === "admin" && !emailConfigured()
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/users/:id", requireDb, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ id: user._id, username: user.username, bio: user.bio, avatar: dolo45Avatar(user), verified: Boolean(user.verified), profileSong: user.profileSong && user.profileSong.url ? user.profileSong : null, friends: user.friends, servers: user.servers, socialLinks: publicSocialLinks(user) });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// PATCH /users/:id — update your own bio, avatar and profile song. An
// admin may edit any account. Only bio/avatar/profileSong are editable
// here — never username, role, or password. profileSongUploadId must be
// one of your own uploaded audio files (or null to remove the song).
// If the API is unreachable the profile page falls back to saving on
// the device and says so.
app.patch("/users/:id", requireDb, requireAuth, async (req, res) => {
  try {
    const isSelf = req.params.id === String(req.user._id);
    const isAdmin = req.user.role === "admin";
    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: "You can only edit your own profile" });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    const { bio, avatar, profileSongUploadId } = req.body || {};
    if (bio !== undefined) {
      if (typeof bio !== "string") return res.status(400).json({ error: "Bio must be text" });
      target.bio = bio.trim().slice(0, 500);
    }
    if (avatar !== undefined) {
      if (typeof avatar !== "string") return res.status(400).json({ error: "Avatar must be text" });
      target.avatar = avatar.trim().slice(0, 500);
    }
    if (profileSongUploadId !== undefined) {
      if (profileSongUploadId === null) {
        target.profileSong = {};
      } else {
        const upload = await Upload.findById(profileSongUploadId);
        if (!upload) return res.status(400).json({ error: "That song was not found — upload it first" });
        if (upload.kind !== "audio") return res.status(400).json({ error: "Your profile song must be an audio file (MP3 or WAV)" });
        if (String(upload.userId) !== String(req.user._id) && !isAdmin) {
          return res.status(403).json({ error: "Your profile song must be one of your own uploads" });
        }
        target.profileSong = {
          uploadId: upload._id,
          url: `/uploads/${upload.fileId}`,
          filename: upload.originalName,
          mimeType: upload.mimeType
        };
      }
    }
    await target.save();
    res.json({ id: target._id, username: target.username, bio: target.bio, avatar: target.avatar, verified: Boolean(target.verified), profileSong: target.profileSong && target.profileSong.url ? target.profileSong : null, friends: target.friends, servers: target.servers, socialLinks: publicSocialLinks(target) });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// POST /profile/social-links — save YOUR OWN other-platform links.
// Logged-in only, your account only (req.user). Validated by
// cleanSocialLinks: URL or handle only, never auto-filled, never
// imported. No OAuth, no follower import, no auto-posting.
app.post("/profile/social-links", requireDb, requireAuth, async (req, res) => {
  try {
    let links;
    try {
      links = cleanSocialLinks(req.body?.socialLinks || req.body || {});
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    req.user.socialLinks = links;
    await req.user.save();
    res.json({ success: true, socialLinks: publicSocialLinks(req.user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- Email verification + admin 2FA + password reset -----------------
// All three share one email path (SMTP env, see emailConfigured()).
// When email is NOT configured, every endpoint says so plainly and
// no code is issued or sent — nothing is faked, and no badge /
// login / reset can be completed on a code that never arrived.

// GET /verification/status — my own verification state (logged in).
app.get("/verification/status", requireDb, requireAuth, async (req, res) => {
  res.json({
    success: true,
    verified: Boolean(req.user.verified),
    emailVerified: Boolean(req.user.emailVerified),
    verificationStatus: req.user.verificationStatus || "none",
    email: req.user.email || "",
    emailConfigured: emailConfigured()
  });
});

// POST /verification/request — send a 6-digit code to the email on my
// account (body { email } to set/change it first). Auth (full or 2FA
// temp token). Code is stored hashed, 15-min expiry, 60s resend
// cooldown. If email is not configured: 503, no code stored.
app.post("/verification/request", requireDb, authAny, async (req, res) => {
  try {
    const user = req.user;
    let email = user.email || "";
    if (typeof req.body?.email === "string" && req.body.email.trim()) {
      email = req.body.email.trim().toLowerCase();
    }
    if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address" });
    const clash = await User.findOne({ email, _id: { $ne: user._id } });
    if (clash) return res.status(400).json({ error: "That email is already on another Tap In account" });
    if (user.emailCodeSentAt && Date.now() - new Date(user.emailCodeSentAt).getTime() < 60000) {
      return res.status(429).json({ error: "A code was just sent — wait a minute before asking again" });
    }
    if (!emailConfigured()) {
      return res.status(503).json({ error: "Email sending is not set up yet — Tap In cannot send a verification code until an email service is connected. Ask Dolo45 to set up SMTP on the backend.", emailConfigured: false });
    }
    user.email = email;
    const code = makeSixDigitCode();
    const sent = await sendEmail(email, "Tap In verification code",
      `Your Tap In verification code is ${code}. It expires in 15 minutes. Enter it in Tap In to get your verified checkmark. If this wasn't you, ignore this email.`);
    if (!sent.sent) return res.status(503).json({ error: "The verification email could not be sent — please try again later", emailConfigured: true });
    user.emailCodeHash = hashCode(code);
    user.emailCodeExpiresAt = new Date(Date.now() + CODE_TTL_MS);
    user.emailCodeAttempts = 0;
    user.emailCodeSentAt = new Date();
    user.verificationStatus = "pending";
    await user.save();
    res.json({ success: true, emailSent: true, maskedEmail: maskEmail(email) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /verification/confirm — enter the code. On success the member
// is verified (checkmark). 5 wrong tries invalidates the code.
app.post("/verification/confirm", requireDb, authAny, async (req, res) => {
  try {
    const user = req.user;
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the 6-digit code from your email" });
    if (!user.emailCodeHash || !user.emailCodeExpiresAt) {
      return res.status(400).json({ error: "No verification code was sent — request a code first" });
    }
    if (Date.now() > new Date(user.emailCodeExpiresAt).getTime()) {
      user.emailCodeHash = ""; user.emailCodeExpiresAt = null;
      await user.save();
      return res.status(400).json({ error: "That code expired — request a new one" });
    }
    if ((user.emailCodeAttempts || 0) >= CODE_MAX_ATTEMPTS) {
      user.emailCodeHash = ""; user.emailCodeExpiresAt = null;
      await user.save();
      return res.status(400).json({ error: "Too many wrong tries — request a new code" });
    }
    if (!codeMatches(code, user.emailCodeHash)) {
      user.emailCodeAttempts = (user.emailCodeAttempts || 0) + 1;
      await user.save();
      return res.status(400).json({ error: "That code is wrong — check your email and try again" });
    }
    user.emailVerified = true;
    user.verified = true;
    user.verificationStatus = "approved";
    user.emailCodeHash = ""; user.emailCodeExpiresAt = null; user.emailCodeAttempts = 0;
    await user.save();
    res.json({ success: true, verified: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/verify-2fa — finish an admin login: { tempToken, code }.
// Returns a full token with twoFactorVerified=true.
app.post("/auth/verify-2fa", requireDb, async (req, res) => {
  try {
    const { tempToken, code } = req.body || {};
    if (!tempToken || typeof code !== "string") return res.status(400).json({ error: "Enter the 6-digit code" });
    let decoded;
    try { decoded = jwt.verify(tempToken, jwtSecret); } catch (err) {
      return res.status(401).json({ error: "That sign-in session expired — log in again" });
    }
    if (decoded.purpose !== "2fa") return res.status(401).json({ error: "That token is not a two-factor session" });
    const user = await User.findById(decoded.id);
    if (!user || user.banned) return res.status(403).json({ error: "This account has been banned" });
    if (user.role !== "admin") return res.status(403).json({ error: "Two-factor is for admins only" });
    if (!user.twoFactorCodeHash || !user.twoFactorCodeExpiresAt) {
      return res.status(400).json({ error: "No sign-in code was sent — log in again" });
    }
    if (Date.now() > new Date(user.twoFactorCodeExpiresAt).getTime()) {
      user.twoFactorCodeHash = ""; user.twoFactorCodeExpiresAt = null;
      await user.save();
      return res.status(400).json({ error: "That code expired — log in again" });
    }
    if ((user.twoFactorCodeAttempts || 0) >= CODE_MAX_ATTEMPTS) {
      user.twoFactorCodeHash = ""; user.twoFactorCodeExpiresAt = null;
      await user.save();
      return res.status(400).json({ error: "Too many wrong tries — log in again" });
    }
    if (!codeMatches(code, user.twoFactorCodeHash)) {
      user.twoFactorCodeAttempts = (user.twoFactorCodeAttempts || 0) + 1;
      await user.save();
      return res.status(400).json({ error: "That code is wrong — check your email and try again" });
    }
    user.twoFactorCodeHash = ""; user.twoFactorCodeExpiresAt = null; user.twoFactorCodeAttempts = 0;
    await user.save();
    const token = jwt.sign({ id: user._id, username: user.username, role: user.role, purpose: "full", tokenVersion: user.tokenVersion || 0, twoFactorVerified: true }, jwtSecret, { expiresIn: "30d" });
    res.json({ success: true, token, user: { id: user._id, username: user.username, role: user.role, verified: Boolean(user.verified), emailConfigured: emailConfigured() } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/2fa/setup-email — admin with a temp token but no verified
// email: set the email and send the VERIFICATION code to it. The
// admin then confirms it via /verification/confirm (temp token
// works there), and logs in again for the 2FA code.
app.post("/auth/2fa/setup-email", requireDb, authAny, async (req, res) => {
  try {
    if (req.tokenPurpose !== "2fa") return res.status(400).json({ error: "Use this during an admin sign-in" });
    const user = req.user;
    if (user.role !== "admin") return res.status(403).json({ error: "Two-factor setup is for admins only" });
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address" });
    const clash = await User.findOne({ email, _id: { $ne: user._id } });
    if (clash) return res.status(400).json({ error: "That email is already on another Tap In account" });
    if (!emailConfigured()) {
      return res.status(503).json({ error: "Email sending is not set up yet — Tap In cannot send a verification code until an email service is connected.", emailConfigured: false });
    }
    user.email = email;
    const code = makeSixDigitCode();
    const sent = await sendEmail(email, "Tap In verification code",
      `Your Tap In verification code is ${code}. It expires in 15 minutes. Enter it in Tap In to verify your email. If this wasn't you, ignore this email.`);
    if (!sent.sent) return res.status(503).json({ error: "The verification email could not be sent — please try again later", emailConfigured: true });
    user.emailCodeHash = hashCode(code);
    user.emailCodeExpiresAt = new Date(Date.now() + CODE_TTL_MS);
    user.emailCodeAttempts = 0;
    user.emailCodeSentAt = new Date();
    user.verificationStatus = "pending";
    await user.save();
    res.json({ success: true, emailSent: true, maskedEmail: maskEmail(email) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Password reset (owner-approved) ----------------------------------
// Wesley's rule (Nov 16): NO reset code goes out until Dolo45
// approves the request in the Admin panel. Flow: member asks by
// email -> Dolo45 sees it in Admin -> approve (code emailed) or deny
// (no code, member told it was not approved) -> member resets with
// the code -> confirmation notification. The response to a request
// NEVER reveals whether an account exists for that email, and a
// banned account can never reset.
// GET /auth/me — who this token belongs to. Lets the app recover
// the logged-in username/role from a token alone (older sessions
// stored a token but no username in localStorage, so the shell kept
// showing Log in / Sign up while logged in). Auth only, own account.
app.get("/auth/me", requireDb, requireAuth, async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      username: req.user.username,
      role: req.user.role,
      verified: Boolean(req.user.verified),
      emailVerified: Boolean(req.user.emailVerified)
    }
  });
});

const RESET_RESPONSE = "If an account uses that email, Dolo45 will review the reset request. If it is approved, a code will be emailed to that address.";
app.post("/auth/forgot-password", requireDb, async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (validEmail(email)) {
      const user = await User.findOne({ email });
      if (user && !user.banned) {
        user.passwordResetRequest = { status: "pending", requestedAt: new Date(), decidedAt: null, decidedBy: "" };
        user.passwordResetCodeHash = ""; user.passwordResetExpiresAt = null; user.passwordResetAttempts = 0;
        await user.save();
        try {
          const admins = await User.find({ role: "admin", banned: { $ne: true } }).select("_id");
          for (const admin of admins) {
            await createNotification(admin._id, {
              type: "password_reset_request",
              title: "Password reset request — needs your approval",
              body: `${user.username} asked to reset their password (${maskEmail(email)}). Approve or deny it in the Admin panel — no code is sent until you approve.`,
              fromUsername: user.username,
              refId: user.username
            });
          }
        } catch (err) { /* request is saved; notification is a bonus */ }
      }
    }
    res.json({ success: true, message: RESET_RESPONSE });
  } catch (err) {
    res.json({ success: true, message: RESET_RESPONSE });
  }
});

// POST /auth/reset-password — { email, code, newPassword }. Only
// works after owner approval AND a valid emailed code. One-time use:
// the code is cleared on success, and tokenVersion is bumped so
// every old token stops working.
app.post("/auth/reset-password", requireDb, async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const generic = "That reset code is wrong, expired, or not approved — ask for a new reset and wait for Dolo45 to approve it.";
    if (!validEmail(email) || !/^\d{6}$/.test(code) || newPassword.length < 6) {
      return res.status(400).json({ error: newPassword.length < 6 ? "New password must be at least 6 characters" : generic });
    }
    const user = await User.findOne({ email });
    if (!user || user.banned) return res.status(400).json({ error: generic });
    if (!user.passwordResetRequest || user.passwordResetRequest.status !== "approved") {
      return res.status(400).json({ error: generic });
    }
    if (!user.passwordResetCodeHash || !user.passwordResetExpiresAt || Date.now() > new Date(user.passwordResetExpiresAt).getTime()) {
      return res.status(400).json({ error: generic });
    }
    if ((user.passwordResetAttempts || 0) >= CODE_MAX_ATTEMPTS) return res.status(400).json({ error: generic });
    if (!codeMatches(code, user.passwordResetCodeHash)) {
      user.passwordResetAttempts = (user.passwordResetAttempts || 0) + 1;
      await user.save();
      return res.status(400).json({ error: generic });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.passwordResetCodeHash = ""; user.passwordResetExpiresAt = null; user.passwordResetAttempts = 0;
    user.passwordResetRequest = { status: "none", requestedAt: null, decidedAt: null, decidedBy: "" };
    user.twoFactorCodeHash = ""; user.twoFactorCodeExpiresAt = null;
    await user.save();
    await createNotification(user._id, {
      type: "password_changed",
      title: "Your Tap In password was changed",
      body: "Your password was just changed. If this wasn't you, tell Dolo45 right away.",
      fromUsername: "Tap In",
      refId: ""
    });
    res.json({ success: true, message: "Password changed — log in with your new password." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Multistream destinations ---------------------------------------
// A streamer saves their OWN RTMP ingest URL + stream key per
// platform, to broadcast OUT of Tap In. Only the owner of the
// account can read/write their own list; the API never returns a
// key (only platform, URL, enabled, and last-4 for identification).
// Tap In does NOT restream by itself — its video rooms are WebRTC.
// To actually go live elsewhere, the streamer copies these into
// OBS multistream (or Restream) and starts streaming there, while
// also going live in Tap In. See STREAMING.md. What DOES auto-happen
// when the OWNER (exact Dolo45) goes live — see announceOwnerGoLive
// below — is the in-app part: a Feed post + a DM to every member +
// the "just went live" alerts. The video push-out to YouTube /
// Facebook / Twitch / TikTok / Instagram still needs OBS pointed at
// one of these destinations (Restream is the one-key way) — Tap In
// cannot push RTMP, and it never pretends to.
const STREAM_PLATFORMS = {
  youtube: "rtmp://a.rtmp.youtube.com/live2",
  facebook: "rtmps://live-upload.facebook.com:443/rtmp/",
  twitch: "rtmp://live.twitch.tv/app",
  tiktok: "",
  instagram: "rtmps://live-upload.instagram.com:443/rtmp/",
  // Restream.io: ONE ingest URL + key in OBS, Restream pushes it out
  // to every platform Wesley connected there (YouTube, Facebook,
  // Twitch, TikTok, Instagram). This is the honest one-key path for
  // auto-broadcast — Tap In itself cannot push RTMP (WebRTC only).
  restream: "rtmp://live.restream.io/live"
};
function publicDestination(d) {
  return { platform: d.platform, rtmpUrl: d.rtmpUrl || "", enabled: Boolean(d.enabled), hasKey: Boolean(d.keyEnc), keyLast4: d.keyLast4 || "", updatedAt: d.updatedAt || null };
}
app.get("/stream/destinations", requireDb, requireAuth, async (req, res) => {
  res.json({ success: true, destinations: (req.user.streamDestinations || []).map(publicDestination) });
});

// GET /stream/broadcast-status — MY live broadcast, if I am live:
// room, startedAt, my enabled destinations (platform names only,
// never keys), and what the auto-broadcast did (Feed post + DMs).
// Only my own broadcast is ever returned; nobody else's destinations
// are exposed here.
app.get("/stream/broadcast-status", requireDb, requireAuth, async (req, res) => {
  const mine = [...liveBroadcasts.values()].find((b) => String(b.userId) === String(req.user._id));
  if (!mine) return res.json({ success: true, live: false });
  const destinations = (req.user.streamDestinations || [])
    .filter((d) => d.enabled && d.keyEnc)
    .map((d) => d.platform);
  res.json({
    success: true,
    live: true,
    room: mine.room,
    startedAt: mine.startedAt,
    destinations,
    autoBroadcast: mine.autoBroadcast || null
  });
});
app.post("/stream/destinations", requireDb, requireAuth, async (req, res) => {
  try {
    const platform = typeof req.body?.platform === "string" ? req.body.platform.trim().toLowerCase() : "";
    const rtmpUrl = typeof req.body?.rtmpUrl === "string" ? req.body.rtmpUrl.trim().slice(0, 300) : "";
    const streamKey = typeof req.body?.streamKey === "string" ? req.body.streamKey.trim() : "";
    const enabled = req.body?.enabled === true;
    if (!Object.keys(STREAM_PLATFORMS).includes(platform)) {
      return res.status(400).json({ error: "Platform must be youtube, facebook, twitch, tiktok, instagram or restream" });
    }
    if (rtmpUrl && !/^rtmps?:\/\/[^\s]+$/.test(rtmpUrl)) {
      return res.status(400).json({ error: "Stream URL must start with rtmp:// or rtmps://" });
    }
    if (streamKey && (streamKey.length < 4 || streamKey.length > 200)) {
      return res.status(400).json({ error: "Stream key looks wrong — paste the full key from that platform" });
    }
    const list = req.user.streamDestinations || [];
    let dest = list.find((d) => d.platform === platform);
    if (!dest) { dest = { platform, rtmpUrl: "", keyEnc: "", keyLast4: "", enabled: false, updatedAt: new Date() }; list.push(dest); }
    if (rtmpUrl) dest.rtmpUrl = rtmpUrl;
    else if (!dest.rtmpUrl) dest.rtmpUrl = STREAM_PLATFORMS[platform] || "";
    if (streamKey) { dest.keyEnc = encryptStreamKey(streamKey); dest.keyLast4 = streamKey.slice(-4); }
    dest.enabled = enabled;
    dest.updatedAt = new Date();
    req.user.streamDestinations = list;
    await req.user.save();
    res.json({ success: true, destinations: list.map(publicDestination) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/stream/destinations/:platform", requireDb, requireAuth, async (req, res) => {
  try {
    const platform = String(req.params.platform || "").toLowerCase();
    req.user.streamDestinations = (req.user.streamDestinations || []).filter((d) => d.platform !== platform);
    await req.user.save();
    res.json({ success: true, destinations: req.user.streamDestinations.map(publicDestination) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Feed posts (real user posts only — no sample posts) ---------------


// GET /posts — public read, newest first. ?kind=welcome-share returns
// only the welcome-share posts (the global Welcome feed on the landing
// page reads this).
app.get("/posts", requireDb, async (req, res) => {
  try {
    const filter = req.query?.kind === "welcome-share" ? { kind: "welcome-share" } : {};
    const posts = await Post.find(filter).sort({ createdAt: -1 }).limit(100);
    const names = [...new Set(posts.map((p) => p.username))];
    const users = await User.find({ username: { $in: names } }).select("username verified");
    const verifiedByName = new Map(users.map((u) => [u.username, Boolean(u.verified)]));
    res.json({ posts: posts.map((p) => ({ ...publicPost(p), verified: verifiedByName.get(p.username) || false })) });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// POST /posts — logged-in users only. Body: { "text": "...", "mediaUploadId": "<Upload id>" }.
// Text or an attachment is required; posts are 500 characters or fewer.
// mediaUploadId must be an upload the poster owns.
app.post("/posts", requireDb, requireAuth, async (req, res) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (text.length > 500) {
      return res.status(400).json({ error: "Post must be 500 characters or fewer" });
    }
    let media = null;
    if (req.body?.mediaUploadId) {
      const upload = await Upload.findById(req.body.mediaUploadId);
      if (!upload) return res.status(400).json({ error: "Attached file not found — upload it first" });
      if (String(upload.userId) !== String(req.user._id)) {
        return res.status(403).json({ error: "You can only attach your own uploads" });
      }
      media = {
        uploadId: upload._id,
        url: `/uploads/${upload.fileId}`,
        filename: upload.originalName,
        mimeType: upload.mimeType,
        kind: upload.kind
      };
    }
    if (!text && !media) return res.status(400).json({ error: "Write something or attach a photo, video or file" });
    const post = await Post.create({
      userId: req.user._id,
      username: req.user.username,
      text,
      media: media || undefined
    });
    res.json({ success: true, post: publicPost(post) });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// DELETE /posts/:id — the poster, or an admin, can remove a post.
// An attached upload file is removed with it.
app.delete("/posts/:id", requireDb, requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });
    const isOwner = String(post.userId) === String(req.user._id);
    if (!isOwner && req.user.role !== "admin") {
      return res.status(403).json({ error: "You can only delete your own posts" });
    }
    if (post.media?.uploadId) {
      const upload = await Upload.findById(post.media.uploadId);
      if (upload) await deleteUploadAndFile(upload);
    }
    await Post.deleteOne({ _id: post._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Welcome-share posts (Wesley, 19 Nov 2026) -----------------------
// When a member shares Tap In, the app calls this once per completed
// share and the member gets ONE "Welcome to Tap In" post, which shows
// in the global Welcome feed on the landing page (GET /posts?kind=
// welcome-share) and in the in-app Feed like any other post. Dedupe:
// the first share creates it; later shares return the existing post
// and create nothing, so the feed never gets spammed with duplicates.
// Only completed shares call this — a cancelled native share sheet or
// a failed copy never reaches it. The link must be a Tap In URL (the
// member's referral link or the plain app link); anything else is
// rejected. A member can delete their own welcome-share post like any
// post (DELETE /posts/:id); sharing again after that creates a fresh
// one. This is in-app Feed/profile only — it never posts anywhere
// outside Tap In. Feed posts are not run through the chat safety
// monitor (same as every other Feed post, including Go Live posts);
// the monitor stays alert-only for chats, flags to Dolo45 only.
app.post("/share/welcome", requireDb, requireAuth, async (req, res) => {
  try {
    const link = typeof req.body?.link === "string" ? req.body.link.trim() : "";
    const TAP_IN_ORIGIN = "https://tap-in-cakt.onrender.com";
    if (!link.startsWith(TAP_IN_ORIGIN)) {
      return res.status(400).json({ error: "Link must be a Tap In link" });
    }
    if (link.length > 200) {
      return res.status(400).json({ error: "Link is too long" });
    }
    const existing = await Post.findOne({ userId: req.user._id, kind: "welcome-share" });
    if (existing) {
      return res.json({ success: true, created: false, post: publicPost(existing) });
    }
    const text = `${req.user.username} shared Tap In — Welcome to Tap In! Join here: ${link}`;
    const post = await Post.create({
      userId: req.user._id,
      username: req.user.username,
      text,
      kind: "welcome-share",
      link
    });
    res.json({ success: true, created: true, post: publicPost(post) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Uploads (members only — no anonymous uploads) --------------------

// POST /uploads — logged-in members only. Multipart form, field "file".
// Photos (jpg/png/gif/webp) up to 10 MB; video (mp4/webm) and audio
// (mp3/wav/ogg) up to 50 MB; PDF, text and ZIP up to 10 MB. Executables
// and scripts are rejected. Files go to GridFS (persistent); the
// response gives the URL the frontend renders.
app.post("/uploads", requireDb, requireAuth, (req, res) => {
  uploadParser.single("file")(req, res, async (err) => {
    if (err) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({ error: err.message || "Upload failed" });
    }
    try {
      if (!req.file) return res.status(400).json({ error: "Choose a file to upload" });
      const kind = kindForMime(req.file.mimetype);
      const maxBytes = maxBytesForKind(kind);
      if (req.file.size > maxBytes) {
        return res.status(413).json({
          error: `${kind === "image" ? "Photos" : kind === "file" ? "Files" : "Video and audio"} must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller`
        });
      }
      const bucket = getUploadBucket();
      if (!bucket) return res.status(503).json({ error: "File storage is not ready yet — try again in a moment" });
      const fileId = await storeInGridFS(bucket, req.file, req.user);
      const upload = await Upload.create({
        userId: req.user._id,
        username: req.user.username,
        fileId,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        kind
      });
      res.json({ success: true, upload: publicUpload(upload) });
    } catch (uploadErr) {
      res.status(500).json({ error: uploadErr.message });
    }
  });
});

// GET /uploads/mine — the logged-in member's own uploads, newest
// first. Used by the profile-song picker (and anywhere a member picks
// one of their own files).
app.get("/uploads/mine", requireDb, requireAuth, async (req, res) => {
  try {
    const uploads = await Upload.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, uploads: uploads.map(publicUpload) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /uploads/:fileId — stream a stored file back (image, video, audio
// or download). No login needed to render it inside the app — the id is
// an unguessable GridFS ObjectId and the feed itself is members-only.
// Content-Disposition is inline so photos/video/audio play in the page.
app.get("/uploads/:fileId", requireDb, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.fileId)) {
      return res.status(404).json({ error: "File not found" });
    }
    const bucket = getUploadBucket();
    if (!bucket) return res.status(503).json({ error: "File storage is not ready yet" });
    const fileId = new ObjectId(req.params.fileId);
    const files = await bucket.find({ _id: fileId }).toArray();
    if (!files.length) return res.status(404).json({ error: "File not found" });
    const file = files[0];
    res.set("Content-Type", file.contentType || "application/octet-stream");
    res.set("Content-Length", file.length);
    res.set("Content-Disposition", `inline; filename="${encodeURIComponent(file.filename || "file")}"`);
    res.set("Cache-Control", "public, max-age=86400");
    bucket.openDownloadStream(fileId).on("error", () => {
      if (!res.headersSent) res.status(404).json({ error: "File not found" });
      else res.end();
    }).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /uploads/:id — the uploader, or an admin, can remove a file.
app.delete("/uploads/:id", requireDb, requireAuth, async (req, res) => {
  try {
    const upload = await Upload.findById(req.params.id);
    if (!upload) return res.status(404).json({ error: "Upload not found" });
    const isOwner = String(upload.userId) === String(req.user._id);
    if (!isOwner && req.user.role !== "admin") {
      return res.status(403).json({ error: "You can only delete your own uploads" });
    }
    await deleteUploadAndFile(upload);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/uploads — admin only: every upload, newest first, with who
// posted it, so the owner can moderate files on his own app.
app.get("/admin/uploads", requireDb, requireAuth, requireAdmin, async (req, res) => {
  try {
    const uploads = await Upload.find({}).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, uploads: uploads.map(publicUpload) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Private chats: 1-to-1 DMs and private groups -------------------
// Rooms and messages live in MongoDB (ChatRoom / ChatMessage /
// ChatFlag) — never in memory, never on Render's disk — so a Render
// restart or spin-down never loses anyone's chats. Every route and
// every socket event checks membership first: only members can see,
// join, read or send in a room, and ONLY the owner (exact Dolo45)
// can review rooms for safety — never other admins, never other
// members. The global chat is untouched by all of this.

function publicChatRoom(room, viewerId) {
  const members = (room.memberUsernames || []).slice();
  // DM display name: both members' usernames — the frontend shows the
  // other person's name (it knows who "me" is).
  const displayName = room.type === "group"
    ? (room.name || "Group chat")
    : (members.join(" & ") || "Private chat");
  return {
    id: room._id,
    type: room.type,
    name: room.name || "",
    displayName,
    members,
    memberIds: (room.members || []).map(String),
    createdBy: room.createdBy ? String(room.createdBy) : null,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt
  };
}

function publicChatMessage(m) {
  return {
    id: m._id,
    room: String(m.room),
    senderId: String(m.senderId),
    senderUsername: m.senderUsername,
    text: m.text,
    flagged: Boolean(m.flagged),
    flagReasons: m.flagReasons || [],
    createdAt: m.createdAt
  };
}

function isRoomMember(room, userId) {
  return (room.members || []).some((m) => String(m) === String(userId));
}

function roomDisplayName(room) {
  if (room.type === "group") return room.name || "Group chat";
  return (room.memberUsernames || []).join(" & ") || "Private chat";
}

// Save a private message, run the safety scan, and store a flag (for
// admin review only — never an auto-ban, never a block) when a
// high-risk pattern matches. Returns { message, flags }.
async function savePrivateMessage(room, sender, text) {
  const flags = scanChatMessage(text);
  const message = await ChatMessage.create({
    room: room._id,
    senderId: sender._id,
    senderUsername: sender.username,
    text,
    flagged: flags.length > 0,
    flagReasons: flags.map((f) => f.label)
  });
  if (flags.length > 0) {
    await ChatFlag.create({
      message: message._id,
      room: room._id,
      roomName: roomDisplayName(room),
      senderId: sender._id,
      senderUsername: sender.username,
      text,
      reasons: flags.map((f) => f.label)
    });
    // Alert ONLY the owner (exact Dolo45) — for his review only.
    // No other admin or member is told, and nothing is blocked,
    // filtered, or auto-banned: the message was already saved and
    // delivered above. The alert carries the sender + the reason,
    // not the message text.
    try {
      const owner = await User.findOne({ username: ADMIN_USERNAME });
      if (owner && !owner.banned) {
        await createNotification(owner._id, {
          type: "safety_flag",
          title: "Safety alert — private chat needs your review",
          body: `${sender.username}: ${flags.map((f) => f.label).join(" · ")}`,
          fromUsername: sender.username,
          refId: String(room._id)
        });
      }
    } catch (err) { /* flag is stored; the alert is a bonus */ }
  }
  // Notify every other member of the room about the new message, so
  // it shows up in their bell even when they aren't looking at chat.
  for (const memberId of room.members || []) {
    if (String(memberId) === String(sender._id)) continue;
    await createNotification(memberId, {
      type: "message",
      title: roomDisplayName(room),
      body: `${sender.username}: ${text.slice(0, 120)}`,
      fromUsername: sender.username,
      refId: String(room._id)
    });
  }
  room.updatedAt = new Date();
  await room.save();
  return { message, flags };
}

async function loadRoomOr404(req, res) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(404).json({ error: "Chat not found" });
    return null;
  }
  const room = await ChatRoom.findById(req.params.id);
  if (!room) {
    res.status(404).json({ error: "Chat not found" });
    return null;
  }
  return room;
}

// --- Referral codes + member discovery -----------------------------
// The find problem (Wesley, Nov 15): a member could only find
// someone if they already knew the exact username — there was no
// place to see who is on Tap In. Two fixes, both members-only:
//   1. referral codes — your own code + share link, and signing up
//      from a friend's link friends you with them automatically;
//   2. a searchable member directory — every member, online dot,
//      last seen, bio snippet, Add Friend button.

// GET /referral/me — my own referral code + share details. Logged-in
// only. Backfills a code for accounts created before referral codes.
app.get("/referral/me", requireDb, requireAuth, async (req, res) => {
  try {
    let code = req.user.referralCode || null;
    try { code = (await ensureReferralCode(req.user)) || code; } catch (err) { /* code is a bonus */ }
    const referralCount = await User.countDocuments({ referredBy: req.user.username });
    res.json({
      success: true,
      code,
      referredBy: req.user.referredBy || "",
      referralCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /referral/:code — public lookup for a share link: does this
// code belong to anyone, and who? Returns ONLY the referrer's
// username — never an email, id, or anything else. Used by the
// landing / signup pages to show "You were invited by Dolo45".
app.get("/referral/:code", requireDb, async (req, res) => {
  try {
    const referrer = await findReferrerByCode(req.params.code);
    if (!referrer || referrer.banned) return res.json({ success: true, valid: false });
    res.json({ success: true, valid: true, username: referrer.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /members — searchable member directory. Logged-in only.
// Everyone who is on Tap In, so a member can actually find people
// instead of having to already know their exact username. Banned
// accounts (including the separate banned lowercase "dolo45") never
// appear, and neither do you — you already know yourself. Only
// username, bio snippet, avatar, role, online / last seen, and
// whether you are already friends (or have a request pending) —
// never emails, phone numbers, or passwords.
app.get("/members", requireDb, requireAuth, async (req, res) => {
  try {
    const q = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const filter = { banned: { $ne: true }, _id: { $ne: req.user._id } };
    if (q) {
      filter.username = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }
    const users = await User.find(filter)
      .select("_id username bio avatar role verified lastSeenAt friendRequests socialLinks")
      .sort({ username: 1 })
      .limit(100);
    const myFriends = req.user.friends || [];
    const myIncoming = req.user.friendRequests || [];
    res.json({
      success: true,
      members: users.map((u) => ({
        id: u._id,
        username: u.username,
        bio: (u.bio || "").slice(0, 120),
        avatar: dolo45Avatar(u),
        role: u.role,
        verified: Boolean(u.verified),
        socialLinks: publicSocialLinks(u),
        online: onlineUserIds.has(String(u._id)),
        lastSeenAt: u.lastSeenAt || null,
        isFriend: myFriends.some((f) => sameUsername(f, u.username)),
        requestSent: (u.friendRequests || []).some((r) => sameUsername(r.username, req.user.username)),
        requestIncoming: myIncoming.some((r) => sameUsername(r.username, u.username))
      })).sort((a, b) => (b.online - a.online) || a.username.localeCompare(b.username))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /users — find members by username (for starting a DM or adding
// to a group). Logged-in only; returns id + username, never passwords.
app.get("/users", requireDb, requireAuth, async (req, res) => {
  try {
    const q = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const filter = q
      ? { username: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }
      : {};
    const users = await User.find(filter).select("_id username role verified socialLinks").sort({ username: 1 }).limit(20);
    res.json({ success: true, users: users.map((u) => ({ id: u._id, username: u.username, role: u.role, verified: Boolean(u.verified), socialLinks: publicSocialLinks(u) })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /chat/presence — who's online among people you may see: your
// DM/group partners and your friends. Strangers never appear here —
// online status is only shared with people you already chat with, plus
// the admin (who sees everyone in /admin/users).
app.get("/chat/presence", requireDb, requireAuth, async (req, res) => {
  try {
    const roomsList = await ChatRoom.find({ members: req.user._id }).select("members memberUsernames");
    const ids = new Set();
    const names = new Set((req.user.friends || []).map(String));
    for (const r of roomsList) {
      for (const m of r.members || []) ids.add(String(m));
      for (const n of r.memberUsernames || []) names.add(String(n));
    }
    ids.add(String(req.user._id));
    const users = await User.find({ _id: { $in: [...ids] } }).select("_id username verified lastSeenAt");
    const byName = new Map();
    for (const u of users) byName.set(u.username, u);
    // Friend names are plain strings typed by the other person, so a
    // stored name that differs by case/whitespace would miss the
    // exact $in match — resolve each one tolerantly instead.
    const extra = [...names].filter((n) => !byName.has(n));
    const extraUsers = [];
    for (const n of extra) {
      const u = await findUserByUsername(User, n);
      if (u) extraUsers.push(u);
    }
    const all = [...users, ...extraUsers];
    res.json({
      success: true,
      presence: all.map((u) => ({
        userId: String(u._id),
        username: u.username,
        verified: Boolean(u.verified),
        online: onlineUserIds.has(String(u._id)),
        lastSeenAt: u.lastSeenAt || null
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Global chat history (Wesley, 18 Nov 2026) ---------------------
// Global chat used to be broadcast-only: nothing was saved, so every
// message vanished on reload / disconnect / Render spin-down. Now
// every global message is saved to MongoDB (GlobalChatMessage) BEFORE
// it is broadcast, same order as private chat.
//
// THE CAP — Wesley's rule, 18 Nov 2026: global chat holds the LAST
// 100 messages. After 100, the OLDEST message is deleted as new ones
// come in. That is the ONLY deletion allowed for global chat — never
// erase global chat otherwise. There is NO TTL on the model, NO
// delete endpoint for global messages, and NO other auto-trim.
// trimGlobalChat is the single place that deletes a global message,
// and it only ever deletes the oldest ones, only to bring the count
// back down to 100.
const GLOBAL_CHAT_LIMIT = 100;

function publicGlobalMessage(m) {
  return {
    id: String(m._id),
    senderId: m.senderId ? String(m.senderId) : null,
    senderUsername: m.senderUsername,
    text: m.text,
    flagged: Boolean(m.flagged),
    flagReasons: m.flagReasons || [],
    createdAt: m.createdAt
  };
}

async function trimGlobalChat() {
  const count = await GlobalChatMessage.countDocuments({});
  const excess = count - GLOBAL_CHAT_LIMIT;
  if (excess <= 0) return 0;
  // Oldest first (createdAt, then _id to break same-millisecond ties).
  const oldest = await GlobalChatMessage.find({})
    .sort({ createdAt: 1, _id: 1 })
    .limit(excess)
    .select("_id");
  if (!oldest.length) return 0;
  const res = await GlobalChatMessage.deleteMany({ _id: { $in: oldest.map((m) => m._id) } });
  return res.deletedCount || 0;
}

// GET /chat/global/messages — the last 100 global messages,
// oldest first. Logged-in members only. No delete route exists for
// these messages anywhere in the server.
app.get("/chat/global/messages", requireDb, requireAuth, async (req, res) => {
  try {
    const newestFirst = await GlobalChatMessage.find({})
      .sort({ createdAt: -1, _id: -1 })
      .limit(GLOBAL_CHAT_LIMIT);
    const messages = newestFirst.reverse().map(publicGlobalMessage);
    res.json({ success: true, messages, limit: GLOBAL_CHAT_LIMIT });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /chat/rooms — rooms the logged-in user belongs to, newest first.
// GET /chat/search?q= — search MY private chats and groups by
// username or message text. Only rooms I'm a member of are ever
// searched or returned — never anyone else's chats. Banned users
// never appear: a DM whose other member is banned is skipped, and
// messages from banned senders are never used as snippets.
app.get("/chat/search", requireDb, requireAuth, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ success: true, rooms: [] });
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(esc, "i");
    const myRooms = await ChatRoom.find({ members: req.user._id }).sort({ updatedAt: -1 }).limit(100);
    const bannedUsers = await User.find({ banned: true }).select("username");
    const bannedNames = new Set(bannedUsers.map((u) => u.username));
    const roomIds = myRooms.map((r) => r._id);
    const matchedMsgs = await ChatMessage.find({ room: { $in: roomIds }, text: re }).sort({ createdAt: -1 }).limit(100);
    const msgByRoom = new Map();
    for (const m of matchedMsgs) {
      if (bannedNames.has(m.senderUsername)) continue;
      if (!msgByRoom.has(String(m.room))) msgByRoom.set(String(m.room), m);
    }
    const out = [];
    for (const room of myRooms) {
      const others = (room.memberUsernames || []).filter((n) => n !== req.user.username);
      if (others.length && others.every((n) => bannedNames.has(n))) continue;
      const byName = others.some((n) => re.test(n)) || re.test(room.name || "");
      const byMsg = msgByRoom.get(String(room._id));
      if (!byName && !byMsg) continue;
      out.push({
        ...publicChatRoom(room, req.user._id),
        matchedBy: byName ? "username" : "message",
        snippet: byMsg ? { senderUsername: byMsg.senderUsername, text: byMsg.text.slice(0, 120), createdAt: byMsg.createdAt } : null
      });
    }
    res.json({ success: true, rooms: out.slice(0, 20) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/chat/rooms", requireDb, requireAuth, async (req, res) => {
  try {
    const roomsList = await ChatRoom.find({ members: req.user._id }).sort({ updatedAt: -1 }).limit(100);
    res.json({ success: true, rooms: roomsList.map((r) => publicChatRoom(r, req.user._id)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /chat/dm — start (or open the existing) 1-to-1 chat with a
// member, by username. One DM thread per pair (deterministic dmKey).
app.post("/chat/dm", requireDb, requireAuth, async (req, res) => {
  try {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    if (!username) return res.status(400).json({ error: "Give the username to chat with" });
    // "You can't DM yourself" even via a case/whitespace variant of
    // your own name — and the lookup itself is tolerant, so a member
    // whose stored name differs invisibly from what you type (the
    // Eatmyass68 bug) is found instead of "No member with that
    // username".
    if (sameUsername(username, req.user.username)) return res.status(400).json({ error: "You can't DM yourself" });
    const other = await findUserByUsername(User, username);
    if (!other) return res.status(404).json({ error: "No member with that username" });
    const ids = [String(req.user._id), String(other._id)].sort();
    const dmKey = ids.join("_");
    let room = await ChatRoom.findOne({ dmKey });
    if (!room) {
      room = await ChatRoom.create({
        type: "dm",
        dmKey,
        members: [req.user._id, other._id],
        memberUsernames: [req.user.username, other.username],
        createdBy: req.user._id
      });
    }
    res.json({ success: true, room: publicChatRoom(room, req.user._id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /chat/groups — create a named private group. Body:
// { "name": "My people", "members": ["username1", "username2"] }.
// The creator is always a member. Only members can see or join it.
app.post("/chat/groups", requireDb, requireAuth, async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : "";
    if (!name) return res.status(400).json({ error: "Give the group a name" });
    const wanted = Array.isArray(req.body?.members) ? req.body.members : [];
    const usernames = [...new Set(wanted.map((m) => String(m).trim()).filter(Boolean))].filter((u) => !sameUsername(u, req.user.username)).slice(0, 49);
    const found = [];
    for (const u of usernames) {
      const user = await findUserByUsername(User, u);
      if (user) found.push(user);
    }
    const foundNames = found.map((u) => u.username);
    const missing = usernames.filter((u) => !found.some((f) => sameUsername(f.username, u)));
    if (missing.length) {
      return res.status(404).json({ error: `No member with username: ${missing.join(", ")}` });
    }
    const room = await ChatRoom.create({
      type: "group",
      name,
      members: [req.user._id, ...found.map((u) => u._id)],
      memberUsernames: [req.user.username, ...foundNames],
      createdBy: req.user._id
    });
    res.json({ success: true, room: publicChatRoom(room, req.user._id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /chat/rooms/:id/messages — history for a room. Members only.
app.get("/chat/rooms/:id/messages", requireDb, requireAuth, async (req, res) => {
  try {
    const room = await loadRoomOr404(req, res);
    if (!room) return;
    if (!isRoomMember(room, req.user._id)) {
      return res.status(403).json({ error: "You are not a member of this chat" });
    }
    const messages = await ChatMessage.find({ room: room._id }).sort({ createdAt: 1 }).limit(200);
    res.json({ success: true, room: publicChatRoom(room, req.user._id), messages: messages.map(publicChatMessage) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /chat/rooms/:id/messages — send in a room. Members only.
// Text up to 1000 characters. Saved to MongoDB, safety-scanned, and
// broadcast live to the room's members over Socket.IO.
app.post("/chat/rooms/:id/messages", requireDb, requireAuth, async (req, res) => {
  try {
    const room = await loadRoomOr404(req, res);
    if (!room) return;
    if (!isRoomMember(room, req.user._id)) {
      return res.status(403).json({ error: "You are not a member of this chat" });
    }
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) return res.status(400).json({ error: "Write a message first" });
    if (text.length > 1000) return res.status(400).json({ error: "Messages must be 1000 characters or fewer" });
    const { message } = await savePrivateMessage(room, req.user, text);
    io.to(`chat:${room._id}`).emit("private-chat-message", publicChatMessage(message));
    res.json({ success: true, message: publicChatMessage(message) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /chat/rooms/:id/members — add a member to a group. Only the
// group creator or an admin can add people.
app.post("/chat/rooms/:id/members", requireDb, requireAuth, async (req, res) => {
  try {
    const room = await loadRoomOr404(req, res);
    if (!room) return;
    if (room.type !== "group") return res.status(400).json({ error: "You can only add members to a group chat" });
    const isCreator = String(room.createdBy) === String(req.user._id);
    if (!isCreator && req.user.role !== "admin") {
      return res.status(403).json({ error: "Only the group creator can add members" });
    }
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    if (!username) return res.status(400).json({ error: "Give the username to add" });
    const user = await findUserByUsername(User, username);
    if (!user) return res.status(404).json({ error: "No member with that username" });
    if (isRoomMember(room, user._id)) return res.status(400).json({ error: `${username} is already in this group` });
    room.members.push(user._id);
    room.memberUsernames.push(user.username);
    room.updatedAt = new Date();
    await room.save();
    res.json({ success: true, room: publicChatRoom(room, req.user._id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /chat/rooms/:id/members/:userId — remove a member from a
// group, or leave the group yourself. The creator or an admin can
// remove others; anyone can remove themselves. DMs can't lose members.
app.delete("/chat/rooms/:id/members/:userId", requireDb, requireAuth, async (req, res) => {
  try {
    const room = await loadRoomOr404(req, res);
    if (!room) return;
    if (room.type !== "group") return res.status(400).json({ error: "You can't leave a 1-to-1 chat — delete it from your list instead" });
    const targetId = req.params.userId;
    const isSelf = String(targetId) === String(req.user._id);
    const isCreator = String(room.createdBy) === String(req.user._id);
    if (!isSelf && !isCreator && req.user.role !== "admin") {
      return res.status(403).json({ error: "Only the group creator can remove members" });
    }
    if (!isRoomMember(room, targetId)) return res.status(404).json({ error: "That person is not in this group" });
    const idx = room.members.findIndex((m) => String(m) === String(targetId));
    room.members.splice(idx, 1);
    room.memberUsernames.splice(idx, 1);
    room.updatedAt = new Date();
    await room.save();
    res.json({ success: true, room: publicChatRoom(room, req.user._id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Safety monitor (private chats) — OWNER ONLY ----------------------
// Wesley's rule (Nov 16): private chat is PRIVATE. Only the people
// in that chat can see it. Wesley (exact Dolo45) screens it himself.
// Other admins / members can NEVER read someone else's private
// chats. The monitor ONLY alerts Dolo45 when it sees malicious
// behaviour, for his review only — no auto-action, no message
// blocking, no filtering, no auto-ban. Messages are always saved
// and delivered first (see savePrivateMessage); a flag never stops
// a message. requireOwner enforces this on every route below.

// GET /admin/chat/rooms — every private room, with member names and
// message counts, newest activity first.
app.get("/admin/chat/rooms", requireDb, requireAuth, requireAdmin, requireOwner, async (req, res) => {
  try {
    const roomsList = await ChatRoom.find({}).sort({ updatedAt: -1 }).limit(100);
    const roomsOut = [];
    for (const room of roomsList) {
      const messageCount = await ChatMessage.countDocuments({ room: room._id });
      roomsOut.push({ ...publicChatRoom(room, req.user._id), messageCount });
    }
    res.json({ success: true, rooms: roomsOut });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/chat/rooms/:id/messages — a room's full history, admin only.
app.get("/admin/chat/rooms/:id/messages", requireDb, requireAuth, requireAdmin, requireOwner, async (req, res) => {
  try {
    const room = await loadRoomOr404(req, res);
    if (!room) return;
    const messages = await ChatMessage.find({ room: room._id }).sort({ createdAt: 1 }).limit(200);
    res.json({ success: true, room: publicChatRoom(room, req.user._id), messages: messages.map(publicChatMessage) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/chat/flags — safety flags, newest first. ?reviewed=true
// or ?reviewed=false filters; unreviewed first by default.
app.get("/admin/chat/flags", requireDb, requireAuth, requireAdmin, requireOwner, async (req, res) => {
  try {
    const filter = {};
    if (req.query.reviewed === "true") filter.reviewed = true;
    if (req.query.reviewed === "false") filter.reviewed = false;
    const flags = await ChatFlag.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json({
      success: true,
      flags: flags.map((f) => ({
        id: f._id,
        message: f.message ? String(f.message) : null,
        room: f.room ? String(f.room) : null,
        roomName: f.roomName,
        senderId: f.senderId ? String(f.senderId) : null,
        senderUsername: f.senderUsername,
        text: f.text,
        reasons: f.reasons,
        reviewed: Boolean(f.reviewed),
        reviewNote: f.reviewNote || "",
        createdAt: f.createdAt
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/chat/flags/:id/review — mark a flag reviewed (admin
// only). Body: { "reviewed": true, "note": "..." }. A flag is only a
// "look at this" — reviewing it bans nobody by itself.
app.post("/admin/chat/flags/:id/review", requireDb, requireAuth, requireAdmin, requireOwner, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "Flag not found" });
    const flag = await ChatFlag.findById(req.params.id);
    if (!flag) return res.status(404).json({ error: "Flag not found" });
    if (typeof req.body?.reviewed === "boolean") flag.reviewed = req.body.reviewed;
    if (typeof req.body?.note === "string") flag.reviewNote = req.body.note.slice(0, 500);
    await flag.save();
    res.json({ success: true, flag: { id: flag._id, reviewed: flag.reviewed, reviewNote: flag.reviewNote } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Notifications ----------------------------------------------------
// Tap In had no notification system at all: no bell, no badge, no
// alert for friend requests or messages. createNotification stores
// one row per recipient in MongoDB (so it survives a restart) and
// pushes it live over Socket.IO when the recipient is online, the
// same live path as the who's-online dots.
async function createNotification(userId, data) {
  try {
    const notification = await Notification.create({
      userId,
      type: data.type,
      title: data.title || "",
      body: data.body || "",
      fromUsername: data.fromUsername || "",
      refId: data.refId || ""
    });
    // Live push to the recipient's open sockets, if any.
    try {
      const sockets = typeof userSockets !== "undefined" ? userSockets.get(String(userId)) : null;
      if (sockets) {
        for (const sid of sockets) io.to(sid).emit("notification", publicNotification(notification));
      }
    } catch (err) { /* stored notification is the source of truth */ }
    return notification;
  } catch (err) {
    // A notification must never break the action that caused it.
    return null;
  }
}

function publicNotification(n) {
  return {
    id: n._id,
    type: n.type,
    title: n.title,
    body: n.body,
    fromUsername: n.fromUsername || "",
    refId: n.refId || "",
    read: Boolean(n.read),
    createdAt: n.createdAt
  };
}

// GET /notifications — my notifications, newest first, plus the
// unread count the bell badge uses. Logged-in only.
app.get("/notifications", requireDb, requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit);
    const unreadCount = await Notification.countDocuments({ userId: req.user._id, read: false });
    res.json({
      success: true,
      unreadCount,
      notifications: notifications.map(publicNotification)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /notifications/:id/read — mark one notification read.
app.post("/notifications/:id/read", requireDb, requireAuth, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "Notification not found" });
    const notification = await Notification.findOne({ _id: req.params.id, userId: req.user._id });
    if (!notification) return res.status(404).json({ error: "Notification not found" });
    notification.read = true;
    await notification.save();
    res.json({ success: true, notification: publicNotification(notification) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /live — who is broadcasting right now (room, username, since).
app.get("/live", requireDb, requireAuth, async (req, res) => {
  res.json({
    success: true,
    live: [...liveBroadcasts.values()].map((b) => ({
      username: b.username,
      room: b.room,
      startedAt: b.startedAt
    }))
  });
});

// POST /notifications/read-all — mark all my notifications read.
app.post("/notifications/read-all", requireDb, requireAuth, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, read: false },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Friend requests -------------------------------------------------
// Before this, "Add Friend" just wrote the other person's name into
// the sender's own friends list — the other person was never told and
// never saw anything, so a request looked like it vanished. Now
// adding a friend sends a pending request to that person, stored in
// MongoDB on their account. They see it at the top of their Friends
// tab (same green-dot / last-seen treatment as online friends) with
// Accept / Decline, and only an Accept makes you friends — both
// ways, so each of you shows up in the other's list.

function hasFriendRequest(user, username) {
  // Compare tolerantly: a request stored under a case/whitespace
  // variant of the name is still the same person (Eatmyass68 bug).
  return (user.friendRequests || []).some((r) => sameUsername(r.username, username));
}

function removeFriendRequest(user, username) {
  user.friendRequests = (user.friendRequests || []).filter((r) => !sameUsername(r.username, username));
}

function addFriendBothWays(a, b) {
  if (!(a.friends || []).some((f) => sameUsername(f, b.username))) a.friends.push(b.username);
  if (!(b.friends || []).some((f) => sameUsername(f, a.username))) b.friends.push(a.username);
}

// Send a pending request to the target user. Shared by the
// authenticated endpoint and the legacy /friends/add route.
async function sendFriendRequest(sender, friendName) {
  if (!friendName) return { status: 400, error: "Give the username to add" };
  if (sameUsername(friendName, sender.username)) return { status: 400, error: "You can't add yourself as a friend" };
  if (sender.banned) return { status: 403, error: "This account has been banned" };
  const target = await findUserByUsername(User, friendName);
  if (!target) return { status: 404, error: "No member with that username" };
  if (target.banned) return { status: 400, error: "That account is not available" };
  if ((sender.friends || []).some((f) => sameUsername(f, friendName))) {
    return { status: 400, error: `${friendName} is already your friend` };
  }
  if (hasFriendRequest(target, sender.username)) {
    return { status: 200, alreadySent: true, target };
  }
  // If they already sent YOU a request, accept that one instead of
  // stacking a second request in the other direction.
  if (hasFriendRequest(sender, friendName)) {
    removeFriendRequest(sender, friendName);
    addFriendBothWays(sender, target);
    removeFriendRequest(target, sender.username);
    await sender.save();
    await target.save();
    await createNotification(target._id, {
      type: "friend_accepted",
      title: "Friend request accepted",
      body: `${sender.username} accepted your friend request — you're friends now.`,
      fromUsername: sender.username,
      refId: sender.username
    });
    return { status: 200, accepted: true, target };
  }
  target.friendRequests.push({ username: sender.username, userId: sender._id, createdAt: new Date() });
  await target.save();
  // The request must actually notify the other person — before this
  // there was no notification at all, so requests sat unseen.
  await createNotification(target._id, {
    type: "friend_request",
    title: "New friend request",
    body: `${sender.username} wants to be your friend.`,
    fromUsername: sender.username,
    refId: sender.username
  });
  return { status: 200, requestSent: true, target };
}

// GET /friends/requests — my pending incoming requests, newest first,
// each with the requester's online / last-seen status (same display
// as the who's-online list). Logged-in only.
app.get("/friends/requests", requireDb, requireAuth, async (req, res) => {
  try {
    const requests = [...(req.user.friendRequests || [])].sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
    const enriched = [];
    for (const r of requests) {
      const requester = r.userId
        ? await User.findById(r.userId).select("_id username lastSeenAt")
        : await findUserByUsername(User, r.username);
      enriched.push({
        username: r.username,
        userId: requester ? String(requester._id) : (r.userId ? String(r.userId) : null),
        createdAt: r.createdAt || null,
        online: requester ? onlineUserIds.has(String(requester._id)) : false,
        lastSeenAt: requester ? (requester.lastSeenAt || null) : null
      });
    }
    res.json({ success: true, requests: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /friends/request — send a friend request. Body: { "friendName": "username" }.
app.post("/friends/request", requireDb, requireAuth, async (req, res) => {
  try {
    const friendName = typeof req.body?.friendName === "string" ? req.body.friendName.trim() : "";
    const result = await sendFriendRequest(req.user, friendName);
    if (result.error) return res.status(result.status).json({ error: result.error });
    if (result.accepted) {
      return res.json({ success: true, accepted: true, friends: req.user.friends, message: `${friendName} had already sent you a request — you're friends now.` });
    }
    res.json({
      success: true,
      requestSent: true,
      alreadySent: Boolean(result.alreadySent),
      friends: req.user.friends,
      message: result.alreadySent
        ? `You already sent ${friendName} a friend request.`
        : `Friend request sent to ${friendName}.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /friends/requests/:username/accept — accept a pending request.
// Both users become friends; the pending request is cleared both ways.
app.post("/friends/requests/:username/accept", requireDb, requireAuth, async (req, res) => {
  try {
    const username = req.params.username;
    if (!hasFriendRequest(req.user, username)) {
      return res.status(404).json({ error: "No friend request from that person" });
    }
    const other = await findUserByUsername(User, username);
    if (!other) {
      removeFriendRequest(req.user, username);
      await req.user.save();
      return res.status(404).json({ error: "That account no longer exists" });
    }
    removeFriendRequest(req.user, username);
    removeFriendRequest(other, req.user.username);
    addFriendBothWays(req.user, other);
    await req.user.save();
    await other.save();
    // Tell the person who sent the request that it was accepted.
    await createNotification(other._id, {
      type: "friend_accepted",
      title: "Friend request accepted",
      body: `${req.user.username} accepted your friend request — you're friends now.`,
      fromUsername: req.user.username,
      refId: req.user.username
    });
    res.json({ success: true, friends: req.user.friends, message: `You and ${username} are friends now.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /friends/requests/:username/decline — decline a pending request.
// The request is removed; nobody becomes friends.
app.post("/friends/requests/:username/decline", requireDb, requireAuth, async (req, res) => {
  try {
    const username = req.params.username;
    if (!hasFriendRequest(req.user, username)) {
      return res.status(404).json({ error: "No friend request from that person" });
    }
    removeFriendRequest(req.user, username);
    await req.user.save();
    res.json({ success: true, message: `Declined ${username}'s friend request.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/friends/add", requireDb, async (req, res) => {
  try {
    const { userId, friendName } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Legacy route (used by older clients): this used to instantly
    // add the name to the sender's own list and tell nobody. It now
    // sends a real friend request to the other person instead, so
    // the request actually shows up for them.
    const result = await sendFriendRequest(user, typeof friendName === "string" ? friendName.trim() : "");
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({
      success: true,
      requestSent: true,
      alreadySent: Boolean(result.alreadySent),
      accepted: Boolean(result.accepted),
      friends: user.friends
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

app.post("/servers/create", requireDb, async (req, res) => {
  try {
    const { userId, serverName } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.servers.push(serverName);
    await user.save();

    res.json({
      success: true,
      servers: user.servers
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// --- Admin endpoints (owner moderation) -------------------------------
// All admin routes require a valid login AND role "admin". They return
// public user info only — never passwords or password hashes.

// GET /admin/users — list every account (admin only).
app.get("/admin/users", requireDb, requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}).select("-password").sort({ createdAt: 1 });
    res.json({ success: true, users: users.map(adminUser), emailConfigured: emailConfigured() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/users/:id/profile — the member's WHOLE profile, for
// admins only (owner Dolo45 + other admins). Bio, avatar, uploads,
// profile music, social links, friends, servers, verification
// status, online / last seen, referral info. The account email is
// included for moderation only — it never appears in any member
// response. This endpoint NEVER returns a password, password hash,
// auth token, or any 2FA / reset code (hashed or not): the response
// is built field-by-field from adminUser() plus the lists below, and
// the raw user document is never spread into it.
app.get("/admin/users/:id/profile", requireDb, requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "User not found" });
    const target = await User.findById(req.params.id).select("-password");
    if (!target) return res.status(404).json({ error: "User not found" });
    const uploads = await Upload.find({ userId: target._id }).sort({ createdAt: -1 }).limit(50);
    const referralCount = await User.countDocuments({ referredBy: target.username });
    res.json({
      success: true,
      user: adminUser(target),
      profileSong: target.profileSong && target.profileSong.url ? target.profileSong : null,
      friends: target.friends || [],
      servers: target.servers || [],
      referral: {
        code: target.referralCode || "",
        referredBy: target.referredBy || "",
        referralCount
      },
      uploads: uploads.map((u) => ({
        id: u._id,
        originalName: u.originalName,
        mimeType: u.mimeType,
        size: u.size,
        kind: u.kind,
        createdAt: u.createdAt,
        url: `/uploads/${u.fileId}`
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/users/:id/role — set role to "user" or "admin" (admin only).
// An admin cannot change their own role, so the owner can't lock
// themselves out by accident.
app.post("/admin/users/:id/role", requireDb, requireAuth, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ error: 'Role must be "user" or "admin"' });
    }
    if (req.params.id === String(req.user._id)) {
      return res.status(400).json({ error: "You cannot change your own role" });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    target.role = role;
    await target.save();
    res.json({ success: true, user: publicUser(target) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/users/:id/ban — ban or unban an account (admin only).
// Body: { "banned": true } to ban, { "banned": false } to unban.
// Banned users cannot log in, and their tokens stop working.
// An admin cannot ban themselves.
app.post("/admin/users/:id/ban", requireDb, requireAuth, requireAdmin, async (req, res) => {
  try {
    const { banned } = req.body;
    if (typeof banned !== "boolean") {
      return res.status(400).json({ error: '"banned" must be true or false' });
    }
    if (req.params.id === String(req.user._id)) {
      return res.status(400).json({ error: "You cannot ban yourself" });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    target.banned = banned;
    await target.save();
    res.json({ success: true, user: publicUser(target) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// POST /admin/users/:id/verify-revoke — take the verified badge off
// an account (admin only, 2FA-gated when email is configured).
// Admins can REVOKE only — they can never grant a badge without
// email proof. Cannot revoke yourself, and cannot revoke the owner
// (exact Dolo45) unless you ARE Dolo45.
app.post("/admin/users/:id/verify-revoke", requireDb, requireAuth, requireAdmin, async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (String(target._id) === String(req.user._id)) {
      return res.status(400).json({ error: "You cannot revoke your own verified badge" });
    }
    if (isOwnerUsername(target.username) && !isOwnerUsername(req.user.username)) {
      return res.status(403).json({ error: "Only Dolo45 can change Dolo45's verified badge" });
    }
    target.verified = false;
    target.verificationStatus = "revoked";
    await target.save();
    res.json({ success: true, user: adminUser(target) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/password-resets — pending owner-approval requests.
app.get("/admin/password-resets", requireDb, requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({ "passwordResetRequest.status": "pending" }).select("_id username email passwordResetRequest").sort({ "passwordResetRequest.requestedAt": 1 });
    res.json({ success: true, emailConfigured: emailConfigured(), requests: users.map((u) => ({ id: u._id, username: u.username, email: u.email || "", requestedAt: u.passwordResetRequest.requestedAt })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/password-resets/:id/approve — Dolo45 approves: the
// reset code is issued. If email is configured, the code is emailed
// exactly as before and nothing else changes. If email is NOT
// configured, the code is still issued (same 6-digit code, hash,
// 15-minute expiry, attempt limit) and returned in the response —
// but ONLY to the owner (exact Dolo45): the owner reads it in the
// Admin panel and shares it with the member himself (e.g. by phone).
// A non-owner admin can never see a plaintext code: while email is
// not configured, only the owner may approve. The member is notified
// either way; the notification never promises an email that was
// not sent.
app.post("/admin/password-resets/:id/approve", requireDb, requireAuth, requireAdmin, async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (!target.passwordResetRequest || target.passwordResetRequest.status !== "pending") {
      return res.status(400).json({ error: "That reset request is not pending" });
    }
    if (!target.email) return res.status(400).json({ error: "That account has no email to send a code to" });
    const code = makeSixDigitCode();
    if (emailConfigured()) {
      const sent = await sendEmail(target.email, "Tap In password reset code",
        `Your Tap In password reset code is ${code}. It expires in 15 minutes. Dolo45 approved this reset. If this wasn't you, ignore this email and tell Dolo45.`);
      if (!sent.sent) return res.status(503).json({ error: "The reset email could not be sent — please try again later", emailConfigured: true });
    } else if (!isOwnerUsername(req.user.username)) {
      // No email service: the code cannot be emailed, so it must be
      // relayed by the owner in person. Other admins cannot approve
      // in this state — a plaintext code is never shown to anyone
      // but the owner.
      return res.status(403).json({ error: "Email is not set up yet — only Dolo45 can approve a reset right now, so he can share the code with the member directly.", emailConfigured: false });
    }
    target.passwordResetCodeHash = hashCode(code);
    target.passwordResetExpiresAt = new Date(Date.now() + CODE_TTL_MS);
    target.passwordResetAttempts = 0;
    target.passwordResetSentAt = new Date();
    target.passwordResetRequest = { status: "approved", requestedAt: target.passwordResetRequest.requestedAt, decidedAt: new Date(), decidedBy: req.user.username };
    await target.save();
    await createNotification(target._id, {
      type: "password_reset_approved",
      title: "Your password reset was approved",
      body: emailConfigured()
        ? "Dolo45 approved your reset — check your email for the 6-digit code, then reset your password in Tap In."
        : "Dolo45 approved your reset — he will share the 6-digit code with you directly. It expires in 15 minutes.",
      fromUsername: req.user.username,
      refId: ""
    });
    if (emailConfigured()) {
      return res.json({ success: true, emailSent: true, message: "Approved — the reset code was emailed to the member." });
    }
    return res.json({ success: true, emailSent: false, username: target.username, code, message: "Approved — email is not set up, so share this code with the member yourself. It expires in 15 minutes." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/password-resets/:id/deny — no code is sent. The member
// is told the request was not approved.
app.post("/admin/password-resets/:id/deny", requireDb, requireAuth, requireAdmin, async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (!target.passwordResetRequest || target.passwordResetRequest.status !== "pending") {
      return res.status(400).json({ error: "That reset request is not pending" });
    }
    target.passwordResetRequest = { status: "denied", requestedAt: target.passwordResetRequest.requestedAt, decidedAt: new Date(), decidedBy: req.user.username };
    target.passwordResetCodeHash = ""; target.passwordResetExpiresAt = null;
    await target.save();
    await createNotification(target._id, {
      type: "password_reset_denied",
      title: "Your password reset was not approved",
      body: "Dolo45 did not approve your password reset request. If this was you, contact Dolo45.",
      fromUsername: req.user.username,
      refId: ""
    });
    res.json({ success: true, message: "Denied — no reset code was sent." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Socket.IO Events

// --- Online presence --------------------------------------------------
// Live "online now" is kept in memory here: userId -> number of open
// sockets (so two tabs / two devices both count, and a user stays
// online until their LAST socket closes). lastSeenAt is also written
// to MongoDB (User.lastSeenAt) on disconnect, so it survives a
// restart. Presence is NEVER broadcast to strangers: updates go only
// to people who share a DM/group with that user, plus admins.
const onlineSocketCounts = new Map(); // userId -> open socket count
const onlineUserIds = new Set(); // userIds with >= 1 open socket
const userSockets = new Map(); // userId -> Set<socket id>

async function presenceRecipients(userId) {
  // Everyone who may see this user's online status: DM/group partners
  // and admins. Returns a Set of userIds (strings).
  const out = new Set([String(userId)]);
  try {
    const roomsList = await ChatRoom.find({ members: userId }).select("members");
    for (const r of roomsList) {
      for (const m of r.members || []) out.add(String(m));
    }
    const admins = await User.find({ role: "admin" }).select("_id");
    for (const a of admins) out.add(String(a._id));
  } catch (err) { /* presence must never break chat */ }
  return out;
}

function emitPresenceTo(userIds, payload) {
  for (const uid of userIds) {
    const sockets = userSockets.get(String(uid));
    if (!sockets) continue;
    for (const sid of sockets) io.to(sid).emit("presence", payload);
  }
}

// Auto-friend on online (Wesley's rule, Nov 15): when a member comes
// online, they automatically become a friend of Dolo45 (exact username,
// the owner) and Dolo45 becomes a friend of theirs — mutual, no
// Accept/Decline needed for this auto-add. Scope is deliberately
// narrow: ONLY Dolo45 gets auto-friended, never member-to-member.
// Skips: Dolo45 himself, banned users (including the separate banned
// lowercase "dolo45" account — exact-match only, never a case-variant
// of the owner name), and anyone already friends both ways (no
// duplicates, no duplicate request entries). Any stale pending
// requests between the two are cleared so they don't linger in the
// Friends tab. The owner gets one "friend_accepted" alert so the bell
// lights up. Never throws — callers wrap it, and it must never break
// a socket connection.
async function autoFriendWithOwner(socketUser) {
  if (!ADMIN_USERNAME) return;
  if (!socketUser || !socketUser.id || !socketUser.username) return;
  // The owner coming online is not auto-friended to himself.
  if (socketUser.username === ADMIN_USERNAME) return;
  // Never touch a case/whitespace variant of the owner name (the
  // banned lowercase "dolo45" is a separate account).
  if (sameUsername(socketUser.username, ADMIN_USERNAME)) return;
  const owner = await User.findOne({ username: ADMIN_USERNAME });
  if (!owner || owner.banned) return;
  const user = await User.findById(socketUser.id);
  if (!user || user.banned) return;
  const ownerHasThem = (owner.friends || []).some((f) => sameUsername(f, user.username));
  const theyHaveOwner = (user.friends || []).some((f) => sameUsername(f, owner.username));
  if (ownerHasThem && theyHaveOwner) {
    // Already mutual friends: just clear any stale pending requests
    // between them so the Friends tab stays clean.
    let changed = false;
    if (hasFriendRequest(owner, user.username)) { removeFriendRequest(owner, user.username); changed = true; }
    if (hasFriendRequest(user, owner.username)) { removeFriendRequest(user, owner.username); changed = true; }
    if (changed) { await owner.save(); await user.save(); }
    return;
  }
  removeFriendRequest(owner, user.username);
  removeFriendRequest(user, owner.username);
  addFriendBothWays(owner, user);
  await owner.save();
  await user.save();
  await createNotification(owner._id, {
    type: "friend_accepted",
    title: `${user.username} is now your friend`,
    body: `${user.username} came online and was added as your friend automatically.`,
    fromUsername: user.username,
    refId: user.username
  });
}

async function markOnline(socketUser) {
  const uid = String(socketUser.id);
  onlineSocketCounts.set(uid, (onlineSocketCounts.get(uid) || 0) + 1);
  const wasOnline = onlineUserIds.has(uid);
  onlineUserIds.add(uid);
  if (!userSockets.has(uid)) userSockets.set(uid, new Set());
  userSockets.get(uid).add(socketUser.socketId);
  if (!wasOnline) {
    // Wesley's rule (Nov 15): when someone comes online, they
    // automatically become a friend of Dolo45 (the owner) and Dolo45
    // becomes a friend of theirs — mutual, no Accept/Decline tap
    // needed. Only Dolo45 gets auto-friended this way; nobody is
    // auto-friended to anyone else. Runs once per online transition
    // (first socket), never per tab, and never breaks the connection.
    try { await autoFriendWithOwner(socketUser); } catch (err) { /* presence must never break the connection */ }
    try { await User.updateOne({ _id: uid }, { $set: { lastSeenAt: new Date() } }); } catch (err) { /* ignore */ }
    const recipients = await presenceRecipients(uid);
    emitPresenceTo(recipients, { userId: uid, username: socketUser.username, online: true, lastSeenAt: new Date() });
    // A friend just came online: notify the people who can see them
    // — their friends, their DM/group partners, and the admin — so
    // the bell lights up instead of the green dot being the only clue.
    // Friends are stored as plain name strings, so match tolerantly:
    // a friend stored under a case/whitespace variant of the name
    // (Eatmyass68 bug) still counts as a friend.
    try {
      const allUsers = await User.find({}).select("_id friends");
      const friendDocs = allUsers.filter((u) =>
        (u.friends || []).some((f) => sameUsername(f, socketUser.username))
      );
      const notifyIds = new Set(recipients);
      for (const f of friendDocs) notifyIds.add(String(f._id));
      notifyIds.delete(uid);
      for (const notifyId of notifyIds) {
        await createNotification(notifyId, {
          type: "friend_online",
          title: `${socketUser.username} is online`,
          body: `${socketUser.username} just came online.`,
          fromUsername: socketUser.username,
          refId: socketUser.username
        });
      }
    } catch (err) { /* presence must never break the connection */ }
  }
}

async function markOffline(socketUser) {
  const uid = String(socketUser.id);
  const remaining = (onlineSocketCounts.get(uid) || 1) - 1;
  if (remaining > 0) {
    onlineSocketCounts.set(uid, remaining);
  } else {
    onlineSocketCounts.delete(uid);
    onlineUserIds.delete(uid);
  }
  const set = userSockets.get(uid);
  if (set) {
    set.delete(socketUser.socketId);
    if (!set.size) userSockets.delete(uid);
  }
  if (remaining <= 0) {
    const now = new Date();
    try { await User.updateOne({ _id: uid }, { $set: { lastSeenAt: now } }); } catch (err) { /* ignore */ }
    const recipients = await presenceRecipients(uid);
    emitPresenceTo(recipients, { userId: uid, username: socketUser.username, online: false, lastSeenAt: now });
  }
}

// Socket auth: a JWT in handshake auth identifies the logged-in user.
// Unauthenticated sockets are still allowed (global chat and video
// rooms worked that way before) — they just get socket.user = null
// and can never join, read or send in a private chat.
io.use(async (socket, next) => {
  const token = socket.handshake?.auth?.token || socket.handshake?.query?.token;
  if (!token) {
    socket.user = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, jwtSecret);
    // Temp 2FA tokens and tokens from before a password reset are
    // not logins for the socket either.
    if ((decoded.purpose && decoded.purpose !== "full") || (typeof decoded.tokenVersion === "number")) {
      const u = await User.findById(decoded.id);
      if (!u || u.banned || decoded.tokenVersion !== (u.tokenVersion || 0)) { socket.user = null; return next(); }
    } else {
      const u = await User.findById(decoded.id);
      if (!u || u.banned) { socket.user = null; return next(); }
    }
    socket.user = { id: String(decoded.id), username: decoded.username, role: decoded.role };
    next();
  } catch (err) {
    socket.user = null;
    next();
  }
});

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);
  if (socket.user) {
    socket.user.socketId = socket.id;
    markOnline(socket.user);
  }

  socket.on("join-room", (roomId) => {
    // Private chat rooms live under the "chat:<id>" namespace and are
    // guarded by join-chat-room — never let the open video-room join
    // sneak into them.
    if (typeof roomId === "string" && roomId.startsWith("chat:")) return;
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }

    rooms[roomId].push(socket.id);
    socket.join(roomId);

    socket.to(roomId).emit("user-joined", socket.id);
    io.to(socket.id).emit(
      "existing-users",
      rooms[roomId].filter((id) => id !== socket.id)
    );
  });

  socket.on("offer", (data) => {
    io.to(data.to).emit("offer", {
      sdp: data.sdp,
      from: socket.id
    });
  });

  socket.on("answer", (data) => {
    io.to(data.to).emit("answer", {
      sdp: data.sdp,
      from: socket.id
    });
  });

  socket.on("ice-candidate", (data) => {
    io.to(data.to).emit("ice-candidate", {
      candidate: data.candidate,
      from: socket.id
    });
  });

  socket.on("chat-message", async (data) => {
    // Global chat ONLY. Private rooms are never reachable through this
    // old open event — they use join-chat-room / private-chat-message
    // with membership checks. Anything else is ignored.
    if (!data || data.room !== "global") return;
    const text = typeof data.message === "string" ? data.message.trim() : "";
    if (!text || text.length > 1000) {
      socket.emit("chat-error", { error: "Messages must be 1–1000 characters" });
      return;
    }
    // The sender comes ONLY from the authed socket (socket.user) —
    // never from a client-supplied username, so nobody can send
    // global chat as someone else. The global socket carries the
    // login JWT (see ChatPanel.jsx, same as the private-chat socket);
    // a socket with no login cannot send. Receiving still works
    // without a login — the room is read by members who are logged
    // in, and history is fetched over the authed HTTP endpoint.
    if (!socket.user) {
      socket.emit("chat-error", { error: "Log in to send in global chat" });
      return;
    }
    const senderUsername = socket.user.username;
    const senderId = socket.user.id;
    // Save BEFORE broadcast, same order as private chat — and trim
    // to Wesley's 100-message cap (oldest deleted as new ones come
    // in; that is the ONLY global-chat deletion). If the save fails
    // the message is NOT broadcast, so nobody sees a message that
    // isn't in history.
    let saved;
    try {
      const flags = scanChatMessage(text);
      saved = await GlobalChatMessage.create({
        senderId,
        senderUsername,
        text,
        flagged: flags.length > 0,
        flagReasons: flags.map((f) => f.label)
      });
      await trimGlobalChat();
    } catch (err) {
      socket.emit("chat-error", { error: "Could not send that message — try again" });
      return;
    }
    io.to(data.room).emit("chat-message", {
      ...publicGlobalMessage(saved),
      // Legacy fields, for any client still reading the old shape.
      message: text,
      username: senderUsername,
      from: socket.id,
      timestamp: saved.createdAt
    });
    // Safety monitor — ALERT ONLY, global chat too (Wesley, Nov 16).
    // Nothing here deletes, blocks, or auto-bans a global message:
    // it already went out above. A match only stores a flag for
    // Dolo45 to review and alerts ONLY him — never other admins or
    // members. Wrapped so a scan failure can never break the chat.
    // (The flag's `message` stays null: ChatFlag.message points at
    // the private ChatMessage model, so it cannot reference a global
    // message document — the flag still carries the sender + text.)
    try {
      const gFlags = scanChatMessage(text);
      if (gFlags.length > 0) {
        await ChatFlag.create({
          message: null,
          room: null,
          roomName: "Global chat",
          senderId: senderId,
          senderUsername,
          text,
          reasons: gFlags.map((f) => f.label)
        });
        const owner = await User.findOne({ username: ADMIN_USERNAME });
        if (owner && !owner.banned) {
          await createNotification(owner._id, {
            type: "safety_flag",
            title: "Safety alert — global chat needs your review",
            body: `${senderUsername}: ${gFlags.map((f) => f.label).join(" · ")}`,
            fromUsername: senderUsername,
            refId: "global"
          });
        }
      }
    } catch (err) { /* chat already went out — the flag is a bonus */ }
    // Global chat notification: tell everyone who is online right
    // now (except the sender) — a stored notification plus a live
    // push, the same as every other notification. Offline members
    // are NOT spammed with every global message.
    try {
      for (const onlineId of [...onlineUserIds]) {
        if (onlineId === String(senderId)) continue;
        await createNotification(onlineId, {
          type: "message",
          title: "Global chat",
          body: `${senderUsername}: ${text.slice(0, 120)}`,
          fromUsername: senderUsername,
          refId: "global"
        });
      }
    } catch (err) { /* chat already went out — notifications are a bonus */ }
  });

  // --- Owner auto-broadcast on Go Live ------------------------------
  // When the OWNER (exact username Dolo45, ADMIN_USERNAME — never a
  // case/whitespace variant, never the banned lowercase dolo45) goes
  // live, Tap In automatically does the in-app broadcast that is
  // actually possible from inside Tap In:
  //   (a) a Feed post with the go-live text (members see it in Feed),
  //   (b) a 1-to-1 DM with the same text to every non-banned member
  //       (one DM thread per pair, reusing savePrivateMessage, so the
  //       member also gets a message alert — the same text Wesley
  //       sent to everyone on 16 Nov 2026 when he went live).
  // It does NOT post to Facebook / Instagram / TikTok / YouTube /
  // Twitch from the backend: Tap In holds no posting credentials
  // for those platforms and has no API path to do it — claiming it
  // did would be fake. The video push-out is the streamer's OBS /
  // Restream feed (see STREAMING.md); this helper reports which
  // destinations are enabled + keyed so the owner sees, in-app,
  // where OBS/Restream should be pushing to.
  // Guard: a Feed post / DM with this exact text in the last 10
  // minutes is not repeated, so a reconnect / double tap on Go Live
  // never spams the Feed or anyone's DMs twice.
  const GO_LIVE_TEXT = "🔴 I'M LIVE on Tap In right now! Time to tap in! 🔥 Live stream, chat, video rooms — come tap in with me now. It's free for life if you sign up while it's free. Tap in. Stay tapped in. — Dolo45";
  async function announceOwnerGoLive(owner, broadcast) {
    if (!isOwnerUsername(owner.username)) return null;
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const destinations = (owner.streamDestinations || [])
      .filter((d) => d.enabled && d.keyEnc)
      .map((d) => d.platform);
    let feedPosted = false;
    try {
      const recentPost = await Post.findOne({
        userId: owner._id, text: GO_LIVE_TEXT, createdAt: { $gt: tenMinAgo }
      });
      if (!recentPost) {
        await Post.create({ userId: owner._id, username: owner.username, text: GO_LIVE_TEXT });
        feedPosted = true;
      }
    } catch (err) { /* Feed post is a bonus — live still started */ }
    let dmCount = 0;
    try {
      const members = await User.find({ banned: { $ne: true } }).select("_id username");
      for (const member of members) {
        if (String(member._id) === String(owner._id)) continue;
        try {
          const ids = [String(owner._id), String(member._id)].sort();
          const dmKey = ids.join("_");
          let room = await ChatRoom.findOne({ dmKey });
          if (!room) {
            room = await ChatRoom.create({
              type: "dm", dmKey,
              members: [owner._id, member._id],
              memberUsernames: [owner.username, member.username],
              createdBy: owner._id
            });
          }
          const recentDm = await ChatMessage.findOne({
            room: room._id, senderId: owner._id, text: GO_LIVE_TEXT,
            createdAt: { $gt: tenMinAgo }
          });
          if (recentDm) continue;
          await savePrivateMessage(room, owner, GO_LIVE_TEXT);
          dmCount++;
        } catch (err) { /* one failed DM must not stop the rest */ }
      }
    } catch (err) { /* DMs are a bonus — live still started */ }
    return { destinations, feedPosted, dmCount, room: broadcast.room, startedAt: broadcast.startedAt };
  }

  // --- Going live -----------------------------------------------------
  // "Go Live" is joining a video room with the camera on. The client
  // emits "go-live" with the room name when the camera starts, and
  // "stop-live" when it leaves. Everyone else gets a notification —
  // "So-and-so just went live" — and tapping it opens that video room.
  socket.on("go-live", async (data) => {
    if (!socket.user) return;
    const roomName = (typeof data?.room === "string" && data.room.trim()) || "global";
    const key = roomName.toLowerCase();
    const existing = liveBroadcasts.get(key);
    if (existing && existing.userId === socket.user.id) return; // already live here
    const broadcast = {
      userId: socket.user.id,
      username: socket.user.username,
      room: key,
      startedAt: new Date()
    };
    liveBroadcasts.set(key, broadcast);
    // Owner auto-broadcast: Feed post + DM to every member (owner
    // only, exact Dolo45). Runs in the background — the live stream
    // itself never waits on it, and a failure here never stops it.
    try {
      const ownerUser = await User.findById(socket.user.id);
      if (ownerUser) {
        const auto = await announceOwnerGoLive(ownerUser, broadcast);
        if (auto) {
          broadcast.autoBroadcast = auto;
          socket.emit("broadcast-status", {
            live: true, room: broadcast.room, startedAt: broadcast.startedAt,
            destinations: auto.destinations, feedPosted: auto.feedPosted, dmCount: auto.dmCount
          });
        }
      }
    } catch (err) { /* auto-broadcast is a bonus — live still started */ }
    io.emit("live-started", {
      username: broadcast.username, room: broadcast.room, startedAt: broadcast.startedAt,
      autoBroadcast: broadcast.autoBroadcast ? {
        destinations: broadcast.autoBroadcast.destinations,
        feedPosted: broadcast.autoBroadcast.feedPosted,
        dmCount: broadcast.autoBroadcast.dmCount
      } : null
    });
    try {
      const everyone = await User.find({}).select("_id");
      for (const u of everyone) {
        if (String(u._id) === String(socket.user.id)) continue;
        await createNotification(u._id, {
          type: "live",
          title: `${broadcast.username} just went live`,
          body: `Tap to watch ${broadcast.username} live in video room "${broadcast.room}".`,
          fromUsername: broadcast.username,
          refId: broadcast.room
        });
      }
    } catch (err) { /* live still started — notifications are a bonus */ }
  });

  socket.on("stop-live", () => {
    if (!socket.user) return;
    for (const [key, b] of liveBroadcasts) {
      if (String(b.userId) === String(socket.user.id)) {
        liveBroadcasts.delete(key);
        io.emit("live-ended", { username: b.username, room: b.room });
      }
    }
  });

  // --- Private chats (Socket.IO live path) --------------------------
  // join-chat-room: verify the logged-in user is a member (in MongoDB)
  // before letting their socket into the room. Non-members get a
  // "chat-error" and never see a single message.
  socket.on("join-chat-room", async (roomId) => {
    if (!socket.user) {
      socket.emit("chat-error", { error: "Log in to join a private chat" });
      return;
    }
    try {
      if (!ObjectId.isValid(roomId)) {
        socket.emit("chat-error", { error: "Chat not found" });
        return;
      }
      const room = await ChatRoom.findById(roomId);
      if (!room || !isRoomMember(room, socket.user.id)) {
        socket.emit("chat-error", { error: "You are not a member of this chat" });
        return;
      }
      socket.join(`chat:${roomId}`);
      socket.emit("joined-chat-room", { roomId: String(roomId) });
    } catch (err) {
      socket.emit("chat-error", { error: "Could not join that chat" });
    }
  });

  // private-chat-message: membership-checked, saved to MongoDB,
  // safety-scanned, then broadcast only to the room's member sockets.
  socket.on("private-chat-message", async (data) => {
    if (!socket.user) {
      socket.emit("chat-error", { error: "Log in to send a private message" });
      return;
    }
    try {
      const roomId = data?.roomId;
      const text = typeof data?.text === "string" ? data.text.trim() : "";
      if (!roomId || !ObjectId.isValid(roomId)) {
        socket.emit("chat-error", { error: "Chat not found" });
        return;
      }
      if (!text || text.length > 1000) {
        socket.emit("chat-error", { error: "Messages must be 1–1000 characters" });
        return;
      }
      const room = await ChatRoom.findById(roomId);
      if (!room || !isRoomMember(room, socket.user.id)) {
        socket.emit("chat-error", { error: "You are not a member of this chat" });
        return;
      }
      const sender = await User.findById(socket.user.id);
      if (!sender || sender.banned) {
        socket.emit("chat-error", { error: "This account cannot send messages" });
        return;
      }
      const { message } = await savePrivateMessage(room, sender, text);
      io.to(`chat:${roomId}`).emit("private-chat-message", publicChatMessage(message));
    } catch (err) {
      socket.emit("chat-error", { error: "Could not send that message" });
    }
  });

  socket.on("stream-data", (data) => {
    socket.to(data.room).emit("stream-data", {
      chunk: data.chunk,
      from: socket.id
    });
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);

    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter((id) => id !== socket.id);
      socket.to(roomId).emit("user-left", socket.id);
    }
    if (socket.user) markOffline(socket.user);
    // If they were live, they aren't anymore.
    if (socket.user) {
      for (const [key, b] of liveBroadcasts) {
        if (String(b.userId) === String(socket.user.id)) {
          liveBroadcasts.delete(key);
          io.emit("live-ended", { username: b.username, room: b.room });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
