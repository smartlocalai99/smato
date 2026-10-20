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
import android.util.Log
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
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

// Single-activity kiosk shell: a full-screen WebView pointed at the smato
// player page. Everything the tablet needs — offline video cache, GPS
// reporting, the 24h schedule — already lives in that web app; this wrapper
// only has to keep the screen on, stay in landscape, come back after a
// reboot, and grant the permissions a kiosk has nobody around to tap "yes" to.
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var setupOverlay: LinearLayout
    private lateinit var urlInput: EditText

    private val prefs by lazy { getSharedPreferences(PREFS_NAME, MODE_PRIVATE) }
    private val mainHandler = Handler(Looper.getMainLooper())
    private var tapCount = 0
    private var activityResumed = false
    private var playerReady = false
    private val devicePolicyManager by lazy {
        getSystemService(DEVICE_POLICY_SERVICE) as DevicePolicyManager
    }

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
            if (activityResumed) engageManagedLockTask()
        }
    }

    override fun onResume() {
        super.onResume()
        activityResumed = true
        configureManagedKiosk()
        engageManagedLockTask()
    }

    override fun onPause() {
        activityResumed = false
        super.onPause()
    }

    private fun configureManagedKiosk() {
        // Device ownership is provisioned once by the installer. Enabling
        // ordinary "device admin" in Settings is not enough for silent locking.
        if (!devicePolicyManager.isDeviceOwnerApp(packageName)) return
        val admin = ComponentName(this, AdminReceiver::class.java)
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
            devicePolicyManager.addPersistentPreferredActivity(
                admin,
                homeFilter,
                ComponentName(this, MainActivity::class.java)
            )
        } catch (error: SecurityException) {
            Log.w(TAG, "Unable to set the player as the default Home app", error)
        }
    }

    @Suppress("DEPRECATION")
    private fun engageManagedLockTask() {
        // Let the installer finish choosing an auto before locking. The web
        // player signals readiness again after each main-page load.
        if (!activityResumed || !playerReady) return

        // Without allowlisting, startLockTask() invokes consumer screen pinning
        // and its "hold Back + Recents to unpin" UI. Never use that fallback.
        // This also supports tablets allowlisted by an external device manager.
        if (!devicePolicyManager.isLockTaskPermitted(packageName)) return
        val keyguard = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
        if (keyguard.isKeyguardLocked) return

        val activityManager = getSystemService(ACTIVITY_SERVICE) as ActivityManager
        val alreadyLockedOrPinned = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            activityManager.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
        } else {
            activityManager.isInLockTaskMode
        }
        if (alreadyLockedOrPinned) return

        try {
            startLockTask()
        } catch (error: SecurityException) {
            Log.w(TAG, "Managed kiosk mode was not permitted", error)
        } catch (error: IllegalStateException) {
            // A foreground transition may race this call; retry on resume/focus.
            Log.w(TAG, "Managed kiosk mode could not start yet", error)
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

    // Exposes readiness, touch and brightness controls to the page.
    // JavaScript cannot exit managed locking or bypass device allowlisting.
    private inner class ScreenBridge {
        @JavascriptInterface
        fun onPlayerReady() {
            runOnUiThread {
                playerReady = true
                // If currently paused or keyguard-locked, resume/focus will
                // retry using this readiness state.
                engageManagedLockTask()
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

    // Kiosk mode: swallow the back button so the tablet never leaves the player.
    override fun onBackPressed() {}

    companion object {
        private const val TAG = "SmatoKiosk"
        private const val PREFS_NAME = "smato"
        private const val KEY_URL = "player_url"
        private const val DEFAULT_URL = "https://smato.vercel.app/player"
        private const val LOCATION_PERMISSION_REQUEST = 1001
        private const val RETRY_DELAY_MS = 5000L
        private const val TAP_WINDOW_MS = 3000L
        private val TAP_RESET_TOKEN = Any()
    }
}
