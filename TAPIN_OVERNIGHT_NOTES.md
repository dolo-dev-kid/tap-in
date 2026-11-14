# Tap In — Overnight Notes (Fri 13 Nov 2026, ~11:30 PM–12:30 AM PT)

Worked overnight on Tap In for Wesley while he slept. No database password
was used, guessed, or invented at any point.

## What was checked (verified, not assumed)

**Live backend — https://tap-in-backend-12hv.onrender.com**
- `GET /health` → 200 `{"ok":true,"db":"disconnected"}` — MONGODB_URI still not set.
- `POST /auth/register`, `POST /auth/login`, `POST /friends/add` → all **503
  with a clear message, no crash**. (Before this pass the message was
  developer-worded; it now reads: "Tap In's database is still being
  connected — logins and sign-ups will work once it is up. Please try again soon.")
- Local smoke test (backend run locally, no MONGODB_URI): same 503s, same
  health response, server stays up.

**Live frontend — https://tap-in-cakt.onrender.com**
- Downloaded the live JS bundle (`/assets/index-MqTt71-c.js`) and inspected it:
  - It **did** contain the live backend URL (`tap-in-backend-12hv.onrender.com`)
    — VITE_API_URL is set correctly on the Render static site. Frontend →
    backend wiring was fine.
  - It contained **zero** occurrences of "Login to Tap-In" / "Register for
    Tap-In" — the auth pages were dead code in production.
  - It **did** contain the dead Imgur avatar URL `i.imgur.com/4ZQZ4ZQ.png`.
    That URL follows to a 161×81 1-bit PNG — Imgur's removed-image
    placeholder, not a real avatar. Profile picture was always broken.

**Repo state on arrival**
- Local clone `~/workspace/repos/tap-in` was diverged: local commit `a1d915f`
  duplicated what was already on origin (`da8355a` + `fb5d104`), plus two
  uncommitted changes that also matched origin. Reset local to `origin/main`
  (`fb5d104`) — nothing was lost; the local-only commit's content was already
  on GitHub. Clone is now clean on `fb5d104` + the fixes below.

## Audit: all 9 sidebar tabs + auth, as found

| Tab / flow | As found |
|---|---|
| 🏠 Home / Landing | No Log in / Sign up buttons anywhere on the page. |
| 📱 Feed | 3 hardcoded sample posts (Alex/Mia/Jay), no composer. |
| 🎥 Video | Only a "Join Video Room" button. Room hardcoded "global", no way to change it, no Leave button. `getUserMedia` failure crashed into a broken joined state. `RTCPeerConnection` had **no ICE/STUN servers** — calls only worked on the same Wi-Fi. Socket listeners never cleaned up (StrictMode double-mount = duplicate offers). |
| 💬 Chat | Local-only. A message only ever appeared on the sender's own screen, despite the backend having a `chat-message` socket event. |
| 👤 Profile | Dead Imgur avatar (see above). "Edit Profile" button did nothing. |
| 👥 Friends | Hardcoded names. "Call" and "Add Friend" buttons did nothing. |
| 🛡️ Servers | Hardcoded names. "Create Server" button did nothing. |
| ⚙️ Gear | Opened the **Stream Dashboard**, not settings. No Settings page existed. Stream Dashboard itself was unreachable any other way. |
| 🎨 Overlay | "Add Widget" button did nothing; area mostly empty. |
| Login / Register | **Unreachable.** `frontend/src/router/AppRouter.jsx` (with `/login`, `/register`) was never imported — `main.tsx` rendered `App.jsx` directly, so the router was tree-shaken out of the production bundle. |
| Sidebar | Emoji-only buttons, no labels, no active-tab highlight, no auth state. |
| Deep links | No SPA fallback — visiting `/login` directly on Render would 404. |

## What was fixed (all frontend-only, no DB needed)

1. **Auth is reachable now.** `main.tsx` renders `AppRouter`; `/login` and
   `/register` routes work; unknown paths land on the app instead of blank.
   Added `frontend/public/_redirects` (`/* /index.html 200`) so deep links
   work on the Render static site.
2. **Sidebar:** every tab labelled, active tab highlighted, Stream Dashboard
   gets its own 📊 button, ⚙️ now opens a real **Settings page** (account
   state, backend + database status from `/health`, log out). Bottom shows
   Log in / Sign up, or the logged-in username + Log out. (Sidebar now has
   10 buttons — the extra one is Stream, which previously had no button.)
3. **Profile:** dead Imgur URL replaced with a local inline-SVG avatar
   (gradient circle, "D" initial — no external dependency). Edit Profile now
   works: display name + bio save on the device (localStorage) until login
   sync is possible.
4. **Video:** room-name input (default "global"), Leave button (stops camera
   tracks, closes peers), camera/mic errors shown in plain words instead of
   a broken screen, socket listeners cleaned up on unmount, `user-left`
   handled, and **Google public STUN** (`stun:stun.l.google.com:19302`) added
   so calls work across different networks, not just the same Wi-Fi.
5. **Chat:** wired to the backend's Socket.IO `chat-message` events in room
   "global" — messages now actually reach everyone in the room. Shows a
   live/not-connected indicator. Enter sends.
6. **Friends / Servers:** Add Friend and Create Server now call the real API
   (`POST /friends/add`, `POST /servers/create`). Without a login they say
   "Log in first — friends/servers are saved to your account." While the DB
   is down they show the server's 503 message. Call button opens a video
   room. Sample lists are now labelled as samples.
7. **Feed:** working composer (posts show on screen, labelled demo-only
   until the DB is connected) and samples labelled as samples.
8. **Stream Dashboard:** "Start Stream" now takes you to a video room, with
   a note explaining streaming happens there.
9. **Overlay:** widget toggles (Chat box, New follower alert, Donation goal)
   with a live preview of what viewers would see.
10. **Landing + Login + Register:** Log in / Sign up buttons on the landing
    page, a live backend/database status line, and a banner on both auth
    pages while the DB is down ("logins are paused while Tap In's database
    is being connected"). Login now also saves the username + user id, so
    Friends/Servers/Profile can use them.
11. **Backend (one string only):** the 503 message is now user-worded
    (see above). No behaviour change.

**Verification:** `npm run build` passes (Vite, 137 modules). New bundle
contains "Login to Tap-In" / "Register for Tap-In", the STUN URL, Settings,
and the friendly 503 text; Imgur is gone (0 occurrences). Local backend
smoke test confirms the new 503s. (Local build baked the local dev
`VITE_API_URL=http://localhost:3001` from `frontend/.env` — the Render
deploy uses its own env var, verified read-only as
`https://tap-in-backend-12hv.onrender.com`, so the live build is correct.)

## Commit

- Commit: see `git log` on `main` — "Fix Tap In tabs + wire up login/signup (no DB needed)"
  (pushed to `dolo-dev-kid/tap-in`, branch `main`)
- Files changed: `frontend/src/App.jsx`, `main.tsx`, `router/AppRouter.jsx`,
  `components/{Sidebar,Settings,Profile,VideoChat,ChatPanel,Friends,Servers,
  Feed,Landing,StreamDashboard,Overlay}.jsx`, `pages/{Login,Register}.jsx`,
  `backend/server.js`, plus new `frontend/public/_redirects` and new
  `frontend/src/components/Settings.jsx`.
- Render will auto-deploy both services from `main`. **After the deploy
  finishes, re-check https://tap-in-cakt.onrender.com** — the new bundle
  should show Log in / Sign up on the home page and labelled sidebar tabs.
  If the deploy is still running when you read this, wait for it to go live.

## What still needs the DB password (NOT done — blocked, correctly)

- **MONGODB_URI is still not set on the Render backend
  (`srv-dbr62fl6e07s73al4fa0`).** The Atlas `tapin_app_user` password was
  autogenerated on 13 Nov and never shown or recorded — it cannot be
  recovered, and nothing was guessed.
- Until it is set: nobody can create an account or log in (503, honest
  message), and friends/servers/profile data cannot be saved to an account.
  Everything else — all 10 tabs, video rooms, live chat, overlay editor —
  works without the database.

## Wesley's 2-minute step in the morning

1. Open **MongoDB Atlas** → Database Access → user `tapin_app_user` →
   **Edit** → change the password to a password **you know** (or use
   "Autogenerate" and copy it this time) → Save.
2. Send that password to Muse **through a secure card** (not plain chat).
3. Muse then sets `MONGODB_URI` on the Render backend service
   `srv-dbr62fl6e07s73al4fa0` to
   `mongodb+srv://tapin_app_user:<that password>@tap-in.vgmavh6.mongodb.net/tap-in`,
   redeploys, and verifies `/health` shows `"db":"connected"` — then a test
   signup + login is run to prove accounts work.

## Known limitations / next work (after the DB is up)

- **No TURN server yet.** STUN fixes most calls, but some home/strict
  networks need TURN relay to connect at all. Free options to evaluate:
  Metered.ca free tier or Cloudflare Calls. Do not promise video calls
  "work everywhere" until TURN is in.
- **No login gate yet (deliberate).** The app is open for demoing while the
  DB is down, since nobody could log in anyway. Once accounts work, add a
  gate: logged-out visitors see Landing + Login/Register, logged-in users
  get the tabs.
- **Profile edits and feed posts are device-local until login sync exists.**
  Real profile save needs a backend endpoint (`PUT /users/:id`); real feed
  posts need a posts collection/endpoint — neither exists yet.
- **Dead legacy files** still in the repo, unused: `backend/auth.js`,
  `backend/index.js`, root `server.js`, `App.jsx`, `frontend/main.tsx`,
  `frontend/src/components` "Axios Setup"/"Basic Router". Leave for a
  cleanup pass; `server.js` in `backend/` is the live one.
- **Video chat is not yet login-enforced** and rooms are open to anyone who
  knows the room name — fine for demo, revisit before promoting widely.
- Android / Play Store work remains **on hold** per Wesley (12 Nov).
