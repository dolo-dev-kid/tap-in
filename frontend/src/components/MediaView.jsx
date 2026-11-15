import { mediaUrl } from "../api/upload";

// Renders an attached upload inside a post (or anywhere else).
// Images show inline, videos and audio get a player, other files get a
// download link. `media` is { url, filename, mimeType, kind }.
export default function MediaView({ media }) {
  if (!media || !media.url) return null;
  const src = mediaUrl(media.url);
  const kind = media.kind || "file";

  if (kind === "image") {
    return (
      <img
        src={src}
        alt={media.filename || "Uploaded photo"}
        style={{ maxWidth: "100%", maxHeight: 400, borderRadius: 8, marginTop: 10, display: "block" }}
      />
    );
  }
  if (kind === "video") {
    return (
      <video
        src={src}
        controls
        preload="metadata"
        style={{ maxWidth: "100%", maxHeight: 400, borderRadius: 8, marginTop: 10, display: "block" }}
      />
    );
  }
  if (kind === "audio") {
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ color: "#aaa", fontSize: 13, marginBottom: 6 }}>
          🎵 {media.filename || "Audio"}
        </div>
        <audio src={src} controls preload="metadata" style={{ width: "100%" }} />
      </div>
    );
  }
  return (
    <div style={{ marginTop: 10 }}>
      <a
        href={src}
        download={media.filename || undefined}
        target="_blank"
        rel="noreferrer"
        style={{ color: "#00eaff", fontSize: 14 }}
      >
        📎 {media.filename || "Download file"}
      </a>
    </div>
  );
}
