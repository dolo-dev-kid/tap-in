import { useEffect, useState } from "react";
import axiosInstance from "../api/axios";

// Stream destinations — multistream OUT. The streamer saves their
// OWN RTMP URL + stream key per platform. Keys are encrypted on the
// server and NEVER come back to the browser (only platform, URL,
// enabled, and last-4). Tap In does NOT restream by itself — its
// video rooms are WebRTC; to actually broadcast out, the streamer
// copies these into OBS multistream or Restream and starts streaming
// there. See STREAMING.md in the repo. Nothing auto-broadcasts.
const PLATFORMS = [
  { key: "youtube", label: "YouTube", preset: "rtmp://a.rtmp.youtube.com/live2" },
  { key: "facebook", label: "Facebook", preset: "rtmps://live-upload.facebook.com:443/rtmp/" },
  { key: "twitch", label: "Twitch", preset: "rtmp://live.twitch.tv/app" },
  { key: "tiktok", label: "TikTok", preset: "" },
  { key: "instagram", label: "Instagram", preset: "rtmps://live-upload.instagram.com:443/rtmp/" },
  // Restream.io — ONE ingest URL + key in OBS, Restream pushes it out
  // to every platform you connected there. This is the one-key way
  // to broadcast out to all platforms at once.
  { key: "restream", label: "Restream (all platforms at once)", preset: "rtmp://live.restream.io/live" }
];

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("token") || ""}` };
}

export default function StreamDestinations() {
  const [destinations, setDestinations] = useState([]);
  const [platform, setPlatform] = useState("youtube");
  const [rtmpUrl, setRtmpUrl] = useState(PLATFORMS[0].preset);
  const [streamKey, setStreamKey] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await axiosInstance.get("/stream/destinations", { headers: authHeaders() });
      setDestinations(res.data?.destinations || []);
    } catch { /* destinations are a bonus */ }
  };
  useEffect(() => { load(); }, []);

  const pickPlatform = (key) => {
    setPlatform(key);
    const p = PLATFORMS.find((x) => x.key === key);
    setRtmpUrl(p?.preset || "");
  };

  const save = async () => {
    setBusy(true); setNote("");
    try {
      const res = await axiosInstance.post("/stream/destinations", { platform, rtmpUrl, streamKey, enabled }, { headers: authHeaders() });
      setDestinations(res.data?.destinations || []);
      setStreamKey("");
      setNote("Saved. Your key is encrypted on the server and is never shown again — to broadcast out, copy this destination into OBS multistream or Restream, then start streaming there and Go Live in Tap In.");
    } catch (err) {
      setNote(err.response?.data?.error || "Could not save that destination.");
    } finally { setBusy(false); }
  };

  const remove = async (key) => {
    try {
      const res = await axiosInstance.delete(`/stream/destinations/${key}`, { headers: authHeaders() });
      setDestinations(res.data?.destinations || []);
    } catch (err) {
      setNote(err.response?.data?.error || "Could not remove that destination.");
    }
  };

  return (
    <div style={{ marginTop: 20, background: "#1e1f22", padding: 20, borderRadius: 12 }}>
      <h2>📡 Broadcast out — Stream destinations</h2>
      <p style={{ marginTop: 8, color: "#aaa", fontSize: 14 }}>
        Save where your stream should go OUT to — YouTube, Facebook, Twitch, TikTok, Instagram,
        or Restream (all of them at once, with one key).
        Tap In does not restream by itself: copy these into OBS multistream or Restream and start
        streaming there, while you Go Live in Tap In too. Your stream key is encrypted and never
        shown in full — not even to you after you save it.
      </p>
      <div style={{ marginTop: 12, background: "#2b2d31", padding: 14, borderRadius: 8, fontSize: 13, color: "#ddd", lineHeight: 1.6 }}>
        <strong>📡 How to broadcast out to all platforms when you Go Live (one-time setup):</strong>
        <ol style={{ margin: "8px 0 0 18px" }}>
          <li>Create a free Restream.io account and connect your YouTube, Facebook, Twitch, TikTok and Instagram accounts there.</li>
          <li>In Restream, copy your RTMP URL + stream key, save it here as the “Restream” destination, and paste the same URL + key into OBS Studio (free) → Settings → Stream → Custom.</li>
          <li>Start streaming in OBS, then tap Go Live in Tap In. OBS/Restream pushes your video out to every platform, Tap In posts the go-live announcement to the Feed and DMs every member for you.</li>
        </ol>
        <span style={{ color: "#aaa" }}>Tap In can’t push video to other platforms by itself — its rooms are WebRTC. Restream/OBS is the real push-out, and no stream key is ever shown or stored in plain text here.</span>
      </div>
      {destinations.length === 0 ? (
        <p style={{ marginTop: 12, color: "#aaa", fontSize: 14 }}>No destinations saved yet.</p>
      ) : (
        destinations.map((d) => (
          <div key={d.platform} style={{ marginTop: 12, background: "#2b2d31", padding: 12, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>
              <strong>{d.platform}</strong> {d.enabled ? "· ✅ On" : "· ⏸ Off"} · key {d.hasKey ? `••••${d.keyLast4}` : "not saved"}
              <span style={{ color: "#aaa", fontSize: 12, display: "block" }}>{d.rtmpUrl || "No RTMP URL — paste one from that platform"}</span>
            </span>
            <button onClick={() => remove(d.platform)} style={{ padding: "8px 12px", borderRadius: 8, background: "#b3261e", color: "white", border: "none", cursor: "pointer" }}>Remove</button>
          </div>
        ))
      )}
      <div style={{ marginTop: 16 }}>
        <select value={platform} onChange={(e) => pickPlatform(e.target.value)} style={{ padding: 12, borderRadius: 8, border: "none", background: "#2b2d31", color: "white", marginRight: 10 }}>
          {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <input value={rtmpUrl} onChange={(e) => setRtmpUrl(e.target.value)} placeholder="RTMP URL — rtmp://… (TikTok: paste the one TikTok gives you)" style={{ padding: 12, borderRadius: 8, border: "none", background: "#2b2d31", color: "white", marginRight: 10, width: 320, maxWidth: "100%", marginTop: 8 }} />
        <input value={streamKey} onChange={(e) => setStreamKey(e.target.value)} placeholder="Stream key — paste from that platform (never shown again)" type="password" style={{ padding: 12, borderRadius: 8, border: "none", background: "#2b2d31", color: "white", marginRight: 10, width: 260, maxWidth: "100%", marginTop: 8 }} />
        <label style={{ color: "#aaa", fontSize: 13, marginRight: 10 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> On
        </label>
        <button onClick={save} disabled={busy} style={{ padding: "12px 20px", borderRadius: 8, background: "#00eaff", border: "none", cursor: "pointer", fontWeight: "bold", color: "black", marginTop: 8 }}>Save destination</button>
      </div>
      {note && <p style={{ marginTop: 10, color: "#ffce54", fontSize: 13 }}>{note}</p>}
    </div>
  );
}
