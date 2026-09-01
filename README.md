# Ad screens — Next.js app

Core pages:

- `/admin` — sign in, upload ad videos, assign each one to an auto, watch the fleet on a live map with each tablet's status, address, and what's currently playing
- `/player` — what runs on each tablet. Registers itself with an auto number, downloads its ads once, and plays them fully offline from then on.

The authenticated admin area also includes driver management:

- `/admin/drivers` — search registered drivers, see who's due for their monthly payment, and register a new one from a modal right here (no separate page)
- `/admin/drivers/[id]` — a driver's profile: their linked tablet's live status, documents, and payment cycle with a "mark as paid" action
- `/admin/drivers/[id]/edit` — update a driver's details or replace individual documents
- `/admin/history` — ads that aren't live right now (paused, not started yet, or finished), kept off the main dashboard so it stays focused on what's actually running

Plus a small Android app in [`android/`](android/) — a kiosk wrapper around
`/player` (no watermark, screen always on, auto-launches after reboot). See
[`android/README.md`](android/README.md) for install instructions and where
to download the built APK.

---

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com). Free tier is fine.
2. **Existing installations only:** before rerunning the current `setup.sql`, grant the trusted admin role to every approved pre-existing admin or Team access account. Replace the example email with one account's exact email, run this block in **SQL Editor**, then repeat the same exact-email block separately for each other approved pre-existing account. The block aborts unless each run updates exactly one account; never remove the email filter, broaden it, or automatically promote every user.
   ```sql
   do $$
   declare
     promoted_count integer;
   begin
     update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object('role', 'admin')
     where lower(email) = lower('9876543210@smato.local');

     get diagnostics promoted_count = row_count;
     if promoted_count <> 1 then
       raise exception 'Expected exactly one admin account, updated %', promoted_count;
     end if;
   end $$;
   ```
3. **SQL Editor** → paste all of `setup.sql` → Run. Creates the `autos`, `ads`, and `drivers` tables, the `ads` and private `driver-documents` storage buckets, the security rules, and seeds one test auto (`AUTO-01`).
4. **Authentication → Users → Add user.** On a new installation, create the first login, then run the single-account SQL block from step 2 for that exact email. The admin sign-in screen asks for a mobile number + PIN, not an email — but Supabase Auth only stores email + password, so create the login like this:
   - **Email** → your mobile number followed by `@smato.local`, digits only. `9876543210` → `9876543210@smato.local`.
   - **Password** → your PIN. Supabase requires at least 6 characters by default, so use a 6-digit PIN.
   - **Tick "Auto Confirm User".** This is the step people miss — without it Supabase waits for a confirmation email, which a fake `@smato.local` address can never receive, so sign-in fails forever with "Invalid login credentials". If you already created a user without ticking it, fix it by running this once in the SQL Editor (swap in the real email):
     ```sql
     update auth.users set email_confirmed_at = now() where email = '9876543210@smato.local';
     ```
   - Sign out and sign back in after adding the role so the session receives a fresh JWT. You only need to do this dashboard dance once. After that first login works, add everyone else from inside `/admin` itself — **Team access** section, mobile + PIN, no Supabase dashboard needed (see step 6 for the extra key that section needs). Accounts created there receive the admin role automatically.
5. In **Authentication settings**, turn off **Allow new users to sign up**. Admins created through the server-side Team access flow still work; disabling public signup is defense in depth against unapproved permanent accounts.
6. **Project Settings → API.** Copy the **Project URL**, the **`anon public`** key (sometimes labeled `publishable`), and the **`service_role`** key (labeled `secret`). The service role key powers the in-app "Team access" panel — keep it out of anything public; it never goes in a `NEXT_PUBLIC_` variable.

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

The anon key is safe in the browser. The rules in `setup.sql` mean it can only read ads, check a device in, and post a GPS fix. Only a permanent signed-in account whose trusted `app_metadata.role` is `admin` can open the admin shell or manage protected data and storage. The service role key is different — it bypasses all of that, so it only ever lives in this env var, read server-side by `app/api/admin/create-admin`, never sent to the browser.

## 3. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Or push to GitHub and import the repo at vercel.com.

**Then add the environment variables in Vercel:** Project → Settings → Environment Variables. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy. Without them the app builds but can't reach your data (and Team access won't be able to add new logins).

You'll get a URL like `https://your-app.vercel.app`.

- Admin: `https://your-app.vercel.app/admin`
- Drivers: `https://your-app.vercel.app/admin/drivers` (Register a driver opens as a modal from here)
- History: `https://your-app.vercel.app/admin/history`
- Player (put this in the tablet's browser): `https://your-app.vercel.app/player`

### Supabase upgrades

Before the first upgrade to role-protected admin policies, run the exact-email, single-account migration in Supabase step 2 separately for every approved pre-existing admin or Team access account, changing the exact email for each run. Do not auto-promote all existing users. Then run the current `setup.sql` again in the connected project's SQL Editor. It is idempotent: it adds the driver table, private document bucket, and access policies without recreating existing fleet or advertisement data. Each promoted account must sign out and back in afterward to refresh its JWT role claim; until that account's migration and refresh are complete, it is intentionally denied admin access.

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
2. Optional start/end date to run it only for a campaign window.
3. Choose a video **or image** file and upload — a photo plays for 2 minutes each time its turn comes up in the rotation, a video plays for its full length.

Ads loop all day, back to back, in the order they were added — there's no manual play-order field to set; each new ad just joins the back of the queue. There's no time-of-day scheduling either — if it's active, it's in the rotation. The ads list shows each one's position (e.g. "plays 2 of 3 here") so it's clear what order a given tablet is actually playing in.

The tablet picks it up within seconds if it's online — submitting, pausing, resuming, or deleting an ad broadcasts a message straight to every connected tablet, which triggers an immediate sync. No polling delay, and no Supabase dashboard setting to configure — it uses Realtime Broadcast, which works out of the box with the anon key (unlike the "Replication" toggle used for database change tracking, which this app doesn't rely on).

## Managing drivers

Open `/admin/drivers` after signing in to search the driver directory, or click **Register a driver** to fill out the form in a modal right there — no separate page, the list refreshes the moment it closes. Registration requires a name, mobile number, auto number plate, Driving Licence number, Aadhaar number, and three images: a driver photo, Driving Licence image, and Aadhaar image. Images must be JPEG, PNG, or WebP and under 5 MB.

Each auto can have **one registered driver only** — the auto number plate doubles as that auto's identifier in the fleet system, so a driver's profile page (`/admin/drivers/[id]`) shows their linked tablet's live status directly (online/offline, last seen, GPS). Mobile numbers, Driving Licence numbers, and Aadhaar numbers are also unique, so the directory cannot accidentally create a duplicate identity or auto assignment.

**Payment cycle** — every driver is paid ₹1,000 on a rolling 30-day cycle starting from their onboarding date (or their last payment, once they have one). A driver's profile shows whether they're due, and a **Mark this month as paid** button resets the clock. The Drivers list and their profile both show a due/paid badge; the Drivers page header totals how many drivers are currently due.

Driver documents are private. The app stores only private storage paths and creates short-lived signed URLs for authenticated admins when an image must be shown. The directory masks Aadhaar and Driving Licence values; full values and images appear only in an authenticated driver's profile or edit view. Keep real identifiers and signed storage URLs out of documentation, issue reports, and screenshots.

## How the offline part works

- Videos are downloaded into the tablet's own storage (the browser's Cache Storage, served back by the service worker on a normal same-origin URL — not a `blob:` URL, which is a known weak spot on some older Android WebView builds), never streamed.
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
  adCache.js         downloaded ad storage (Cache Storage API, served by sw.js)
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
