// My Merch — Dolo45's merch showcase.
// There are NO real merch products, prices or store links yet (checked
// the whole repo — nothing exists to link to), so nothing is invented
// here: this is a bold, finished-looking "first drop coming soon" hero.
// When Wesley has real products, replace the coming-soon copy + button
// with the real shop link and product cards. Do NOT add a fake price,
// a fake checkout, or a link to a store that does not exist.
//
// Photos are Wesley's own, real photos — his Instagram profile pic
// (@nho_life_dolo45) and two photos he sent in chat of himself
// recording in his home booth in Pittsburgh. No generated images,
// no stock photos, no other people's photos.
const PHOTOS = [
  { src: "/dolo45-ig.jpg", alt: "Dolo45 — Instagram profile pic (@nho_life_dolo45)", caption: "Dolo45" },
  { src: "/dolo45-booth-1.jpg", alt: "Dolo45 recording in his home booth, Pittsburgh", caption: "In the booth — home setup, Pittsburgh" },
  { src: "/dolo45-booth-2.jpg", alt: "Dolo45 recording in his home booth, Pittsburgh", caption: "In the booth — home setup, Pittsburgh" }
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
          src="/dolo45-ig.jpg"
          alt="Dolo45 — Instagram profile pic"
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
          📸 PICS OF DOLO45 — straight from the booth
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
              <figcaption style={{ marginTop: 6, fontSize: 13, color: "#ccc" }}>
                {p.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
