const mongoose = require("mongoose");

// A private chat room: either a 1-to-1 DM or a named private group.
// Rooms and their messages live in MongoDB (Atlas) — never in memory
// only and never on Render's disk — so a Render restart or spin-down
// never loses anyone's chats. Only members can see or join a room; the
// owner (admin) can review rooms for safety, nothing else.
const ChatRoomSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["dm", "group"],
    required: true
  },
  // Group name (groups only). DMs have no name — the frontend shows the
  // other member's username instead.
  name: {
    type: String,
    default: ""
  },
  // DMs only: "<smaller user id>_<larger user id>" — deterministic, so
  // there is exactly one DM thread per pair of people.
  dmKey: {
    type: String,
    default: ""
  },
  members: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  ],
  // Denormalized usernames so room lists render without a join.
  memberUsernames: {
    type: [String],
    default: []
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// One DM thread per pair: dmKey is unique when set.
ChatRoomSchema.index({ dmKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("ChatRoom", ChatRoomSchema);
