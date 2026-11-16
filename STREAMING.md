# Tap In — Multistream / Broadcast Out

## What happens automatically when Dolo45 goes live (16 Nov 2026)

When the OWNER (exact username `Dolo45` only — never another admin,
never the banned lowercase `dolo45`) taps Go Live in Tap In, Tap In
automatically does the in-app broadcast, server-side:
- a **Feed post** — "🔴 I'M LIVE on Tap In right now! Time to tap in! …"
- a **1-to-1 DM with the same text to every non-banned member**
- the usual **"just went live" alert** to every member
- the Stream Dashboard / video room shows **"Broadcasting to: …"**
  with the owner's enabled destinations, and what the auto-post did
  (Feed post ✅ · DMs to N members)

A reconnect / double-tap on Go Live never repeats the Feed post or
the DMs — same text within 10 minutes is skipped. Anyone else going
live gets only the "just went live" alert, no Feed post, no DMs.

## What Tap In can and cannot do

Tap In's video rooms are **WebRTC peer-to-peer** — your camera goes
straight to the people in the room, inside Tap In. There is no RTMP
server in this repo, so **Tap In cannot push a live feed to YouTube,
Facebook, Twitch, TikTok, or Instagram by itself**. Any app that
claims to do that without a restream server is faking it. Tap In also
**does not post to Facebook / Instagram / TikTok / YouTube / Twitch
from its backend** — it holds no posting credentials for those
platforms and has no API path to do it. The go-live announcement to
those platforms is posted by Muse / Wesley (Facebook, Page,
Instagram, TikTok) — not by Tap In itself.

## How to actually broadcast out (the real way)

### One-time setup — Restream (the one-key way, recommended)

1. **Create a free Restream.io account** (Wesley does this himself
   — no account is created for him, no password goes in Tap In or
   in git). Connect his YouTube, Facebook, Twitch, TikTok and
   Instagram accounts inside Restream.
2. **In Restream, copy the single RTMP URL + stream key**
   (`rtmp://live.restream.io/live`). In Tap In, go to Stream
   Dashboard → "Broadcast out / Stream destinations", pick
   **Restream**, paste that URL + key, and save it. The key is
   encrypted on the server, never shown in full, never logged,
   never in git. Only Wesley can see his own destinations.
3. **In OBS Studio (free, on Wesley's computer):** Settings →
   Stream → Service: Custom, paste the same Restream RTMP URL +
   key. That is the only key OBS needs — Restream pushes the feed
   out to every platform connected in step 1.

### Every time he goes live

1. **Start streaming in OBS** (one button — Restream pushes the
   video out to YouTube, Facebook, Twitch, TikTok, Instagram).
2. **Tap Go Live in Tap In** — join a video room. Tap In members
   see him live in-app, and Tap In automatically posts the Feed
   post + DMs every member (see above).
3. **External posts** (Facebook, Page, Instagram, TikTok) are
   posted by Muse / Wesley with the go-live text — Tap In itself
   does not post to those platforms.

### Without Restream — OBS multistream

Save each platform's own destination in Tap In instead (YouTube,
Facebook, Twitch, TikTok, Instagram — paste each RTMP URL + key
from that platform), then in OBS use Multiple Outputs / the
multistream plugin (or OBS 30+ multi-output) to add them all.

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
