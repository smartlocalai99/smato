package com.smato.player

import android.annotation.SuppressLint
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.view.WindowManager
import android.webkit.GeolocationPermissions
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
            showSetup(prefill = "")
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
        private const val LOCATION_PERMISSION_REQUEST = 1001
        private const val RETRY_DELAY_MS = 5000L
        private const val TAP_WINDOW_MS = 3000L
        private val TAP_RESET_TOKEN = Any()
    }
}
