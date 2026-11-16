# Tap In — Multistream / Broadcast Out

## What Tap In can and cannot do

Tap In's video rooms are **WebRTC peer-to-peer** — your camera goes
straight to the people in the room, inside Tap In. There is no RTMP
server in this repo, so **Tap In cannot push a live feed to YouTube,
Facebook, Twitch, TikTok, or Instagram by itself**. Any app that
claims to do that without a restream server is faking it.

## How to actually broadcast out (the real way)

1. **Save your destinations in Tap In** — Stream Dashboard →
   "Broadcast out / Stream destinations". Pick a platform, paste
   its RTMP ingest URL and your stream key from that platform.
   Keys are encrypted on the server, never shown in full, never
   logged, never in git. Only you can see your own destinations.
2. **Use OBS Studio (free) multistream, or Restream.io:**
   - **OBS:** Settings → Stream → Service: Custom, paste the RTMP
     URL + key for one platform; then use the **Multiple Outputs**
     / multistream plugin (or OBS 30+ multi-output) to add the
     others. Start streaming in OBS.
   - **Restream.io:** create a free Restream account, add your
     YouTube / Facebook / Twitch / TikTok channels there, copy the
     single Restream RTMP URL + key into OBS once — Restream pushes
     it out to all of them.
3. **Go live in Tap In too** — join a video room and tap Go Live,
   so Tap In members see you live while the same stream goes out
   to the other platforms from OBS/Restream.

## Platform notes

- **YouTube:** YouTube Studio → Go Live → Stream → copy Stream key.
  RTMP URL: `rtmp://a.rtmp.youtube.com/live2`
- **Facebook:** Meta Live Producer → copy Stream key.
  RTMP URL: `rtmps://live-upload.facebook.com:443/rtmp/`
- **Twitch:** Creator Dashboard → Settings → Stream → copy Primary
  Stream key. RTMP URL: `rtmp://live.twitch.tv/app`
- **TikTok:** TikTok Live Studio / LIVE Center gives an RTMP URL +
  key per stream (it changes — update it in Tap In each time).
- **Instagram:** Instagram Live Producer (desktop) gives an RTMP
  URL + key per stream; it also changes per stream.

## What is NOT in this repo

- No RTMP server, no Owncast, no Restream account, no OBS config.
  If Wesley wants Tap In itself to restream (no OBS on his
  computer), the next step is a hosted restream service
  (Restream.io, or an Owncast server on Render) — a separate
  service, a separate cost, and Wesley's decision. Nothing here
  auto-broadcasts anywhere: a destination only matters when the
  streamer turns it on and starts their own OBS/Restream feed.
