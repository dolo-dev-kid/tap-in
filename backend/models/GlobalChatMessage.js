const mongoose = require("mongoose");

// One message in the GLOBAL chat room. Stored in MongoDB, so global
// history survives Render restarts and spin-downs — global chat used
// to be broadcast-only and vanished on every reload / disconnect.
//
// WESLEY'S RULE (18 Nov 2026): global chat holds the LAST 100
// messages. After 100, the OLDEST message is deleted as new ones
// come in. That is the ONLY deletion allowed for global chat —
// never erase global chat otherwise. There is NO TTL on this model,
// NO delete endpoint for it, and NO other auto-trim anywhere.
// The cap is enforced in server.js (trimGlobalChat) right after
// each save; nothing else in the codebase may delete these rows.
//
// `flagged` means the safety scan matched a high-risk pattern —
// it is a flag for the owner's review only, never an auto-ban and
// never a block. The message is always saved and broadcast first.
const GlobalChatMessageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
    default: null
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

// Oldest-first lookups (history endpoint + oldest-trim) both use
// createdAt; _id breaks ties when two messages share a timestamp.
GlobalChatMessageSchema.index({ createdAt: 1, _id: 1 });

module.exports = mongoose.model("GlobalChatMessage", GlobalChatMessageSchema);
