const mongoose = require("mongoose");

// DAW projects synced from Bangas-Only (trifecta full sync, Wesley,
// 25 Nov 2026). One project per (user, name) — a user saving a project
// with the same name again overwrites it, never duplicates it. This
// lives in its OWN collection, "daw_projects": no existing collection
// is ever read or written by the trifecta code.
const DawProjectSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    username: { type: String, required: true },
    name: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now }
  },
  { collection: "daw_projects" }
);

DawProjectSchema.index({ userId: 1, name: 1 }, { unique: true });

module.exports = mongoose.models.DawProject || mongoose.model("DawProject", DawProjectSchema);
