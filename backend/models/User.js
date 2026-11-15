const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  // Owner moderation for Tap In. "user" is a regular member; "admin" is
  // the owner (Wesley / Dolo45) and can see and moderate every account.
  // This is moderation for the owner's own app only — it is not a bypass
  // for anyone else's account, and it never exposes passwords.
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user"
  },
  // Banned accounts cannot log in. Only an admin can set/clear this.
  banned: {
    type: Boolean,
    default: false
  },
  bio: {
    type: String,
    default: ""
  },
  avatar: {
    type: String,
    default: ""
  },
  // MySpace-style profile song: one of the member's own uploaded audio
  // files (MP3/WAV). Plays when someone opens this profile. The snapshot
  // is copied at pick time; the bytes live in GridFS under the upload.
  profileSong: {
    uploadId: { type: mongoose.Schema.Types.ObjectId, ref: "Upload" },
    url: { type: String, default: "" },
    filename: { type: String, default: "" },
    mimeType: { type: String, default: "" }
  },
  friends: {
    type: [String],
    default: []
  },
  servers: {
    type: [String],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("User", UserSchema);