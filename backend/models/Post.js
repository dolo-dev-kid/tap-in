const mongoose = require("mongoose");

// A feed post. Posts are real user content stored in MongoDB — never
// sample/template posts. The username is denormalized at creation so the
// feed can render without joining back to the user.
const PostSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  username: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: false,
    default: "",
    maxlength: 500
  },
  // Post kind. "post" is a normal member post; "welcome-share" is the
  // one-per-member post created when a member shares Tap In (Wesley,
  // 19 Nov 2026) — it shows in the global Welcome feed on the landing
  // page, and in the in-app Feed like any other post. The backend
  // creates at most one welcome-share post per member.
  kind: {
    type: String,
    enum: ["post", "welcome-share"],
    default: "post"
  },
  // Invite link carried by a welcome-share post (the member's referral
  // link, or the plain app link). Empty for normal posts.
  link: {
    type: String,
    required: false,
    default: ""
  },
  // Optional attached upload (photo, video, audio or file). The media
  // snapshot is copied at post time so the feed renders without a join;
  // the bytes live in GridFS and the upload is owned by userId, so the
  // owner (admin) can trace and remove it.
  media: {
    uploadId: { type: mongoose.Schema.Types.ObjectId, ref: "Upload" },
    url: { type: String, default: "" },
    filename: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    kind: {
      type: String,
      enum: ["image", "video", "audio", "file"],
      default: "file"
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Post", PostSchema);
