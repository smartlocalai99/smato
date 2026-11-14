package com.smato.player

import android.annotation.SuppressLint
import android.app.ActivityManager
import android.app.KeyguardManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.InputType
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

// Single-activity kiosk shell: a full-screen WebView pointed at the smato
// player page. Everything the tablet needs — offline video cache, GPS
// reporting, the 24h schedule — already lives in that web app; this wrapper
// only has to keep the screen on, stay in landscape, come back after a
// reboot, and grant the permissions a kiosk has nobody around to tap "yes" to.
//
// On an Android TV it also answers to the admin's TV controls — advertising
// mode on/off (Start ads / Unlock TV) — and has an offline emergency menu on
// the remote. Unlocking always leaves the TV in its normal state: its own
// launcher, Settings reachable, SMATO uninstallable.
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var setupOverlay: LinearLayout
    private lateinit var urlInput: EditText

    private val prefs by lazy { getSharedPreferences(PREFS_NAME, MODE_PRIVATE) }
    private val mainHandler = Handler(Looper.getMainLooper())
    private var tapCount = 0
    private var activityResumed = false
    private var playerReady = false
    private var screenPinningRequested = false
    private val devicePolicyManager by lazy {
        getSystemService(DEVICE_POLICY_SERVICE) as DevicePolicyManager
    }
    private val adminComponent by lazy { ComponentName(this, AdminReceiver::class.java) }
    private val homeAlias by lazy { ComponentName(packageName, "$packageName.HomeAlias") }
    private val isTv by lazy { DeviceState.isTv(this) }
    private val appVersion by lazy {
        try {
            @Suppress("DEPRECATION")
            packageManager.getPackageInfo(packageName, 0).versionName ?: ""
        } catch (error: Exception) {
            ""
        }
    }
    private val recentKeys = ArrayDeque<Pair<Int, Long>>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        applyImmersiveMode()

        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webview)
        setupOverlay = findViewById(R.id.setup_overlay)
        urlInput = findViewById(R.id.url_input)

        setupWebView()
        syncHomeAlias()
        ensureLocationPermission()

        findViewById<View>(R.id.corner_tap).setOnClickListener { onCornerTap() }
        findViewById<Button>(R.id.save_button).setOnClickListener { saveUrl() }
        findViewById<Button>(R.id.cancel_button).setOnClickListener { hideSetup() }

        val saved = prefs.getString(KEY_URL, null)
        if (saved.isNullOrBlank()) {
            // Nothing typed yet on this tablet — load smato's own production
            // URL straight away instead of asking. Tap the corner 5 times to
            // override it (a different deployment, local testing, etc).
            prefs.edit().putString(KEY_URL, DEFAULT_URL).apply()
            webView.loadUrl(DEFAULT_URL)
        } else {
            webView.loadUrl(saved)
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            applyImmersiveMode()
            // Unlocking the screen can restore focus without another resume.
            if (activityResumed) engageLockTask()
        }
    }

    override fun onResume() {
        super.onResume()
        activityResumed = true
        // Opening SMATO again after "Return to TV home" puts Home back.
        syncHomeAlias()
        configureManagedKiosk()
        engageLockTask()
    }

    override fun onPause() {
        activityResumed = false
        super.onPause()
    }

    // The kiosk (lock task, SMATO as Home) applies while advertising mode is
    // on — always, on tablets — and stops the moment a TV is unlocked.
    private fun kioskAllowed(): Boolean = DeviceState.adsEnabled(prefs)

    private fun syncHomeAlias() = setHomeAlias(kioskAllowed())

    // Switches SMATO's Home registration on or off. Off means the device's
    // own launcher is Home again — any app may do this for itself.
    private fun setHomeAlias(enabled: Boolean) {
        val wanted = if (enabled) {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        } else {
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        }
        try {
            val current = packageManager.getComponentEnabledSetting(homeAlias)
            val effective = if (current == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) {
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED
            } else {
                current
            }
            if (effective != wanted) {
                packageManager.setComponentEnabledSetting(homeAlias, wanted, PackageManager.DONT_KILL_APP)
            }
        } catch (error: Exception) {
            Log.w(TAG, "Unable to change the Home registration", error)
        }
    }

    @Suppress("DEPRECATION")
    private fun isLockedOrPinned(): Boolean {
        val activityManager = getSystemService(ACTIVITY_SERVICE) as ActivityManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            activityManager.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
        } else {
            activityManager.isInLockTaskMode
        }
    }

    private fun configureManagedKiosk() {
        if (!kioskAllowed()) return
        // Device ownership is provisioned once by the installer. Enabling
        // ordinary "device admin" in Settings is not enough for silent locking.
        if (!devicePolicyManager.isDeviceOwnerApp(packageName)) return
        val admin = adminComponent
        try {
            devicePolicyManager.setLockTaskPackages(admin, arrayOf(packageName))
        } catch (error: SecurityException) {
            Log.w(TAG, "Unable to allowlist the player for kiosk mode", error)
        }

        // Persist the Home choice so Android opens the player after a reboot.
        val homeFilter = IntentFilter(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addCategory(Intent.CATEGORY_DEFAULT)
        }
        try {
            // Replaces any earlier choice (older builds pointed at the
            // activity itself rather than the Home alias).
            devicePolicyManager.clearPackagePersistentPreferredActivities(admin, packageName)
            devicePolicyManager.addPersistentPreferredActivity(admin, homeFilter, homeAlias)
        } catch (error: SecurityException) {
            Log.w(TAG, "Unable to set the player as the default Home app", error)
        }
    }

    @Suppress("DEPRECATION")
    private fun engageLockTask() {
        // Let the installer finish choosing an auto before locking. The web
        // player signals readiness again after each main-page load.
        if (!activityResumed || !playerReady) return
        if (!kioskAllowed()) return

        val keyguard = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
        if (keyguard.isKeyguardLocked) return

        if (isLockedOrPinned()) return

        // Allowlisted tablets lock silently. Other tablets still need the
        // ordinary pinning protection; Android owns its confirmation and hint.
        val managedLock = devicePolicyManager.isLockTaskPermitted(packageName)
        // A confirmation steals/restores focus. Request it only once per app
        // launch so declining it cannot create a repeating dialog loop.
        if (!managedLock && screenPinningRequested) return

        try {
            if (!managedLock) screenPinningRequested = true
            startLockTask()
        } catch (error: SecurityException) {
            Log.w(TAG, "Screen locking was not permitted", error)
        } catch (error: IllegalStateException) {
            // A foreground transition may race this call; retry on resume/focus.
            screenPinningRequested = false
            Log.w(TAG, "Screen locking could not start yet", error)
        }
    }

    @Suppress("DEPRECATION")
    private fun applyImmersiveMode() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            )
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.setGeolocationEnabled(true)
        settings.setSupportZoom(false)
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        // The remote screen-off blackout is rendered in the web page (a
        // black overlay — see player__blackout), but that alone leaves the
        // actual backlight untouched on an LCD panel, which is most of a
        // tablet's power draw regardless of what's on screen. Only native
        // code can dim real hardware brightness without root, so the page
        // calls back into this narrow, single-purpose bridge when it toggles.
        webView.addJavascriptInterface(ScreenBridge(), "AndroidNative")

        // Nobody should be able to do anything by touching a *playing ad* —
        // no accidental scroll/zoom/tap, no long-press "save image" menu on
        // a photo ad. But this same WebView also shows the one-time setup
        // screen and the debug HUD, both of which need real taps to work at
        // all — so blocking is opt-in from the page itself (see
        // ScreenBridge.setTouchEnabled), defaulting to normal/unblocked
        // until the page confirms it's actually just showing an ad with
        // nothing to interact with. The top-right HUD corner always passes
        // through regardless, same as the native corner_tap view (top-left,
        // URL setup) — both exist for whoever installs these tablets, not
        // whoever's riding in one.
        webView.setOnTouchListener { view, event ->
            if (touchBlocked) !isInHudTapZone(view, event.x, event.y) else false
        }

        webView.webChromeClient = object : WebChromeClient() {
            // No one is at the tablet to tap "Allow" — the setup screen
            // (or whoever installs the app) is the point of consent instead.
            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                callback?.invoke(origin, true, false)
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                request?.grant(request.resources)
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                // A new document must confirm it has reached the content
                // screen. Existing managed locking remains in force.
                playerReady = false
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    mainHandler.postDelayed({ reload() }, RETRY_DELAY_MS)
                }
            }

            override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                reload()
                return true
            }
        }
    }

    // Defaults to *not* blocking touch — a safe default for whatever the
    // page happens to be showing before it's had a chance to say otherwise
    // (first paint, a slow network, etc). Only the page itself, once it
    // knows it's genuinely just playing an ad, asks for this to flip on.
    private var touchBlocked = false

    // Exposes readiness, touch and brightness controls to the page, plus the
    // TV controls the admin sends through it (lib/tvDevice.js). The page can
    // stop or start advertising mode — nothing beyond what the admin's TVs
    // page offers.
    private inner class ScreenBridge {
        @JavascriptInterface
        fun onPlayerReady() {
            runOnUiThread {
                playerReady = true
                // If currently paused or keyguard-locked, resume/focus will
                // retry using this readiness state.
                engageLockTask()
            }
        }

        @JavascriptInterface
        fun setTouchEnabled(enabled: Boolean) {
            runOnUiThread { touchBlocked = !enabled }
        }

        // Deliberately *just* a brightness toggle now — an earlier version
        // also called DevicePolicyManager.lockNow() for a true OS-level
        // sleep when a tablet had accepted the device-admin prompt. That
        // was a stronger "off," but an unreliable one: once the screen is
        // actually asleep, Android can suspend this WebView's connection
        // to the admin panel right along with it, so the "turn back on"
        // command sometimes never arrived — exactly the "works sometimes"
        // complaint this was built to fix. Dimming to minimum brightness
        // instead of truly sleeping keeps the tablet's connection alive the
        // whole time, which is what makes control from the admin panel
        // reliable instead of a coin flip. Still visually indistinguishable
        // from off.
        @JavascriptInterface
        fun setScreenOff(off: Boolean) {
            runOnUiThread {
                val params = window.attributes
                params.screenBrightness = if (off) 0f else WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                window.attributes = params
            }
        }

        @JavascriptInterface
        fun getDeviceInfo(): String = (onUi { deviceInfo() } ?: JSONObject()).toString()

        @JavascriptInterface
        fun lockTv(): String = (onUi { startAdvertising() } ?: timedOut()).toString()

        @JavascriptInterface
        fun unlockTv(): String = (onUi { unlockTvNow() } ?: timedOut()).toString()

        @JavascriptInterface
        fun setRecoveryPinHash(hash: String?) {
            DeviceState.setPinHash(prefs, hash)
        }

        @JavascriptInterface
        fun forgetPairing() {
            DeviceState.forgetPairing(prefs)
        }

        @JavascriptInterface
        fun goHome() {
            runOnUiThread { leaveToHome() }
        }
    }

    // Bridge calls arrive on a WebView thread; anything touching the
    // activity has to run on the main thread. Waits briefly for the result.
    private fun <T> onUi(block: () -> T): T? {
        if (Looper.myLooper() == Looper.getMainLooper()) return block()
        val latch = CountDownLatch(1)
        var result: T? = null
        runOnUiThread {
            try {
                result = block()
            } catch (error: Exception) {
                Log.w(TAG, "TV control failed", error)
            } finally {
                latch.countDown()
            }
        }
        latch.await(5, TimeUnit.SECONDS)
        return result
    }

    private fun outcome(ok: Boolean, detail: String) = JSONObject().put("ok", ok).put("detail", detail)

    private fun timedOut() = outcome(false, "The TV didn't respond in time.")

    private fun deviceInfo(): JSONObject = JSONObject()
        .put("isTv", isTv)
        .put("adsMode", if (DeviceState.adsEnabled(prefs)) "advertising" else "unlocked")
        .put("autoStart", DeviceState.autoStart(prefs))
        .put("deviceOwner", devicePolicyManager.isDeviceOwnerApp(packageName))
        .put("pinSet", DeviceState.pinHash(prefs) != null)
        .put("token", DeviceState.token(prefs))
        .put("appVersion", appVersion)

    // Start ads: advertising mode on, auto start on, kiosk lock on.
    private fun startAdvertising(): JSONObject {
        DeviceState.setAdvertising(prefs, true)
        syncHomeAlias()
        configureManagedKiosk()
        screenPinningRequested = false
        engageLockTask()
        return if (devicePolicyManager.isLockTaskPermitted(packageName)) {
            outcome(true, "Advertising mode on, locked to SMATO.")
        } else {
            outcome(
                true,
                "Advertising mode on. This TV isn't set up as a device owner, so it uses Android screen " +
                    "pinning — the TV may show Android's pinning prompt once."
            )
        }
    }

    // Unlock TV (from the admin, or the emergency menu): stop advertising
    // mode and hand the TV back in its normal state. Never touches anything
    // outside SMATO's own settings — no reset, no data wiped, no firmware.
    // Reports what it couldn't do instead of claiming success.
    private fun unlockTvNow(): JSONObject {
        val problems = mutableListOf<String>()
        DeviceState.setAdvertising(prefs, false)
        try {
            if (isLockedOrPinned()) stopLockTask()
        } catch (error: Exception) {
            problems += "couldn't leave the kiosk lock (${error.message})"
        }
        setHomeAlias(false)

        val wasOwner = devicePolicyManager.isDeviceOwnerApp(packageName)
        if (wasOwner) {
            try {
                devicePolicyManager.clearPackagePersistentPreferredActivities(adminComponent, packageName)
                devicePolicyManager.setLockTaskPackages(adminComponent, arrayOf())
            } catch (error: SecurityException) {
                problems += "couldn't clear the kiosk settings (${error.message})"
            }
            // Device owner apps can't be uninstalled; releasing it is what
            // makes the normal Uninstall button work again.
            try {
                @Suppress("DEPRECATION")
                devicePolicyManager.clearDeviceOwnerApp(packageName)
            } catch (error: Exception) {
                problems += "couldn't release device-owner status (${error.message})"
            }
        }
        if (devicePolicyManager.isAdminActive(adminComponent)) {
            try {
                devicePolicyManager.removeActiveAdmin(adminComponent)
            } catch (error: Exception) {
                problems += "couldn't turn off SMATO's device admin (${error.message})"
            }
        }

        val stillOwner = devicePolicyManager.isDeviceOwnerApp(packageName)
        val stillLocked = isLockedOrPinned()
        if (stillOwner || stillLocked) {
            return outcome(
                false,
                "Unlock incomplete: " + problems.ifEmpty { listOf("the TV kept SMATO locked") }.joinToString("; ") +
                    ". This TV's restrictions blocked it. Use the emergency menu on the remote " +
                    "(Up Up Down Down Left Right Left Right) or the TV's own Settings."
            )
        }
        val steps = mutableListOf(
            "Unlocked: kiosk lock off, auto start off, the TV's own home screen is back.",
            "To uninstall: Settings → Apps → smato → Uninstall."
        )
        if (wasOwner) steps += "Device-owner status released. Starting ads again later uses screen pinning unless the TV is provisioned again."
        if (devicePolicyManager.isAdminActive(adminComponent)) {
            steps += "If Uninstall is greyed out: Settings → Security → Device admin apps → turn off smato first."
        }
        if (problems.isNotEmpty()) steps += "Note: " + problems.joinToString("; ") + "."
        return outcome(true, steps.joinToString("\n"))
    }

    // Leaves SMATO for the device's own launcher. SMATO's Home registration
    // goes off first, or Home would just land back here; opening SMATO again
    // (or a restart, while advertising mode is on) puts it back.
    private fun leaveToHome() {
        try {
            if (isLockedOrPinned()) stopLockTask()
        } catch (error: Exception) {
            Log.w(TAG, "Kiosk lock wouldn't release", error)
        }
        setHomeAlias(false)
        try {
            startActivity(
                Intent(Intent.ACTION_MAIN)
                    .addCategory(Intent.CATEGORY_HOME)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        } catch (error: Exception) {
            Log.w(TAG, "No launcher to return to", error)
        }
        finish()
    }

    // Offline emergency access: Up Up Down Down Left Right Left Right on the
    // remote within 15 seconds. Works with no network — everything it needs
    // is stored on the TV. Keys still reach the page as usual.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) noteKey(event.keyCode)
        return super.dispatchKeyEvent(event)
    }

    private fun noteKey(keyCode: Int) {
        val now = SystemClock.uptimeMillis()
        recentKeys.addLast(keyCode to now)
        while (recentKeys.size > EMERGENCY_SEQUENCE.size) recentKeys.removeFirst()
        val matches = recentKeys.size == EMERGENCY_SEQUENCE.size &&
            recentKeys.map { it.first } == EMERGENCY_SEQUENCE &&
            now - recentKeys.first().second <= EMERGENCY_WINDOW_MS
        if (matches) {
            recentKeys.clear()
            showEmergencyAccess()
        }
    }

    private fun showEmergencyAccess() {
        val expected = DeviceState.pinHash(prefs)
        if (expected == null) {
            showEmergencyMenu()
            return
        }
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = "Recovery PIN"
        }
        AlertDialog.Builder(this)
            .setTitle("SMATO admin")
            .setMessage("Enter this TV's recovery PIN (set in the SMATO dashboard).")
            .setView(input)
            .setPositiveButton("Open") { _, _ ->
                if (DeviceState.hashPin(input.text.toString().trim()) == expected) {
                    showEmergencyMenu()
                } else {
                    Toast.makeText(this, "Wrong PIN.", Toast.LENGTH_LONG).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showEmergencyMenu() {
        val autoStartOn = DeviceState.autoStart(prefs)
        val items = arrayOf(
            "Exit advertising mode",
            if (autoStartOn) "Disable auto start" else "Enable auto start",
            "Return to TV home",
            "Cancel"
        )
        val title = if (DeviceState.pinHash(prefs) == null) {
            "SMATO admin (no recovery PIN yet — set one in the dashboard)"
        } else {
            "SMATO admin"
        }
        AlertDialog.Builder(this)
            .setTitle(title)
            .setItems(items) { _, which ->
                when (which) {
                    0 -> {
                        val result = unlockTvNow()
                        Toast.makeText(this, result.optString("detail"), Toast.LENGTH_LONG).show()
                        leaveToHome()
                    }
                    1 -> {
                        DeviceState.setAutoStart(prefs, !autoStartOn)
                        val text = if (autoStartOn) {
                            "Auto start off — SMATO won't open on its own after a restart."
                        } else {
                            "Auto start on."
                        }
                        Toast.makeText(this, text, Toast.LENGTH_LONG).show()
                    }
                    2 -> leaveToHome()
                }
            }
            .show()
    }

    private fun reload() {
        val saved = prefs.getString(KEY_URL, null)
        if (!saved.isNullOrBlank()) webView.loadUrl(saved)
    }

    // Mirrors the web page's own .player__tap-zone CSS (25% of each
    // dimension, capped at 160dp) so the one spot where touches still pass
    // through to the page lines up with where its HUD actually listens.
    private fun isInHudTapZone(view: View, x: Float, y: Float): Boolean {
        val capPx = 160f * resources.displayMetrics.density
        val zoneWidth = minOf(view.width * 0.25f, capPx)
        val zoneHeight = minOf(view.height * 0.25f, capPx)
        return x >= view.width - zoneWidth && y <= zoneHeight
    }

    private fun ensureLocationPermission() {
        val granted = ContextCompat.checkSelfPermission(
            this,
            android.Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(
                    android.Manifest.permission.ACCESS_FINE_LOCATION,
                    android.Manifest.permission.ACCESS_COARSE_LOCATION
                ),
                LOCATION_PERMISSION_REQUEST
            )
        }
    }

    private fun onCornerTap() {
        tapCount += 1
        mainHandler.removeCallbacksAndMessages(TAP_RESET_TOKEN)
        mainHandler.postAtTime(
            { tapCount = 0 },
            TAP_RESET_TOKEN,
            SystemClock.uptimeMillis() + TAP_WINDOW_MS
        )
        if (tapCount >= 5) {
            tapCount = 0
            showSetup(prefill = prefs.getString(KEY_URL, "") ?: "")
        }
    }

    private fun showSetup(prefill: String) {
        urlInput.setText(prefill)
        findViewById<Button>(R.id.cancel_button).visibility =
            if (prefill.isBlank()) View.GONE else View.VISIBLE
        setupOverlay.visibility = View.VISIBLE
    }

    private fun hideSetup() {
        setupOverlay.visibility = View.GONE
    }

    private fun saveUrl() {
        val url = urlInput.text.toString().trim()
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            Toast.makeText(this, "Enter a full URL, starting with https://", Toast.LENGTH_LONG).show()
            return
        }
        prefs.edit().putString(KEY_URL, url).apply()
        hideSetup()
        webView.loadUrl(url)
    }

    // Kiosk mode: swallow the back button so the tablet never leaves the
    // player. Once a TV is unlocked, Back works as normal.
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (!kioskAllowed()) super.onBackPressed()
    }

    companion object {
        private const val TAG = "SmatoKiosk"
        private const val PREFS_NAME = "smato"
        private const val KEY_URL = "player_url"
        private const val DEFAULT_URL = "https://smato.vercel.app/player"
        private const val LOCATION_PERMISSION_REQUEST = 1001
        private const val RETRY_DELAY_MS = 5000L
        private const val TAP_WINDOW_MS = 3000L
        private val TAP_RESET_TOKEN = Any()
        private const val EMERGENCY_WINDOW_MS = 15_000L
        private val EMERGENCY_SEQUENCE = listOf(
            KeyEvent.KEYCODE_DPAD_UP,
            KeyEvent.KEYCODE_DPAD_UP,
            KeyEvent.KEYCODE_DPAD_DOWN,
            KeyEvent.KEYCODE_DPAD_DOWN,
            KeyEvent.KEYCODE_DPAD_LEFT,
            KeyEvent.KEYCODE_DPAD_RIGHT,
            KeyEvent.KEYCODE_DPAD_LEFT,
            KeyEvent.KEYCODE_DPAD_RIGHT
        )
    }
}
