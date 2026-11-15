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
    required: true,
    maxlength: 500
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Post", PostSchema);
