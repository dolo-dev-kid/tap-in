const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("./models/User");
const { findUserByUsername, usernameTaken } = require("./usernameLookup");

const router = express.Router();
const SECRET = process.env.JWT_SECRET || "dev-only-change-me";

// NOTE: this router is not mounted by server.js (server.js defines
// its own /auth routes) — it is kept consistent with them so a future
// mount behaves the same way: usernames are trimmed at signup, and
// lookups tolerate case / invisible-whitespace drift (Eatmyass68 bug).
router.post("/register", async (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const { password } = req.body;

  if (!username || !password) return res.json({ error: "Username and password required" });

  const exists = await usernameTaken(User, username);
  if (exists) return res.json({ error: "User exists" });

  const hash = await bcrypt.hash(password, 10);

  const user = await User.create({
    username,
    password: hash,
    friends: [],
    servers: []
  });

  res.json({ success: true });
});

router.post("/login", async (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const { password } = req.body;

  const user = username
    ? (await User.findOne({ username })) || (await findUserByUsername(User, username))
    : null;
  if (!user) return res.json({ error: "Invalid user" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.json({ error: "Invalid password" });

  const token = jwt.sign({ id: user._id }, SECRET);

  res.json({ token });
});

module.exports = router;
