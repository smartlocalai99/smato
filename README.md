# Ad screens — Next.js app

Two pages:

- `/admin` — sign in, upload ad videos, assign each one to an auto and a time window, watch the fleet (online status + last GPS fix)
- `/player` — what runs on each tablet. Registers itself with an auto number, downloads its ads once, and plays them fully offline from then on.

Plus a small Android app in [`android/`](android/) — a kiosk wrapper around
`/player` (no watermark, screen always on, auto-launches after reboot). See
[`android/README.md`](android/README.md) for install instructions and where
to download the built APK.

---

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com). Free tier is fine.
2. **SQL Editor** → paste all of `setup.sql` → Run. Creates the `autos` and `ads` tables, the `ads` storage bucket, the security rules, and seeds one test auto (`AUTO-01`).
3. **Authentication → Users → Add user.** The admin sign-in screen asks for a mobile number + PIN, not an email — but Supabase Auth only stores email + password, so create the user like this:
   - **Email** → your mobile number followed by `@smato.local`, digits only. `9876543210` → `9876543210@smato.local`.
   - **Password** → your PIN. Supabase requires at least 6 characters by default, so use a 6-digit PIN (or go to **Authentication → Providers → Email** and lower the minimum password length if you want a shorter one).
   - Add one of these per person who needs admin access.
4. **Project Settings → API.** Copy the Project URL and the `anon public` (sometimes labeled `publishable`) key.

## 2. Run it locally

```bash
npm install
cp .env.local.example .env.local
```

Open `.env.local` and paste in your two values:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhb...
```

Then:

```bash
npm run dev
```

Open http://localhost:3000 — you should see the two links.

The anon key is safe in the browser. The rules in `setup.sql` mean it can only read ads, check a device in, and post a GPS fix. Only your signed-in admin account can upload or delete ads.

## 3. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Or push to GitHub and import the repo at vercel.com.

**Then add the environment variables in Vercel:** Project → Settings → Environment Variables. Add both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then redeploy. Without them the app builds but can't reach your data.

You'll get a URL like `https://your-app.vercel.app`.

- Admin: `https://your-app.vercel.app/admin`
- Player (put this in the tablet's browser): `https://your-app.vercel.app/player`

## 4. Set up a tablet

1. Open `https://your-app.vercel.app/player` in Chrome on the tablet **while it has internet**. This registers the service worker — after this the page loads with no connection.
2. Type the auto number (e.g. `AUTO-01`). Saved on that tablet permanently — you won't see the setup screen again.
3. Allow the location permission prompt so GPS tracking starts.
4. Install **Fully Kiosk Browser** from the Play Store, then set:
   - Start URL → `https://your-app.vercel.app/player`
   - Start on Boot → on
   - Kiosk Mode → on
   - Keep Screen On → on
   - Advanced Web Settings → Service Workers **on**, DOM Storage **on**
   - Location permission → granted (Fully Kiosk → Web Settings → Enable Geolocation API)
5. Reboot the tablet. It should land on the player by itself.

**Android settings that matter more than the app:**

- Screen lock → **None** (otherwise it sits at the lock screen after power-on)
- Location → **On**, accuracy **High** (needed for the GPS monitoring in the admin fleet view)
- Date & time → **automatic** (schedules depend on the clock)
- Battery → Fully Kiosk set to **Unrestricted**
- Turn off automatic system updates

**To check a screen in the field:** tap the top-right corner five times. Shows network, last sync, ads downloaded, what's playing, and the last GPS fix.

---

## Adding an ad

In `/admin`, under **Add an ad**:

1. **Plays on** — pick a specific auto (e.g. `AUTO-01`), or **All autos**. Pick **+ New auto…** to type a number that hasn't checked in yet — it'll be assigned to that video and appear in the Fleet list right away.
2. **From / Until** — the hours of the day it should play (24h window, wraps past midnight if `From` is later than `Until`).
3. Optional start/end date to run it only for a campaign window.
4. **Play order** — when more than one ad is active at once on an auto, they rotate in this order.
5. Choose the video file and upload.

The tablet picks it up on its next sync (every 30 minutes, or immediately if you reload `/player` while online). Old videos for that auto are only deleted from the tablet after the new ones have fully downloaded, so a dropped connection can never leave the screen blank.

## How the offline part works

- Videos are downloaded into the tablet's own storage (IndexedDB), never streamed.
- On boot the player plays what it already has, instantly, with no internet.
- Every 30 minutes, if there's a connection, it checks for new ads and downloads them in the background.
- **Old ads are deleted only after the new ones have fully downloaded.** A dropped connection can never leave you with a blank screen.
- Time slots are checked against the tablet's clock every minute, so schedules start and stop on their own offline.
- The service worker caches the app itself, so the page loads even with no network.
- GPS keeps updating in the background whenever there's a connection; the last fix is shown on the tablet (HUD) and in the admin Fleet view even if the tablet later goes offline.

Data used is roughly the size of the videos, once. A 30-second 1080p ad is about 30 MB, so ten ads a month is around 300 MB per tablet.

## Before you go live

- Keep videos 15–30 seconds, **muted with text on screen**.
- Encode at 1080p or lower. Bigger files mean more data and slower syncs.
- Test the offline path before anything goes into an auto: load `/player`, then turn WiFi off completely and reload. If it still plays, caching is working.
- You have 20 autos to roll out — get one fully working end to end (upload → download → play → GPS shows up in Fleet) before repeating setup on the rest.

## Project layout

```
app/
  page.js            landing page with both links
  admin/page.js      control panel: sign in, fleet + GPS view, upload form, ads list
  player/page.js      tablet player: setup screen, offline sync, GPS, playback, debug HUD
  layout.js           fonts and shell
  globals.css         all styling
lib/
  supabase.js         client + storage URL helper
  idb.js              IndexedDB wrapper
  time.js             date and time-slot logic
components/
  SlotStrip.js         24-hour schedule dial
  FleetStrip.js         per-auto online/GPS status cards
public/
  sw.js               service worker
  manifest.json
setup.sql             run once in Supabase
```
