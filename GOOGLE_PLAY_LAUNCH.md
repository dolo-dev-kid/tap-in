# Tap In — Google Play launch checklist

## What was fixed 11 Nov 2026 (local repo, not pushed yet)
- `backend/server.js` crash fixed: duplicate `require("dotenv")` / `require("mongoose")` and a stray `});` after the MongoDB connect — that was the `localhost refused to connect` / backend-won't-start blocker.
- Backend no longer crashes when MongoDB is down or `MONGODB_URI` is missing. It starts, serves `/` and `/health`, and auth/friends/servers return 503 with a clear message until MongoDB connects.
- Backend now uses `backend/models/User.js` instead of a second copy of the User schema in `server.js`, and uses `JWT_SECRET` from the environment (no hardcoded secret in `server.js` / `auth.js`).
- `.env` files were removed from git tracking (`git rm --cached .env backend/.env frontend/.env`). They were committed to the public repo before — **rotate them now, see below**.
- Frontend builds cleanly (`npm run build` → `dist/`, 70 modules).
- Capacitor added: app id `com.dolo45.tapin`, name `Tap In`, webDir `dist`. Android platform added in `frontend/android/` (gitignored, generated). New scripts: `npm run build:android`, `npm run sync:android`, `npm run open:android`.

## Verified here
- Backend: `node server.js` starts, `GET /` returns "Tap-In Backend Running", `GET /health` returns `{ok:true, db:"disconnected"}` when no MongoDB URI is set.
- Frontend: `npm run build` succeeds.

## DO THIS FIRST — secrets (urgent)
The old MongoDB Atlas URI and JWT secret were in the public GitHub repo history. Removing them from tracking does NOT erase history.
1. In MongoDB Atlas: change the database user password, and create a NEW JWT secret.
2. Put the new values only in `backend/.env` on your own computer — never commit `.env`.
3. Old tokens/passwords in git history should be treated as leaked.

## MongoDB — what you need
1. MongoDB Atlas free cluster, or a local MongoDB.
2. In Atlas: Network Access → add your IP, or `0.0.0.0/0` for testing (less safe). The workspace test failed to connect to Atlas because the IP was not whitelisted — that is expected until you whitelist it.
3. `backend/.env` (copy from `backend/.env.example`):
   ```
   MONGODB_URI=mongodb+srv://<user>:<new-password>@<cluster>/tap-in?retryWrites=true&w=majority
   JWT_SECRET=<long random string>
   PORT=3001
   FRONTEND_URL=http://localhost:5173
   ```
4. Restart backend, then check `http://localhost:3001/health` — `db` should say `connected`.

## Run it locally (your computer)
```
# Terminal 1 — backend
cd tap-in/backend
npm install
npm run dev        # or: npm start

# Terminal 2 — frontend
cd tap-in/frontend
npm install
npm run dev        # open http://localhost:5173
```
Leave both terminals open. If the browser says "localhost refused to connect", the frontend dev server is not running — check that terminal for the `Local: http://localhost:5173/` line.

## Google Play — build the Android app
1. Install Android Studio on your computer (needed to build the app bundle).
2. Host the backend somewhere public first (Render / Railway / VPS). A Play Store app cannot talk to `localhost:3001`.
3. Set the hosted backend URL in `frontend/.env`:
   ```
   VITE_API_URL=https://your-backend-url
   ```
4. Build and sync:
   ```
   cd tap-in/frontend
   npm run build:android
   npm run open:android
   ```
5. In Android Studio: Build → Generate Signed App Bundle / APK → create a new upload keystore, save it somewhere safe (losing it means you cannot update the app). Build the `.aab` file.
6. Google Play Console ($25 one-time): create the app `com.dolo45.tapin`, fill in store listing, privacy policy URL, app icon, screenshots, content rating, and upload the `.aab` to Internal testing first.

## Still NOT ready for Play (known gaps — fix before you submit)
- Login is not enforced on most routes, and many features are still hardcoded / fake in the frontend. Test register → login → friends → chat → video call end-to-end against a real backend + MongoDB first.
- VideoChat is WebRTC localhost-only — it needs a STUN/TURN server for calls between different phones/networks.
- Privacy policy + terms pages are required by Play. Add them before submitting.
- App icon / splash screen are still Capacitor defaults — replace them in Android Studio.
