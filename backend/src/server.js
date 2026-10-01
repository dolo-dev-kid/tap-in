const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = {};

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  bio: {
    type: String,
    default: ""
  },
  avatar: {
    type: String,
    default: ""
  },
  friends: {
    type: [String],
    default: []
  },
  servers: {
    type: [String],
    default: []
  }
});

const User = mongoose.model("User", UserSchema);
const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";

mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/tap-in")
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
  });

app.get("/", (req, res) => {
  res.json({ message: "Tap-In backend running" });
});

app.post("/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      password: hashedPassword,
      friends: [],
      servers: []
    });

    res.status(201).json({
      success: true,
      userId: user._id,
      username: user.username
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Incorrect password" });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: "30d" }
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
    res.status(500).json({ error: err.message });
  }
});

app.get("/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/friends/add", async (req, res) => {
  try {
    const { userId, friendName } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.friends.includes(friendName)) {
      user.friends.push(friendName);
      await user.save();
    }

    res.json({ success: true, friends: user.friends });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/servers/create", async (req, res) => {
  try {
    const { userId, serverName } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.servers.includes(serverName)) {
      user.servers.push(serverName);
      await user.save();
    }

    res.json({ success: true, servers: user.servers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", (roomId) => {
    if (!rooms[roomId]) rooms[roomId] = [];

    if (!rooms[roomId].includes(socket.id)) {
      rooms[roomId].push(socket.id);
    }

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
      room: data.room
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    Object.keys(rooms).forEach((roomId) => {
      rooms[roomId] = rooms[roomId].filter((id) => id !== socket.id);
      socket.to(roomId).emit("user-left", socket.id);
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Tap-In backend running on http://localhost:${PORT}`);
});
