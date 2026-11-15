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

// Public-safe shape for a user in admin listings: never include the
// password field (hash included — it is never selected here).
function publicUser(u) {
  return {
    id: u._id,
    username: u.username,
    bio: u.bio || "",
    avatar: u.avatar || "",
    role: u.role,
    banned: Boolean(u.banned),
    createdAt: u.createdAt,
    friendCount: (u.friends || []).length,
    serverCount: (u.servers || []).length
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
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password required"
      });
    }

    const existing = await User.findOne({ username });

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
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password required"
      });
    }

    const user = await User.findOne({ username });

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
    res.json({ id: user._id, username: user.username, bio: user.bio, avatar: user.avatar, profileSong: user.profileSong && user.profileSong.url ? user.profileSong : null, friends: user.friends, servers: user.servers });
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

app.post("/friends/add", requireDb, async (req, res) => {
  try {
    const { userId, friendName } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.friends.includes(friendName)) {
      user.friends.push(friendName);
      await user.save();
    }

    res.json({
      success: true,
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
io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  socket.on("join-room", (roomId) => {
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

  socket.on("chat-message", (data) => {
    io.to(data.room).emit("chat-message", {
      message: data.message,
      from: socket.id,
      timestamp: new Date()
    });
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
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
