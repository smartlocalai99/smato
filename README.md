# Ad screens — Next.js app

Two pages:

- `/admin` — sign in, upload ad videos, assign each one to an auto, watch the fleet on a live map with each tablet's status, address, and what's currently playing
- `/player` — what runs on each tablet. Registers itself with an auto number, downloads its ads once, and plays them fully offline from then on.

Plus a small Android app in [`android/`](android/) — a kiosk wrapper around
`/player` (no watermark, screen always on, auto-launches after reboot). See
[`android/README.md`](android/README.md) for install instructions and where
to download the built APK.

---

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com). Free tier is fine.
2. **SQL Editor** → paste all of `setup.sql` → Run. Creates the `autos` and `ads` tables, the `ads` storage bucket, the security rules, and seeds one test auto (`AUTO-01`).
3. **Authentication → Users → Add user.** The admin sign-in screen asks for a mobile number + PIN, not an email — but Supabase Auth only stores email + password, so create your first login like this:
   - **Email** → your mobile number followed by `@smato.local`, digits only. `9876543210` → `9876543210@smato.local`.
   - **Password** → your PIN. Supabase requires at least 6 characters by default, so use a 6-digit PIN.
   - **Tick "Auto Confirm User".** This is the step people miss — without it Supabase waits for a confirmation email, which a fake `@smato.local` address can never receive, so sign-in fails forever with "Invalid login credentials". If you already created a user without ticking it, fix it by running this once in the SQL Editor (swap in the real email):
     ```sql
     update auth.users set email_confirmed_at = now() where email = '9876543210@smato.local';
     ```
   - You only need to do this dashboard dance once. After that first login works, add everyone else from inside `/admin` itself — **Team access** section, mobile + PIN, no Supabase dashboard needed (see step 4 for the extra key that section needs).
4. **Project Settings → API.** Copy the **Project URL**, the **`anon public`** key (sometimes labeled `publishable`), and the **`service_role`** key (labeled `secret`). The service role key powers the in-app "Team access" panel — keep it out of anything public; it never goes in a `NEXT_PUBLIC_` variable.

## 2. Run it locally

```bash
npm install
cp .env.local.example .env.local
```

Open `.env.local` and paste in your three values:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhb...
SUPABASE_SERVICE_ROLE_KEY=eyJhb...
```

Then:

```bash
npm run dev
```

Open http://localhost:3000 — you should see the two links.

The anon key is safe in the browser. The rules in `setup.sql` mean it can only read ads, check a device in, and post a GPS fix. Only your signed-in admin account can upload or delete ads. The service role key is different — it bypasses all of that, so it only ever lives in this env var, read server-side by `app/api/admin/create-admin`, never sent to the browser.

## 3. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Or push to GitHub and import the repo at vercel.com.

**Then add the environment variables in Vercel:** Project → Settings → Environment Variables. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy. Without them the app builds but can't reach your data (and Team access won't be able to add new logins).

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
2. **Play order** — ads loop all day, back to back, in this order (lowest first). There's no time-of-day scheduling — if it's active, it's in the rotation.
3. Optional start/end date to run it only for a campaign window.
4. Choose a video **or image** file and upload — a photo plays for 8 seconds each time its turn comes up in the rotation, a video plays for its full length.

The tablet picks it up within seconds if it's online — submitting, pausing, resuming, or deleting an ad broadcasts a message straight to every connected tablet, which triggers an immediate sync. No polling delay, and no Supabase dashboard setting to configure — it uses Realtime Broadcast, which works out of the box with the anon key (unlike the "Replication" toggle used for database change tracking, which this app doesn't rely on).

## How the offline part works

- Videos are downloaded into the tablet's own storage (IndexedDB), never streamed.
- On boot the player plays what it already has, instantly, with no internet.
- It syncs the moment an ad changes (broadcast from `/admin`), plus a once-an-hour safety-net check in case that connection ever silently drops.
- **Old ads are deleted only after the new ones have fully downloaded.** A dropped connection can never leave you with a blank screen.
- Ads loop by play order continuously — pausing or deleting one (or its campaign dates ending) is what takes it out of rotation, checked every minute so it happens on its own even offline.
- The service worker caches the app itself, so the page loads even with no network.
- GPS keeps updating in the background whenever there's a connection; the last fix — and what the tablet is currently playing — show up in the admin Fleet view (as a real address, and on a map) even if the tablet later goes offline.

The Fleet map and addresses use OpenStreetMap (via Leaflet) and Nominatim — both free, no API key. That's fine at the scale of ~20 autos; if you ever outgrow it, that's the piece to swap for Google Maps.

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
  admin/page.js      control panel: sign in, fleet + map, upload form, ads list, team access
  api/admin/create-admin/route.js   server-side (service role) admin creation
  player/page.js     tablet player: setup screen, offline sync, GPS, playback, debug HUD
  layout.js          fonts and shell
  globals.css        all styling
lib/
  supabase.js        client + storage URL helper + realtime broadcast
  idb.js             IndexedDB wrapper
  time.js            date/campaign logic
  geocode.js          lat/lng → address (OpenStreetMap Nominatim)
components/
  FleetStrip.js       per-auto status cards (online, now playing, address)
  FleetMap.js         live map of every auto's last GPS fix (Leaflet)
public/
  sw.js               service worker
  manifest.json
setup.sql             run once in Supabase
```
