# smato — Android kiosk player

A tiny native wrapper around `/player`: full-screen WebView, no watermark,
no Fully Kiosk license needed. It's the same web player from the root of
this repo — this app just makes the tablet behave like a dedicated screen:

- **Screen never sleeps** — `FLAG_KEEP_SCREEN_ON` is set the whole time the
  app is in the foreground, so it stays lit with zero taps.
- **Always landscape**, locked in the manifest.
- **Comes back on its own** — registered as the tablet's Home app (so
  pressing Home always returns here) and also listens for boot-completed,
  so a reboot lands straight back on the player.
- **Location auto-granted** — there's nobody at the tablet to tap "Allow",
  so the WebView grants its own geolocation prompt once the OS permission
  is in place.
- **Set the URL once** — first launch shows a small form for the player
  link (e.g. `https://your-app.vercel.app/player`), saved on the tablet
  from then on. To change it later (wrong URL, new deployment), tap the
  top-left corner of the screen 5 times.

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
3. Launch **smato** once. Grant the location permission prompt (needed for
   the GPS monitoring in the admin Fleet view).
4. Enter the player URL and tap **Save & play**.
5. Press the tablet's **Home** button once — Android will ask which Home
   app to use. Pick **smato** and choose **Always**. This is what makes it
   auto-launch after every reboot.
6. In Android **Settings → Display → Sleep**, set it to the longest option
   (or Never) as a second layer of protection — the app's keep-screen-on
   flag already prevents sleep while it's running, this just covers the
   brief window before it launches.
7. Turn off automatic system updates and set battery optimization for
   smato to **Unrestricted**, same as you would for any kiosk app.

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
      res/                  icon, layout, colors matching the web app's theme
    build.gradle.kts
  build.gradle.kts
  settings.gradle.kts
```
