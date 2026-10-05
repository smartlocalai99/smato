package com.smato.player

import android.annotation.SuppressLint
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
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

    private val devicePolicyManager by lazy {
        getSystemService(DEVICE_POLICY_SERVICE) as DevicePolicyManager
    }
    private val adminComponent by lazy { ComponentName(this, AdminReceiver::class.java) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        // FLAG_SHOW_WHEN_LOCKED stays on permanently — it's what lets this
        // activity be shown over a slept/locked screen at all, needed to
        // undo a remote lockNow() later. KEEP_SCREEN_ON and DISMISS_KEYGUARD
        // are deliberately *not* set here even though normal playback wants
        // both — they're applied in restoreWakeFlags() instead and dropped
        // right before a remote lockNow(), because leaving them permanently
        // on would do exactly what their names say and immediately undo the
        // lock: "never sleep" and "always dismiss the keyguard" fight a
        // lock that's trying to do precisely that.
        @Suppress("DEPRECATION")
        window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
        restoreWakeFlags()
        applyImmersiveMode()

        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webview)
        setupOverlay = findViewById(R.id.setup_overlay)
        urlInput = findViewById(R.id.url_input)

        setupWebView()
        ensureLocationPermission()
        ensureDeviceAdmin()

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
        if (hasFocus) applyImmersiveMode()
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

    // Exposes exactly one boolean toggle to the page — nothing reflective
    // or open-ended, so there's nothing here for untrusted content to abuse
    // even in principle. @JavascriptInterface is required for a method to
    // be reachable from JS at all (Android blocks reflection access to
    // anything else by default since API 17, well below this app's minSdk).
    private inner class ScreenBridge {
        @JavascriptInterface
        fun setScreenOff(off: Boolean) {
            runOnUiThread {
                val params = window.attributes
                params.screenBrightness = if (off) 0f else WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                window.attributes = params

                if (off) {
                    // Only does anything once the one-time device admin
                    // prompt (ensureDeviceAdmin, below) has been accepted on
                    // this tablet — falls back to just the dim+black above
                    // otherwise, which still looks identical from a glance.
                    if (devicePolicyManager.isAdminActive(adminComponent)) {
                        try {
                            // Drop these *before* locking — see the comment
                            // in onCreate for why leaving them on fights the
                            // lock into doing nothing visible.
                            clearWakeFlags()
                            devicePolicyManager.lockNow()
                        } catch (_: SecurityException) {
                            // Some OEM/Android combination refused it —
                            // restore normal operation and fall back to the
                            // dim+black cover above, which already applied.
                            restoreWakeFlags()
                        }
                    }
                } else {
                    restoreWakeFlags()
                    wakeScreen()
                }
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun clearWakeFlags() {
        window.clearFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                or WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        )
    }

    // Normal kiosk operation: never idle-sleep, always dismiss any keyguard.
    // Set once in onCreate, dropped by clearWakeFlags() right before a
    // remote lockNow(), and restored here afterward.
    @Suppress("DEPRECATION")
    private fun restoreWakeFlags() {
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                or WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        )
    }

    // Brings the screen back from an actual lockNow() sleep. restoreWakeFlags()
    // above undoes the fight; this is what actively forces Android to switch
    // the display back on right now instead of waiting for a power button.
    @Suppress("DEPRECATION")
    private fun wakeScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        val powerManager = getSystemService(POWER_SERVICE) as PowerManager
        val wakeLock = powerManager.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
            "smato:wake"
        )
        wakeLock.acquire(3000)
    }

    private fun reload() {
        val saved = prefs.getString(KEY_URL, null)
        if (!saved.isNullOrBlank()) webView.loadUrl(saved)
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

    // One-time per tablet: shows the system's own "Activate this device
    // admin app?" prompt so a later remote screen-off can call lockNow().
    // Declining it just means that tablet keeps using the dim+black
    // fallback — nothing else about the app depends on this being granted.
    private fun ensureDeviceAdmin() {
        if (devicePolicyManager.isAdminActive(adminComponent)) return
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
            putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
            putExtra(
                DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "Lets smato lock this tablet's screen remotely from the admin panel."
            )
        }
        startActivity(intent)
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
        private const val PREFS_NAME = "smato"
        private const val KEY_URL = "player_url"
        private const val DEFAULT_URL = "https://smato.vercel.app/player"
        private const val LOCATION_PERMISSION_REQUEST = 1001
        private const val RETRY_DELAY_MS = 5000L
        private const val TAP_WINDOW_MS = 3000L
        private val TAP_RESET_TOKEN = Any()
    }
}
