package com.smato.tv

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

// Keeps SMATO Ads up to date without a USB stick: every few hours it asks
// GitHub which version the latest build is (smato-tv.json, published next
// to smato-tv.apk), downloads a newer one, and opens Android's installer.
// Android needs one press of "Update" on the remote — apps outside the Play
// Store can't replace themselves silently.
class Updater(private val activity: Activity, private val say: (String) -> Unit) {

    private val handler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private val tick = Runnable { check() }

    fun start() {
        handler.removeCallbacks(tick)
        handler.postDelayed(tick, FIRST_CHECK_MS)
    }

    fun stop() {
        handler.removeCallbacks(tick)
    }

    fun release() {
        stop()
        executor.shutdownNow()
    }

    private fun check() {
        handler.postDelayed(tick, CHECK_EVERY_MS)
        // Installing needs a content URI the installer can read (Android 7+).
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
        executor.execute {
            try {
                val latest = JSONObject(fetchText(VERSION_URL)).getInt("versionCode")
                if (latest <= BuildConfig.VERSION_CODE) return@execute
                val apk = File(File(activity.cacheDir, "updates").apply { mkdirs() }, "smato-tv.apk")
                download(APK_URL, apk)
                handler.post { install(apk) }
            } catch (error: Exception) {
                // No update this time (offline, GitHub unreachable); try later.
            }
        }
    }

    private fun install(apk: File) {
        if (activity.isFinishing) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.packageManager.canRequestPackageInstalls()
        ) {
            say("A new version of SMATO Ads is ready.\n\nTo let it update itself, allow \"Install unknown apps\" for SMATO Ads, then come back.")
            try {
                activity.startActivity(
                    Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}"))
                )
            } catch (error: Exception) {
                // Some TVs hide this screen; the next check tries again.
            }
            return
        }
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.updates", apk)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            activity.startActivity(intent)
        } catch (error: Exception) {
            // No installer available; nothing else to do.
        }
    }

    private fun fetchText(url: String): String {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 20_000
        return try {
            connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    private fun download(url: String, target: File) {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        val part = File(target.path + ".part")
        try {
            connection.inputStream.use { input -> part.outputStream().use { input.copyTo(it) } }
        } finally {
            connection.disconnect()
        }
        target.delete()
        if (!part.renameTo(target)) throw IllegalStateException("couldn't save the update")
    }

    companion object {
        private const val RELEASE = "https://github.com/smartlocalai99/smato/releases/download/latest-apk"
        private const val VERSION_URL = "$RELEASE/smato-tv.json"
        private const val APK_URL = "$RELEASE/smato-tv.apk"
        private const val FIRST_CHECK_MS = 60 * 1000L
        private const val CHECK_EVERY_MS = 6 * 60 * 60 * 1000L
    }
}
