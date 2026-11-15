// Rotating Dolo45 track feature for the Feed.
//
// One featured Dolo45 track, rotating to the next every 2 weeks (like a
// Jordan drop), in a fixed rotation through his catalog. The rotation is
// deterministic — same track for everyone, everywhere, for the whole
// 2-week window — computed from a fixed anchor date, so no database or
// server change is needed to rotate it.
//
// RULES (Wesley, Nov 2026):
// - Links out to his existing YouTube videos ONLY. Never re-upload the
//   audio, never register anything with Content ID, never make alternate
//   versions. "Baddest on the planet" is under a BandLab license with
//   those restrictions, so it only ever appears here as a YouTube link.
// - Start with a 100%-owned track, not Baddest.
// - This is a feed FEATURE, clearly labelled as Dolo45's music — never
//   a fake user post pretending a member posted it.

export const ROTATION_DAYS = 14;
export const ROTATION_ANCHOR = "2026-11-15";

export const FEATURED_ROTATION = [
  { title: "Ride With Me", youtubeId: "mpm_NKFR8Gw", note: "100% Dolo45" },
  { title: "31 Zones", youtubeId: "LvE7Yz4B0A8", note: "100% Dolo45" },
  { title: "Get N To Dis Money", youtubeId: "AjDz97tG7t0", note: "100% Dolo45" },
  { title: "Hood News", youtubeId: "mzf8HKpZQeg", note: "100% Dolo45" },
  { title: "Yellow Diamonds", youtubeId: "VXWEFUAQcN0", note: "100% Dolo45" },
  { title: "Love Can Get You Killed", youtubeId: "ALhUKUSltHg", note: "100% Dolo45" },
  { title: "Tuff Talkin", youtubeId: "sMHO4D209Cs", note: "100% Dolo45" },
  { title: "Im From Idlewild", youtubeId: "f_2Fe-20uww", note: "100% Dolo45" },
  { title: "Change", youtubeId: "h8engv5r4j0", note: "100% Dolo45" },
  { title: "My Block", youtubeId: "3tkhe1aMHSE", note: "100% Dolo45" },
  // BandLab-licensed — YouTube link only, never re-uploaded.
  { title: "Baddest on the planet", youtubeId: "GcskkcDKZ9o", note: "BandLab beat — watch on YouTube" },
  { title: "Boomin in da trap", youtubeId: "l47lCbfnQl8", note: "50/50 Dolo45 / BandLab" }
];

export function getFeaturedTrack(now = new Date()) {
  const anchor = new Date(`${ROTATION_ANCHOR}T00:00:00Z`);
  const days = Math.max(
    0,
    Math.floor((now.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24))
  );
  const rotationIndex = Math.floor(days / ROTATION_DAYS);
  const index = rotationIndex % FEATURED_ROTATION.length;
  const rotationStart = new Date(anchor.getTime() + rotationIndex * ROTATION_DAYS * 86400000);
  const rotationEnd = new Date(rotationStart.getTime() + ROTATION_DAYS * 86400000);
  const track = FEATURED_ROTATION[index];
  return {
    ...track,
    youtubeUrl: `https://youtu.be/${track.youtubeId}`,
    index,
    total: FEATURED_ROTATION.length,
    rotationStart,
    rotationEnd
  };
}
