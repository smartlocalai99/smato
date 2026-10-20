# smato — Android kiosk player

A tiny native wrapper around `/player`: full-screen WebView, no watermark,
no Fully Kiosk license needed. It's the same web player from the root of
this repo — this app just makes the tablet behave like a dedicated screen:

- **Screen never sleeps** — `FLAG_KEEP_SCREEN_ON` is set the whole time the
  app is in the foreground, so it stays lit with zero taps.
- **Always landscape**, locked in the manifest.
- **Comes back on its own** — can act as the tablet's Home app and also
  listens for boot-completed. Managed kiosk setup selects it as Home
  automatically; otherwise, select it manually during installation.
- **Location auto-granted** — there's nobody at the tablet to tap "Allow",
  so the WebView grants its own geolocation prompt once the OS permission
  is in place.
- **Already points at smato in production** — first launch loads
  `https://smato.vercel.app/player` straight away, nothing to type. Only
  needed if that ever changes: tap the top-left corner of the screen 5
  times to open the setup form and enter a different URL.
- **Remote screen off** — the admin panel's "Turn screen off" button calls
  back into this app, which blacks out the page and dims the window's own
  brightness to minimum. Deliberately not a true OS sleep (there used to
  be one, via `DevicePolicyManager.lockNow()`) — a real sleep can suspend
  the tablet's connection back to the admin panel along with it, so "turn
  it back on" sometimes never arrived. Staying dimmed keeps that
  connection alive, so control from the admin panel always works.
- **Automatic managed kiosk mode** — once provisioned as device owner (below),
  the app makes itself the default Home app and enters Android lock task mode
  on launch/resume, including after reboot. This avoids regular screen pinning
  and its "hold Back + Recents to unpin" hint. Without device-owner setup or
  an external device manager's allowlist, the app stays immersive but does not
  lock the tablet or request screen pinning.

## Getting the APK

Every push to `android/` builds automatically on GitHub Actions and publishes
the APK to this repo's **Releases** page under the tag `latest-apk`:

`https://github.com/smartlocalai99/smato/releases/tag/latest-apk`

Download `app-debug.apk` from there onto the tablet (or `adb push` it) and
install it — no Android Studio needed. You can also grab it from the
**Actions** tab → latest "Build smato APK" run → Artifacts.

This is a debug-signed build, which is fine for installing directly on your
own tablets. It's not meant for the Play Store — there's no reason to
publish a single-purpose kiosk app there.

## Installing on a tablet

1. On the tablet: **Settings → Security → install unknown apps** — allow it
   for whichever app you use to open the APK (Files, Chrome, etc).
2. Open `app-debug.apk` on the tablet and install.
3. Launch **smato** once — it loads the player on its own, nothing to type.
   Grant the location permission prompt (needed for GPS monitoring).
4. Press the tablet's **Home** button once — Android will ask which Home
   app to use. Pick **smato** and choose **Always**. This is what makes it
   auto-launch after every reboot.
5. In Android **Settings → Display → Sleep**, set it to the longest option
   (or Never) as a second layer of protection — the app's keep-screen-on
   flag already prevents sleep while it's running, this just covers the
   brief window before it launches.
6. Turn off automatic system updates and set battery optimization for
   smato to **Unrestricted**, same as you would for any kiosk app.

## One-time setup for automatic locking without the pinning hint

Android requires a device policy controller to allowlist the app for managed
[lock task mode](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode).
Installing an APK or enabling ordinary device-admin access alone cannot do
this. Provision each dedicated tablet once:

1. Install this APK, launch smato, and grant the location permission.
   If an older version is still manually screen-pinned, unpin it once first.
2. On a tablet with no accounts, secondary users, or existing device owner,
   enable USB debugging and connect it to your setup computer. Approve that
   computer's debugging connection on the tablet.
3. Run:

   ```bash
   adb shell dpm set-device-owner com.smato.player/.AdminReceiver
   adb shell am start -n com.smato.player/.MainActivity
   ```

4. After smato resumes, it allowlists itself, persists its Home assignment,
   and enters managed lock task mode automatically. Reboot the tablet to
   verify that it opens the player and locks again without the pinning hint.
   An existing device PIN/password still needs unlocking after boot.

If Android refuses device ownership, inspect the command's error. The
[Android setup guide](https://developer.android.com/work/dpc/dedicated-devices/cookbook#development)
requires no accounts when provisioning with ADB. A tablet already managed by
another device manager should have that manager allowlist `com.smato.player`
for lock task mode and configure it as Home instead.

Managed lock task mode blocks Home/Recents and the consumer unpin gesture;
the five-tap URL setup remains available inside smato. Keep the authorized
setup computer available for maintenance. The app leaves Android's default
power-menu behavior unchanged.

### Tablet verification

- Without device ownership/allowlisting: launch and resume the app; no
  screen-pinning confirmation should appear.
- With ownership configured: launch and reboot; confirm playback returns,
  Home/Recents cannot leave the app, and the unpin hint does not appear.
- Inspect `adb shell dumpsys activity activities`; on Android 6+ the lock
  task state should be `LOCKED`, not `PINNED`.
- Check screen off/on and unlock, the five-tap URL form, location permission,
  and the admin panel's remote dim/on controls.

## Building it yourself

Open the `android/` folder in Android Studio (Hedgehog or newer) — it'll
sync and run as-is. Or from the command line with a JDK 17 + Android SDK
installed:

```bash
cd android
gradle :app:assembleDebug
```

The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Project layout

```
android/
  app/
    src/main/
      AndroidManifest.xml
      java/com/smato/player/
        MainActivity.kt     WebView shell: kiosk flags, permissions, setup screen
        BootReceiver.kt     relaunches the app after a reboot
        AdminReceiver.kt    device-owner component for managed kiosk policies
      res/                  icon, layout, colors matching the web app's theme
    build.gradle.kts
  build.gradle.kts
  settings.gradle.kts
```
