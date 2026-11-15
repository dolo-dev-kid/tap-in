// Username lookup that tolerates how real people type — and how they
// signed up.
//
// ROOT CAUSE (Eatmyass68, found 15 Nov 2026): every member lookup in
// the app did an exact, case-sensitive MongoDB match
// (`User.findOne({ username })`), while signup NEVER trimmed the
// username. So an account whose stored name differs from the visible
// name by case ("EatMyAss68" vs "Eatmyass68") or by invisible
// whitespace / a zero-width character (e.g. "Eatmyass68 " with a
// trailing space, which the browser renders identically) shows up
// fine in Find (that search is a case-insensitive regex) and in
// Admin — but "Start a private chat" answers "No member with that
// username" for every spelling anyone tries, including the exact
// visible one. The same exact-match lookups also broke friend
// requests, group adds and the online-friend scan for that member.
//
// This helper fixes the lookup instead of renaming anyone's account:
//   1. exact match first — so "Dolo45" and the banned lowercase
//      "dolo45" stay two different accounts, and ADMIN_USERNAME
//      case-sensitivity is untouched;
//   2. case-insensitive exact match;
//   3. a normalised scan (all whitespace and zero-width characters
//      stripped, lowercased) — only when it matches exactly ONE user.
//      Ambiguous names (two accounts that normalise the same) return
//      null instead of picking the wrong person.

function normalizeUsername(name) {
  return String(name || "")
    .replace(/[\s\u200b-\u200d\u2060\ufeff\u202a-\u202e]+/g, "")
    .toLowerCase();
}

function sameUsername(a, b) {
  const na = normalizeUsername(a);
  return na !== "" && na === normalizeUsername(b);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findUserByUsername(User, name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return null;
  const exact = await User.findOne({ username: trimmed });
  if (exact) return exact;
  const ci = await User.find({
    username: { $regex: `^${escapeRegExp(trimmed)}$`, $options: "i" }
  }).select("_id");
  if (ci.length === 1) return User.findById(ci[0]._id);
  if (ci.length > 1) return null; // ambiguous — never guess
  const wanted = normalizeUsername(trimmed);
  const all = await User.find({}).select("_id username");
  const matches = all.filter((u) => normalizeUsername(u.username) === wanted);
  if (matches.length !== 1) return null; // none, or ambiguous
  return User.findById(matches[0]._id);
}

// Signup guard: is this name taken in ANY form — exact, case, or
// whitespace/zero-width drift? Unlike findUserByUsername, ambiguity
// still counts as taken: a new "DOLO45" must not slip in beside the
// grandfathered "Dolo45" and "dolo45" accounts.
async function usernameTaken(User, name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return false;
  if (await User.findOne({ username: trimmed })) return true;
  if (await User.findOne({ username: { $regex: `^${escapeRegExp(trimmed)}$`, $options: "i" } })) return true;
  const wanted = normalizeUsername(trimmed);
  const all = await User.find({}).select("username");
  return all.some((u) => normalizeUsername(u.username) === wanted);
}

module.exports = { normalizeUsername, sameUsername, escapeRegExp, findUserByUsername, usernameTaken };
