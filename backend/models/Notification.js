const mongoose = require("mongoose");

// In-app notifications. Tap In had NO notification system at all
// before this — no bell, no badge, no alert for friend requests or
// messages — so a friend request could sit unseen forever. A
// notification is one row per recipient, stored in MongoDB so it
// survives a Render restart, and it is also pushed live over
// Socket.IO when the recipient is online.
const NotificationSchema = new mongoose.Schema({
  // Who sees this notification.
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  // friend_request | friend_accepted | friend_online | member_joined
  // | message | live
  type: {
    type: String,
    required: true
  },
  title: {
    type: String,
    default: ""
  },
  body: {
    type: String,
    default: ""
  },
  // Username of the person who caused it (requester / new friend /
  // message sender), when there is one.
  fromUsername: {
    type: String,
    default: ""
  },
  // Reference for acting on it: for a friend request this is the
  // requester's username; for a message this is the chat room id.
  refId: {
    type: String,
    default: ""
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Notification", NotificationSchema);
