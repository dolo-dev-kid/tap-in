const mongoose = require("mongoose");

// An uploaded file's metadata. The file bytes themselves live in
// MongoDB GridFS (bucket "uploads") — Render's disk is ephemeral, so
// nothing is stored on the server's filesystem. Every upload is tied
// to the logged-in member who posted it, so the owner (admin) can see
// who uploaded what and remove it.
const UploadSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  username: {
    type: String,
    required: true
  },
  // GridFS file id — the file is served at /uploads/<fileId>.
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  // "image" | "video" | "audio" | "file" — decides how the frontend renders it.
  kind: {
    type: String,
    enum: ["image", "video", "audio", "file"],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Upload", UploadSchema);
