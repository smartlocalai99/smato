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

// Updates SMATO Ads without a USB stick — but only when an admin presses
// "Update app" for this TV on the dashboard (the "update" command,
// DeviceLink). It never checks or interrupts the ads on its own: an
// unasked-for install screen over the ads, coming back after every loop
// when an install can't go through, is worse than an old version.
// It asks GitHub which version the latest build is (smato-tv.json,
// published next to smato-tv.apk), downloads a newer one, and opens
// Android's installer; someone at the TV presses "Update" on the remote —
// apps outside the Play Store can't replace themselves silently.
class Updater(private val activity: Activity) {

    class Result(val ok: Boolean, val detail: String)

    private val handler = Handler(Looper.getMainLooper())

    // Runs on a background thread (DeviceLink's). The answer goes back to
    // the dashboard as the command's result.
    fun updateNow(): Result {
        // Installing needs a content URI the installer can read (Android 7+).
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            return Result(false, "This TV's Android is too old to update itself. Install smato-tv.apk with a USB stick.")
        }
        val latest = try {
            JSONObject(fetchText(VERSION_URL)).getInt("versionCode")
        } catch (error: Exception) {
            return Result(false, "Couldn't check for a new version (${error.message ?: "no internet?"}). Try again later.")
        }
        if (latest <= BuildConfig.VERSION_CODE) {
            return Result(true, "Already up to date (SMATO Ads ${BuildConfig.VERSION_NAME}).")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.packageManager.canRequestPackageInstalls()
        ) {
            handler.post {
                try {
                    activity.startActivity(
                        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}"))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                } catch (error: Exception) {
                    // Some TVs hide this screen; the result below says where to look.
                }
            }
            return Result(
                false,
                "The TV needs one permission first: allow \"Install unknown apps\" for SMATO Ads " +
                    "(Settings → Apps → Special app access), then press Update app again."
            )
        }
        val apk = File(File(activity.cacheDir, "updates").apply { mkdirs() }, "smato-tv.apk")
        try {
            download(APK_URL, apk)
        } catch (error: Exception) {
            return Result(false, "Couldn't download the new version (${error.message ?: "connection dropped"}). Try again.")
        }
        handler.post { install(apk) }
        return Result(
            true,
            "Downloaded the new version. The TV now shows Android's install screen: press Update with the remote. " +
                "If it says \"App not installed\", uninstall SMATO Ads on the TV and install smato-tv.apk once with a USB stick."
        )
    }

    private fun install(apk: File) {
        if (activity.isFinishing) return
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
    }
}
