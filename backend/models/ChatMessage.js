const mongoose = require("mongoose");

// One message in a private chat room. Stored in MongoDB, so chat
// history survives Render restarts. `flagged` means the safety scan
// (see chatFlags.js) matched a high-risk pattern — it is a flag for the
// owner's review only, never an auto-ban and never a block.
const ChatMessageSchema = new mongoose.Schema({
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ChatRoom",
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  senderUsername: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true,
    maxlength: 1000
  },
  flagged: {
    type: Boolean,
    default: false
  },
  flagReasons: {
    type: [String],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

ChatMessageSchema.index({ room: 1, createdAt: 1 });

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
