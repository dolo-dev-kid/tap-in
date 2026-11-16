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
  // Online presence: last time this account was seen connected.
  // Stored in MongoDB so it survives a Render restart. Live "online
  // now" state is kept in memory on the backend (socket counts) — see
  // the Socket.IO section. Never a location, only online / last seen.
  lastSeenAt: {
    type: Date,
    default: null
  },
  // Referral code (Wesley, Nov 15): every member gets one unique,
  // shareable code, e.g. DOLO45-K7Q2. It is how a new person finds
  // Tap In — they sign up from a friend's link and are automatically
  // friended with that friend. The code is public by design (it is
  // meant to be shared); it is NOT a password and never grants
  // access on its own. sparse + unique: accounts created before
  // referral codes get one on next login (backfill), never by
  // resetting anything.
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
    default: null
  },
  // Username of the member whose referral code this account signed
  // up with ("" when nobody referred them). Stored as a username,
  // like friends are — never an email or phone number.
  referredBy: {
    type: String,
    default: ""
  },
  friends: {
    type: [String],
    default: []
  },
  // Pending incoming friend requests. "Add Friend" sends a request
  // here — it does NOT instantly add anyone. The recipient sees the
  // request in their Friends tab (with Accept / Decline) and the
  // requester only becomes a friend once it is accepted.
  // Before this existed, adding a friend only wrote the name into
  // the sender's own list, so the other person never saw anything.
  friendRequests: [{
    username: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now }
  }],
  servers: {
    type: [String],
    default: []
  },
  // Social links — the member's own other platforms, pasted by the
  // member themself. Plain URL or handle strings only, never
  // auto-filled, never imported from anywhere. Shown to other
  // logged-in members only (publicUser / members), never to the
  // public web. No emails, no phones, no passwords here.
  socialLinks: {
    instagram: { type: String, default: "" },
    facebook: { type: String, default: "" },
    tiktok: { type: String, default: "" },
    youtube: { type: String, default: "" },
    soundcloud: { type: String, default: "" },
    bandlab: { type: String, default: "" },
    // Discord username or server invite link, pasted by the member
    // themself (16 Nov 2026). Never seeded, never invented.
    discord: { type: String, default: "" }
  },
  // Email — the member's own email, used ONLY for email verification
  // and admin two-factor codes. Never shown to other members: it is
  // never in publicUser / members / feed responses. Optional at
  // signup; a member adds it on Profile when they want the verified
  // checkmark. Lowercased, unique when set (sparse, so accounts
  // without an email are untouched).
  email: {
    type: String,
    default: "",
    lowercase: true,
    trim: true,
    sparse: true
  },
  // Email verification — via a 6-digit code sent to the email above.
  // verified = the checkmark shown next to the username. No ID
  // documents are ever collected. The owner (exact username Dolo45)
  // is verified by seed; every other member earns it by confirming
  // they own the email on their account. Admins can revoke the
  // badge (verified=false) but cannot grant it without email proof.
  emailVerified: { type: Boolean, default: false },
  verified: { type: Boolean, default: false },
  verificationStatus: {
    type: String,
    enum: ["none", "pending", "approved", "revoked"],
    default: "none"
  },
  // One-time codes are stored HASHED (sha256), never in plain text,
  // with a 15-minute expiry and a 5-attempt limit. A code is only
  // stored after an email was actually sent — when no email service
  // is configured, no code is issued and nothing can be confirmed.
  emailCodeHash: { type: String, default: "" },
  emailCodeExpiresAt: { type: Date, default: null },
  emailCodeAttempts: { type: Number, default: 0 },
  emailCodeSentAt: { type: Date, default: null },
  // Admin two-factor — a separate 6-digit code, same hashing/expiry
  // rules, sent to the admin's verified email at login.
  twoFactorCodeHash: { type: String, default: "" },
  twoFactorCodeExpiresAt: { type: Date, default: null },
  twoFactorCodeAttempts: { type: Number, default: 0 },
  twoFactorCodeSentAt: { type: Date, default: null },
  // Password reset — 6-digit code, hashed, 15-minute expiry,
  // one-time use. A code is only stored after an email was actually
  // sent; when no email service is configured, no code is issued.
  passwordResetCodeHash: { type: String, default: "" },
  passwordResetExpiresAt: { type: Date, default: null },
  passwordResetAttempts: { type: Number, default: 0 },
  passwordResetSentAt: { type: Date, default: null },
  // Owner approval gate (Wesley, Nov 16): a reset code is NEVER
  // emailed until Dolo45 approves the request in the Admin panel.
  // decidedBy is the admin username who approved/denied it.
  passwordResetRequest: {
    status: { type: String, enum: ["none", "pending", "approved", "denied"], default: "none" },
    requestedAt: { type: Date, default: null },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: String, default: "" }
  },
  // JWT token version — bumped on a successful password reset so
  // every token issued before the reset stops working. Tokens
  // issued before this field existed carry no version and match 0.
  tokenVersion: { type: Number, default: 0 },
  // Stream destinations (multistream out) — the streamer's OWN
  // RTMP ingest URLs + stream keys for other platforms (YouTube,
  // Facebook, Twitch, TikTok, Instagram). The key is stored
  // ENCRYPTED (AES-256-GCM, see server.js) and is NEVER returned by
  // any API, never logged, never in git. Only the account owner can
  // read their own destinations (masked). Tap In itself does NOT
  // restream — its video rooms are WebRTC peer-to-peer; to actually
  // broadcast out, the streamer runs OBS multistream / Restream with
  // these destinations (see STREAMING.md).
  streamDestinations: [{
    platform: { type: String, default: "" },
    rtmpUrl: { type: String, default: "" },
    keyEnc: { type: String, default: "" },
    keyLast4: { type: String, default: "" },
    enabled: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("User", UserSchema);