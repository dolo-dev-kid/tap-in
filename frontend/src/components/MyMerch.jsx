import { DOLO45_STUDIO_AI_1, DOLO45_STUDIO_AI_2, DOLO45_STUDIO_AI_AVATAR } from "../data/dolo45Photos";

// My Merch — Dolo45's merch showcase.
// There are NO real merch products, prices or store links yet (checked
// the whole repo — nothing exists to link to), so nothing is invented
// here: this is a bold, finished-looking "first drop coming soon" hero.
// When Wesley has real products, replace the coming-soon copy + button
// with the real shop link and product cards. Do NOT add a fake price,
// a fake checkout, or a link to a store that does not exist.
//
// Photos are the studio pics Muse created — recording booth,
// Pittsburgh skyline. Wesley said 16 Nov 2026 he never sent the
// real photos, so his real Instagram profile pic and the real booth
// photos he sent in chat were REMOVED from Tap In and replaced with
// these studio pics. No real uploaded photos, no stock photos,
// no other people's photos.
const PHOTOS = [
  { src: DOLO45_STUDIO_AI_1, alt: "Dolo45 — recording booth, Pittsburgh skyline at night" },
  { src: DOLO45_STUDIO_AI_2, alt: "Dolo45 — recording booth, Pittsburgh skyline at dusk" }
];

export default function MyMerch() {
  return (
    <div
      style={{
        marginTop: 32,
        background: "linear-gradient(135deg, #1e1f22 0%, #3a0d2e 55%, #7b2fff 100%)",
        border: "2px solid #00eaff",
        borderRadius: 16,
        padding: 24,
        maxWidth: 860
      }}
    >
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
        <img
          src={DOLO45_STUDIO_AI_AVATAR}
          alt="Dolo45"
          style={{
            width: 120,
            height: 120,
            borderRadius: "50%",
            objectFit: "cover",
            border: "3px solid #00eaff",
            flexShrink: 0
          }}
        />
        <div style={{ flex: "1 1 280px" }}>
          <div style={{ color: "#00eaff", fontSize: 13, fontWeight: "bold", letterSpacing: 2 }}>
            🛍️ OFFICIAL — DOLO45
          </div>
          <h2 style={{ margin: "8px 0 0", fontSize: 34, lineHeight: 1.1 }}>MY MERCH</h2>
          <p style={{ marginTop: 10, fontSize: 16, color: "#eee" }}>
            Dolo45 merch. Straight from the booth to you — tees, hoodies and
            more, stamped Dolo45.
          </p>
          <p style={{ marginTop: 8, fontSize: 15, color: "#ffce54", fontWeight: "bold" }}>
            🔥 First drop coming soon — stay tapped in. Nothing on sale yet;
            this is where the shop drops.
          </p>
          <a
            href="#/feed"
            style={{
              display: "inline-block",
              marginTop: 14,
              padding: "12px 28px",
              borderRadius: 10,
              background: "#00eaff",
              color: "black",
              fontWeight: "bold",
              textDecoration: "none"
            }}
          >
            Stay tapped in — join the Feed
          </a>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 14, fontWeight: "bold", color: "#00eaff", marginBottom: 10 }}>
          📸 PICS OF DOLO45
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {PHOTOS.map((p) => (
            <figure key={p.src} style={{ margin: 0, width: 220, maxWidth: "100%" }}>
              <img
                src={p.src}
                alt={p.alt}
                style={{
                  width: "100%",
                  height: 260,
                  objectFit: "cover",
                  borderRadius: 12,
                  border: "1px solid #444",
                  display: "block"
                }}
              />
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
