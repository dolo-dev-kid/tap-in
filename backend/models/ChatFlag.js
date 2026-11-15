const mongoose = require("mongoose");

// A safety flag on one chat message, for the owner (admin) to review.
// Flags are created by the keyword scan in chatFlags.js — they never
// auto-ban anyone and never block a message. Only an admin can list
// flags or mark one reviewed. Flags live in MongoDB with everything
// else, so they survive a Render restart.
const ChatFlagSchema = new mongoose.Schema({
  message: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ChatMessage",
    required: true
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ChatRoom",
    required: true
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
