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
      password: hashedPassword
    });

    res.json({
      success: true,
      userId: user._id
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

    const token = jwt.sign(
      {
        id: user._id,
        username: user.username
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
        avatar: user.avatar
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
