package com.smato.tv

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.RelativeSizeSpan
import android.text.style.StyleSpan
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import android.widget.VideoView

// The whole app: one full-screen screen that plays the ads. Nothing is
// locked — Back leaves the app, Home and Settings work as on any TV app.
// Each time it opens, a start card names the TV and shows its permanent
// code for linking it to the dashboard; a small corner note then keeps
// showing what's left to do (the code until linked, the auto-open setting).
class PlayerActivity : Activity() {

    private lateinit var player: AdPlayer
    private lateinit var updater: Updater
    private lateinit var link: DeviceLink
    private lateinit var corner: TextView
    private lateinit var welcome: TextView
    private val hideCorner = Runnable { corner.visibility = View.GONE }
    private val hideWelcome = Runnable {
        welcome.visibility = View.GONE
        updateCorner()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        val video = VideoView(this).apply { visibility = View.GONE }
        root.addView(video, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT, Gravity.CENTER))
        val image = ImageView(this).apply {
            scaleType = ImageView.ScaleType.FIT_CENTER
            visibility = View.GONE
        }
        root.addView(image, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        // Whenever nothing is playing, this says why — never a blank screen.
        val status = TextView(this).apply {
            setTextColor(Color.parseColor("#E6E6E1"))
            textSize = 22f
            gravity = Gravity.CENTER
            setLineSpacing(0f, 1.25f)
            val pad = (32 * resources.displayMetrics.density).toInt()
            setPadding(pad, pad, pad, pad)
        }
        root.addView(status, FrameLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT, Gravity.CENTER))
        val density = resources.displayMetrics.density
        corner = TextView(this).apply {
            setTextColor(Color.parseColor("#F2F2EE"))
            setBackgroundColor(Color.parseColor("#D9101412"))
            textSize = 16f
            setLineSpacing(0f, 1.2f)
            val pad = (14 * density).toInt()
            setPadding(pad, pad, pad, pad)
            visibility = View.GONE
        }
        root.addView(
            corner,
            FrameLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT, Gravity.TOP or Gravity.END).apply {
                val margin = (20 * density).toInt()
                setMargins(margin, margin, margin, margin)
            }
        )
        welcome = TextView(this).apply {
            setTextColor(Color.parseColor("#F2F2EE"))
            setBackgroundColor(Color.parseColor("#E6101412"))
            textSize = 20f
            gravity = Gravity.CENTER
            setLineSpacing(0f, 1.2f)
            val pad = (36 * density).toInt()
            setPadding(pad, pad, pad, pad)
            visibility = View.GONE
        }
        root.addView(welcome, FrameLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT, Gravity.CENTER))
        setContentView(root)

        link = DeviceLink(
            this,
            nowPlaying = { player.nowPlaying },
            onChange = {
                if (welcome.visibility == View.VISIBLE) welcome.text = welcomeText()
                updateCorner()
            },
            onRestart = { player.restart() },
            onPlay = { id, title -> player.playNow(id, title) },
            onUpdate = { updater.updateNow() }
        )
        player = AdPlayer(this, video, image, status) { link.linkedName }
        updater = Updater(this)
    }

    override fun onResume() {
        super.onResume()
        hideSystemBars()
        player.start()
        link.start()
        AutoOpen.startWatching(this)
        showWelcome()
    }

    override fun onPause() {
        player.pause()
        link.stop()
        super.onPause()
    }

    override fun onDestroy() {
        player.release()
        link.release()
        super.onDestroy()
    }

    // The start card: which TV this is, its permanent code, and whether it's
    // linked to the dashboard yet.
    private fun showWelcome() {
        welcome.removeCallbacks(hideWelcome)
        corner.visibility = View.GONE
        welcome.text = welcomeText()
        welcome.visibility = View.VISIBLE
        welcome.postDelayed(hideWelcome, WELCOME_MS)
    }

    private fun welcomeText(): CharSequence {
        val text = SpannableStringBuilder()
        fun add(part: String, vararg spans: Any) {
            val start = text.length
            text.append(part)
            spans.forEach { text.setSpan(it, start, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
        }
        add("SMATO Ads\n", StyleSpan(Typeface.BOLD), RelativeSizeSpan(1.3f))
        add("${Build.MANUFACTURER} ${Build.MODEL}".trim() + "\n\n")
        add("TV code\n")
        add(link.code + "\n\n", StyleSpan(Typeface.BOLD), RelativeSizeSpan(2.6f))
        val name = link.linkedName
        add(
            if (name != null) {
                "Linked to your dashboard as $name"
            } else {
                "Not linked yet. On your phone: SMATO dashboard → TVs →\nAdd a TV, and enter this code." +
                    if (link.codeReady) "" else "\n(Connecting… the code works once the TV is online.)"
            }
        )
        return text
    }

    // Shows what still needs doing, in a corner, over the ads: the code to
    // link this TV, and the one setting that lets it open by itself. Once
    // both are done, a short "Linked as TV-01" and then nothing.
    private fun updateCorner() {
        corner.removeCallbacks(hideCorner)
        if (welcome.visibility == View.VISIBLE) return
        val lines = mutableListOf<String>()
        val name = link.linkedName
        when {
            name != null -> lines += "Linked to your dashboard as $name (TV code ${link.code})"
            else -> lines += "Link this TV to your phone:\nSMATO dashboard → TVs → Add a TV\nTV code: ${link.code}"
        }
        if (!AutoOpen.allowed(this)) {
            lines += "To open by itself when the TV turns on,\npress OK and allow \"Display over other apps\"."
        }
        corner.text = lines.joinToString("\n\n")
        corner.visibility = View.VISIBLE
        if (name != null && AutoOpen.allowed(this)) corner.postDelayed(hideCorner, 10_000)
    }

    // OK on the remote opens the setting that lets SMATO Ads open itself.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val ok = event.keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
            event.keyCode == KeyEvent.KEYCODE_ENTER ||
            event.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER
        if (ok && event.action == KeyEvent.ACTION_UP && !AutoOpen.allowed(this)) {
            try {
                startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            } catch (error: Exception) {
                corner.text = "This TV doesn't show that setting.\nLook in Settings → Apps → Special app access →\nDisplay over other apps → SMATO Ads."
                corner.visibility = View.VISIBLE
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    companion object {
        private const val WELCOME_MS = 12_000L
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    @Suppress("DEPRECATION")
    private fun hideSystemBars() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            )
    }
}
