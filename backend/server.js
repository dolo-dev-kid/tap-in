require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const User = require("./models/User");

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

const rooms = {};

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
    res.json({ id: user._id, username: user.username, bio: user.bio, avatar: user.avatar, friends: user.friends, servers: user.servers });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
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
