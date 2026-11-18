const mongoose = require("mongoose");

// A safety flag on one chat message, for the owner (exact Dolo45)
// to review. Flags are created by the keyword scan in chatFlags.js
// — they never auto-ban anyone, never block a message, never delete
// one. Only the owner can list flags or mark one reviewed, and only
// he is alerted. Flags live in MongoDB with everything else, so
// they survive a Render restart. A global-chat flag has no room or
// message document (global messages live in GlobalChatMessage, not
// ChatMessage, so this ref cannot point at one), so both are
// optional; its roomName is "Global chat".
const ChatFlagSchema = new mongoose.Schema({
  message: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ChatMessage",
    required: false,
    default: null
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ChatRoom",
    required: false,
    default: null
  },
  roomName: {
    type: String,
    default: ""
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  senderUsername: {
    type: String,
    default: ""
  },
  text: {
    type: String,
    default: ""
  },
  reasons: {
    type: [String],
    default: []
  },
  reviewed: {
    type: Boolean,
    default: false
  },
  reviewNote: {
    type: String,
    default: ""
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

ChatFlagSchema.index({ reviewed: 1, createdAt: -1 });

module.exports = mongoose.model("ChatFlag", ChatFlagSchema);
