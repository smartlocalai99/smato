package com.smato.tv

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
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
// A small corner note shows the code for linking the TV to the dashboard,
// and how to let the app open by itself when the TV turns on.
class PlayerActivity : Activity() {

    private lateinit var player: AdPlayer
    private lateinit var updater: Updater
    private lateinit var link: DeviceLink
    private lateinit var corner: TextView
    private val hideCorner = Runnable { corner.visibility = View.GONE }

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
        setContentView(root)

        link = DeviceLink(
            this,
            nowPlaying = { player.nowPlaying },
            onChange = { updateCorner() },
            onRestart = { player.restart() }
        )
        player = AdPlayer(this, video, image, status) { link.linkedName }
        updater = Updater(this) { message ->
            status.text = message
            status.visibility = View.VISIBLE
        }
    }

    override fun onResume() {
        super.onResume()
        hideSystemBars()
        player.start()
        updater.start()
        link.start()
        AutoOpen.startWatching(this)
        updateCorner()
    }

    override fun onPause() {
        player.pause()
        updater.stop()
        link.stop()
        super.onPause()
    }

    override fun onDestroy() {
        player.release()
        updater.release()
        link.release()
        super.onDestroy()
    }

    // Shows what still needs doing, in a corner, over the ads: the code to
    // link this TV, and the one setting that lets it open by itself. Once
    // both are done, a short "Linked as TV-01" and then nothing.
    private fun updateCorner() {
        corner.removeCallbacks(hideCorner)
        val lines = mutableListOf<String>()
        val name = link.linkedName
        val code = link.code
        when {
            name != null -> lines += "Linked to your dashboard as $name"
            code != null -> lines += "Link this TV to your phone:\nSMATO dashboard → TVs → Add a TV\nCode: $code"
            else -> lines += "Getting a code to link this TV…"
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
