require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { GridFSBucket, ObjectId } = require("mongodb");
const { Server } = require("socket.io");
const User = require("./models/User");
const Post = require("./models/Post");
const Upload = require("./models/Upload");
const ChatRoom = require("./models/ChatRoom");
const ChatMessage = require("./models/ChatMessage");
const ChatFlag = require("./models/ChatFlag");
const Notification = require("./models/Notification");
const { scanChatMessage } = require("./chatFlags");
const { sameUsername, findUserByUsername, usernameTaken } = require("./usernameLookup");

const app = express();
const server = http.createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
app.use(cors({ origin: [FRONTEND_URL, "http://localhost:5173", "capacitor://localhost"], credentials: true }));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: [FRONTEND_URL, "http://localhost:5173", "capacitor://localhost"],
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
    .then(() => { dbConnected = true; console.log("✅ MongoDB Connected"); })
    .catch((err) => console.error("❌ MongoDB Error:", err.message));
}
mongoose.connection.on("connected", () => { dbConnected = true; });
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

// Verify the JWT from `Authorization: Bearer <token>` and load the user.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Login required" });
  try {
    const decoded = jwt.verify(token, jwtSecret);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: "User not found" });
    if (user.banned) return res.status(403).json({ error: "This account has been banned" });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired login" });
  }
}

// Admin only: must be logged in AND have role "admin".
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access only" });
  }
  next();
}

// Dolo45's profile pic is his real Instagram profile pic
// (@nho_life_dolo45), shipped as a data URI in dolo45Avatar.js. Shown
// ONLY for the exact username "Dolo45" (case-sensitive — the separate
// banned lowercase "dolo45" account never gets it), and only when the
// account has no saved avatar of its own. A saved avatar always wins.
const { DOLO45_AVATAR_DATA_URI } = require("./dolo45Avatar");
const DOLO45_AVATAR_URL = DOLO45_AVATAR_DATA_URI;
function dolo45Avatar(u) {
  if (u && u.username === "Dolo45" && !u.avatar) return DOLO45_AVATAR_URL;
  return u.avatar || "";
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
    createdAt: u.createdAt,
    friendCount: (u.friends || []).length,
    serverCount: (u.servers || []).length,
    // Online presence (admin list only): live "online now" from the
    // socket counts, plus last seen from MongoDB.
    online: typeof onlineUserIds !== "undefined" ? onlineUserIds.has(String(u._id)) : false,
    lastSeenAt: u.lastSeenAt || null
  };
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

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password required"
      });
    }

    const existing = await usernameTaken(User, username);

    if (existing) {
      return res.status(400).json({
        error: "Username already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      password: hashedPassword,
      role: isOwnerUsername(username) ? "admin" : "user"
    });

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
      role: user.role
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

    const user = (await User.findOne({ username })) || (await findUserByUsername(User, username));

    if (!user) {
      return res.status(400).json({
        error: "User not found"
      });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(400).json({
        error: "Incorrect password"
      });
    }

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

    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
        role: user.role
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
        profileSong: user.profileSong && user.profileSong.url ? user.profileSong : null,
        role: user.role,
        banned: Boolean(user.banned)
      }
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

app.get("/users/:id", requireDb, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ id: user._id, username: user.username, bio: user.bio, avatar: dolo45Avatar(user), profileSong: user.profileSong && user.profileSong.url ? user.profileSong : null, friends: user.friends, servers: user.servers });
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
    res.json({ id: target._id, username: target.username, bio: target.bio, avatar: target.avatar, profileSong: target.profileSong && target.profileSong.url ? target.profileSong : null, friends: target.friends, servers: target.servers });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// --- Feed posts (real user posts only — no sample posts) ---------------

// GET /posts — public read, newest first.
app.get("/posts", requireDb, async (req, res) => {
  try {
    const posts = await Post.find({}).sort({ createdAt: -1 }).limit(100);
    res.json({ posts: posts.map(publicPost) });
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
// join, read or send in a room, and only an admin can review rooms
// for safety. The global chat is untouched by all of this.

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

// GET /users — find members by username (for starting a DM or adding
// to a group). Logged-in only; returns id + username, never passwords.
app.get("/users", requireDb, requireAuth, async (req, res) => {
  try {
    const q = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const filter = q
      ? { username: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }
      : {};
    const users = await User.find(filter).select("_id username role").sort({ username: 1 }).limit(20);
    res.json({ success: true, users: users.map((u) => ({ id: u._id, username: u.username, role: u.role })) });
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
    const users = await User.find({ _id: { $in: [...ids] } }).select("_id username lastSeenAt");
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
        online: onlineUserIds.has(String(u._id)),
        lastSeenAt: u.lastSeenAt || null
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /chat/rooms — rooms the logged-in user belongs to, newest first.
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

// --- Admin safety monitor (private chats) ---------------------------
// Admin only. The owner can list every private room, read a room's
// history for safety review, and see + mark safety flags. This is
// moderation for the owner's own app — it never exposes private
// messages to non-admin users.

// GET /admin/chat/rooms — every private room, with member names and
// message counts, newest activity first.
app.get("/admin/chat/rooms", requireDb, requireAuth, requireAdmin, async (req, res) => {
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
app.get("/admin/chat/rooms/:id/messages", requireDb, requireAuth, requireAdmin, async (req, res) => {
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
app.get("/admin/chat/flags", requireDb, requireAuth, requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.reviewed === "true") filter.reviewed = true;
    if (req.query.reviewed === "false") filter.reviewed = false;
    const flags = await ChatFlag.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json({
      success: true,
      flags: flags.map((f) => ({
        id: f._id,
        message: String(f.message),
        room: String(f.room),
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
app.post("/admin/chat/flags/:id/review", requireDb, requireAuth, requireAdmin, async (req, res) => {
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
    res.json({ success: true, users: users.map(publicUser) });
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
io.use((socket, next) => {
  const token = socket.handshake?.auth?.token || socket.handshake?.query?.token;
  if (!token) {
    socket.user = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, jwtSecret);
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
    const text = typeof data.message === "string" ? data.message : "";
    // The sender's username comes from the authed socket when there
    // is one, otherwise from the message itself (the global socket
    // was anonymous before this — messages didn't even say who sent
    // them). Include it in the broadcast so the room can see it.
    const senderUsername = socket.user?.username || (typeof data.username === "string" ? data.username.trim() : "") || "";
    io.to(data.room).emit("chat-message", {
      message: text,
      from: socket.id,
      username: senderUsername,
      timestamp: new Date()
    });
    // Global chat notification: tell everyone who is online right
    // now (except the sender) — a stored notification plus a live
    // push, the same as every other notification. Offline members
    // are NOT spammed with every global message.
    if (!text.trim() || !senderUsername) return;
    try {
      const sender = await findUserByUsername(User, senderUsername);
      for (const onlineId of [...onlineUserIds]) {
        if (sender && onlineId === String(sender._id)) continue;
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
    io.emit("live-started", { username: broadcast.username, room: broadcast.room, startedAt: broadcast.startedAt });
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
