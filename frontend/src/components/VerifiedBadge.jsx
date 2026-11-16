export default function VerifiedBadge({ verified, size = 14 }) {
  if (!verified) return null;
  return (
    <span
      title="Verified — this member confirmed their email with Tap In"
      aria-label="Verified account"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size + 4,
        height: size + 4,
        borderRadius: "50%",
        background: "#00eaff",
        color: "#0f0f0f",
        fontSize: size,
        fontWeight: "bold",
        lineHeight: 1,
        marginLeft: 5,
        verticalAlign: "middle",
        flexShrink: 0
      }}
    >
      ✓
    </span>
  );
}
