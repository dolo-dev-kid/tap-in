// Keyword safety scan for private chats — no external service, no
// paid API, no new keys. It runs on every private message the backend
// saves. A match only FLAGS the message for the OWNER (exact Dolo45)
// to review in the Admin panel, and alerts only him: it never blocks
// the message, never filters it, never auto-bans anyone, and never
// shows private messages to other admins or non-admins. The message
// is always saved and delivered FIRST — the scan runs after, so a
// flag can never stop someone talking. Wesley screens private chats
// himself; the monitor is alert-only.
//
// Categories are the ones Wesley named: grooming / sexual content
// involving minors, threats of violence, drug dealing, and planning
// a murder. Patterns are deliberately phrase-based (not single common
// words) to keep false flags low — a flag is still only a "look at
// this", and the owner decides what it means.
const FLAG_PATTERNS = [
  {
    category: "minor-sexual",
    label: "Possible grooming / sexual content involving a minor",
    patterns: [
      /send (me )?(a )?nude/i,
      /nude pic/i,
      /naked pic/i,
      /take your clothes off/i,
      /undress( for me)?/i,
      /meet (me )?alone/i,
      /don'?t tell your (mom|dad|parents|mommy|daddy)/i,
      /keep (this|it) (a )?secret/i,
      /how old are you/i,
      /what'?s your age/i,
      /are you a virgin/i,
      /sex with you/i,
      /have sex with/i,
      /touch you (there|like that)/i,
      /send (me )?(a )?pic of (you|yourself) (naked|nude|without)/i
    ]
  },
  {
    category: "threat",
    label: "Threat of violence",
    patterns: [
      /i('ll| will) (kill|hurt|shoot|stab|beat) you/i,
      /(i'?m gonna|i am going to) (kill|hurt|shoot|stab) you/i,
      /kill you/i,
      /shoot you/i,
      /stab you/i,
      /beat you up/i,
      /i'?m coming for you/i,
      /watch your back/i,
      /hurt (your|yo) (family|kids|mom|dad)/i
    ]
  },
  {
    category: "drugs",
    label: "Possible drug dealing",
    patterns: [
      /sell(ing)? (coke|crack|heroin|meth|dope|weed|pills)/i,
      /(coke|crack|heroin|meth|dope|weed|pills) for sale/i,
      /buy (coke|crack|heroin|meth|dope)/i,
      /ounce of (weed|coke|crack)/i,
      /pound of (weed|coke)/i,
      /got (coke|crack|heroin|meth|dope) for sale/i,
      /plug (got|has) (weed|coke)/i
    ]
  },
  {
    category: "murder",
    label: "Possible planning of a murder / violent hit",
    patterns: [
      /kill (him|her|them|that (guy|man|boy|girl))/i,
      /murder (him|her|them)/i,
      /plan to kill/i,
      /(gonna|going to) kill (him|her|them)/i,
      /put a hit on/i,
      /hit on (him|her|them)/i,
      /shoot (him|her|them)/i,
      /body (him|her|them)/i,
      /get rid of (him|her|them|the body)/i
    ]
  }
];

// Returns an array of { category, label } — empty when nothing matches.
function scanChatMessage(text) {
  if (!text || typeof text !== "string") return [];
  const found = [];
  for (const group of FLAG_PATTERNS) {
    if (group.patterns.some((re) => re.test(text))) {
      found.push({ category: group.category, label: group.label });
    }
  }
  return found;
}

module.exports = { scanChatMessage, FLAG_PATTERNS };
