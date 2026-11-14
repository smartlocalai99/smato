package com.smato.player

import android.app.Activity
import android.content.Context
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.ImageView
import android.widget.VideoView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

// Built-in backup player, for devices whose web engine (the system WebView)
// can't run the web player — an old or broken WebView is common on cheap
// TVs, and leaves the screen blank. Plays the ads that run on every auto,
// straight from Supabase, kept on the device so it carries on offline.
// Deliberately simple: no GPS, no admin controls. Wherever the web player
// works, it takes over again (MainActivity).
class NativePlayer(
    private val activity: Activity,
    private val video: VideoView,
    private val image: ImageView
) {
    private data class Ad(val file: File, val isImage: Boolean)

    private val handler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private val dir = File(activity.filesDir, "native-ads").apply { mkdirs() }
    private val prefs = activity.getSharedPreferences(DeviceState.PREFS_NAME, Context.MODE_PRIVATE)
    private var playlist: List<Ad> = emptyList()
    private var index = 0
    private var running = false
    private val advance = Runnable { next() }
    private val refreshTick = Runnable { refresh() }

    // What it's doing, for the on-screen diagnostics.
    @Volatile
    var status: String = "getting the ads…"
        private set

    fun start() {
        if (running) return
        running = true
        playlist = savedPlaylist()
        playCurrent()
        refresh()
    }

    fun stop() {
        running = false
        handler.removeCallbacksAndMessages(null)
        video.stopPlayback()
        video.visibility = View.GONE
        image.setImageDrawable(null)
        image.visibility = View.GONE
    }

    fun release() {
        stop()
        executor.shutdownNow()
    }

    private fun refresh() {
        executor.execute {
            val fresh = try {
                syncAds()
            } catch (error: Exception) {
                status = "couldn't update the ads (${error.message ?: error.javaClass.simpleName}); playing the saved ones"
                null
            }
            handler.post {
                if (!running) return@post
                if (fresh != null) {
                    val wasEmpty = playlist.isEmpty()
                    playlist = fresh
                    if (wasEmpty || index >= playlist.size) {
                        index = 0
                        playCurrent()
                    }
                }
                handler.postDelayed(refreshTick, REFRESH_MS)
            }
        }
    }

    // Background thread: the ads running today for every auto, each file
    // downloaded once; files for ads no longer running are removed.
    private fun syncAds(): List<Ad> {
        val query = "select=id,file_path,media_type,start_date,end_date,sort_order" +
            "&active=eq.true&auto_number=is.null&order=sort_order"
        val connection = URL("${BuildConfig.SUPABASE_URL}/rest/v1/ads?$query").openConnection() as HttpURLConnection
        connection.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY)
        connection.setRequestProperty("Authorization", "Bearer ${BuildConfig.SUPABASE_KEY}")
        connection.connectTimeout = 15_000
        connection.readTimeout = 20_000
        val rows = try {
            JSONArray(connection.inputStream.bufferedReader().use { it.readText() })
        } finally {
            connection.disconnect()
        }

        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        val ads = mutableListOf<Ad>()
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i)
            val start = if (row.isNull("start_date")) null else row.getString("start_date")
            val end = if (row.isNull("end_date")) null else row.getString("end_date")
            if (start != null && today < start) continue
            if (end != null && today > end) continue
            val path = row.getString("file_path")
            val file = File(dir, "${row.getString("id")}.${path.substringAfterLast('.', "bin")}")
            if (!file.exists()) download(path, file)
            ads += Ad(file, row.optString("media_type") == "image")
        }

        val keep = ads.map { it.file.name }.toSet()
        dir.listFiles()?.forEach { if (it.name !in keep) it.delete() }
        savePlaylist(ads)
        status = if (ads.isEmpty()) "no ads are scheduled for all autos right now" else "playing ${ads.size} ad(s)"
        return ads
    }

    private fun download(path: String, target: File) {
        val encoded = path.split("/").joinToString("/") { URLEncoder.encode(it, "UTF-8").replace("+", "%20") }
        val connection = URL("${BuildConfig.SUPABASE_URL}/storage/v1/object/public/ads/$encoded")
            .openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        val part = File(target.path + ".part")
        try {
            status = "downloading ${target.name}…"
            connection.inputStream.use { input -> part.outputStream().use { input.copyTo(it) } }
        } finally {
            connection.disconnect()
        }
        if (!part.renameTo(target)) throw IOException("couldn't save ${target.name}")
    }

    private fun savePlaylist(ads: List<Ad>) {
        val list = JSONArray()
        ads.forEach { list.put(JSONObject().put("file", it.file.name).put("image", it.isImage)) }
        prefs.edit().putString(KEY_PLAYLIST, list.toString()).apply()
    }

    private fun savedPlaylist(): List<Ad> = try {
        val list = JSONArray(prefs.getString(KEY_PLAYLIST, "[]"))
        (0 until list.length()).mapNotNull { i ->
            val item = list.getJSONObject(i)
            val file = File(dir, item.getString("file"))
            if (file.exists()) Ad(file, item.optBoolean("image")) else null
        }
    } catch (error: Exception) {
        emptyList()
    }

    // Same night rule as the web player (lib/time.js): nothing from 9 PM
    // to 9 AM by the device's clock.
    private fun isQuietHour(): Boolean {
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR
    }

    private fun playCurrent() {
        handler.removeCallbacks(advance)
        if (!running) return
        if (isQuietHour() || playlist.isEmpty()) {
            video.stopPlayback()
            video.visibility = View.GONE
            image.visibility = View.GONE
            handler.postDelayed({ playCurrent() }, IDLE_CHECK_MS)
            return
        }
        if (index >= playlist.size) index = 0
        val ad = playlist[index]
        if (ad.isImage) {
            video.stopPlayback()
            video.visibility = View.GONE
            image.setImageBitmap(decodeForScreen(ad.file))
            image.visibility = View.VISIBLE
            handler.postDelayed(advance, IMAGE_MS)
        } else {
            image.setImageDrawable(null)
            image.visibility = View.GONE
            video.visibility = View.VISIBLE
            video.setOnPreparedListener { player ->
                player.isLooping = playlist.size == 1
                video.start()
            }
            video.setOnCompletionListener { next() }
            video.setOnErrorListener { _, _, _ ->
                status = "this device couldn't play ${ad.file.name}; skipping it"
                handler.postDelayed(advance, 2_000)
                true
            }
            video.setVideoPath(ad.file.path)
        }
    }

    private fun next() {
        index = if (playlist.isEmpty()) 0 else (index + 1) % playlist.size
        playCurrent()
    }

    // Scales big photos down to the screen so they can't run a TV out of memory.
    private fun decodeForScreen(file: File) = try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        val screen = activity.resources.displayMetrics
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= screen.widthPixels &&
            bounds.outHeight / (sample * 2) >= screen.heightPixels
        ) {
            sample *= 2
        }
        BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = sample })
    } catch (error: OutOfMemoryError) {
        null
    }

    companion object {
        private const val KEY_PLAYLIST = "native_playlist"
        private const val REFRESH_MS = 15 * 60 * 1000L
        private const val IMAGE_MS = 2 * 60 * 1000L
        private const val IDLE_CHECK_MS = 60 * 1000L
        private const val QUIET_START_HOUR = 21
        private const val QUIET_END_HOUR = 9
    }
}
