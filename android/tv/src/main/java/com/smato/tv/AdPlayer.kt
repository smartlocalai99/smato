package com.smato.tv

import android.app.Activity
import android.content.Context
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.ImageView
import android.widget.TextView
import android.widget.VideoView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

// Plays the ads scheduled for "All autos" in the SMATO dashboard, one after
// another, forever. Each file is downloaded once and kept on the TV, so it
// keeps playing without internet; the list is checked again every 15
// minutes. Videos play directly through Android — no web engine involved.
class AdPlayer(
    private val activity: Activity,
    private val video: VideoView,
    private val image: ImageView,
    private val status: TextView
) {
    private data class Ad(val file: File, val isImage: Boolean)

    private val handler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private val dir = File(activity.filesDir, "ads").apply { mkdirs() }
    private val prefs = activity.getSharedPreferences("smato_tv", Context.MODE_PRIVATE)
    private var playlist: List<Ad> = emptyList()
    private var index = 0
    private var running = false
    private var failedInARow = 0
    private val advance = Runnable { next() }
    private val refreshTick = Runnable { refresh() }

    fun start() {
        if (running) return
        running = true
        if (playlist.isEmpty()) playlist = savedPlaylist()
        if (playlist.isEmpty()) say("SMATO Ads\n\nGetting the ads…")
        playCurrent()
        refresh()
    }

    // Leaving the app (Back, Home): stop playing and stop checking.
    fun pause() {
        running = false
        handler.removeCallbacksAndMessages(null)
        video.stopPlayback()
    }

    fun release() {
        pause()
        executor.shutdownNow()
    }

    private fun say(message: String?) {
        status.text = message ?: ""
        status.visibility = if (message == null) View.GONE else View.VISIBLE
    }

    private fun refresh() {
        executor.execute {
            var problem: String? = null
            val fresh = try {
                syncAds()
            } catch (error: Exception) {
                problem = error.message ?: error.javaClass.simpleName
                null
            }
            handler.post {
                if (!running) return@post
                if (fresh != null) {
                    val wasEmpty = playlist.isEmpty()
                    playlist = fresh
                    if (playlist.isEmpty()) {
                        stopShowing()
                        say("No ads are scheduled right now.\n\nAdd an ad for \"All autos\" in the SMATO dashboard.")
                    } else if (wasEmpty || index >= playlist.size) {
                        index = 0
                        playCurrent()
                    }
                    handler.postDelayed(refreshTick, REFRESH_MS)
                } else {
                    if (playlist.isEmpty()) {
                        say("Can't reach the SMATO server.\n\nCheck the TV's internet connection. Trying again…\n\n($problem)")
                    }
                    handler.postDelayed(refreshTick, RETRY_MS)
                }
            }
        }
    }

    // Background thread: today's "All autos" ads, each file downloaded once;
    // files for ads that stopped running are removed.
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
        val wanted = mutableListOf<Pair<String, Boolean>>()
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i)
            val start = if (row.isNull("start_date")) null else row.getString("start_date")
            val end = if (row.isNull("end_date")) null else row.getString("end_date")
            if (start != null && today < start) continue
            if (end != null && today > end) continue
            wanted += row.getString("file_path") to (row.optString("media_type") == "image")
        }

        val ads = mutableListOf<Ad>()
        wanted.forEachIndexed { i, (path, isImage) ->
            val name = path.replace("/", "_")
            val file = File(dir, name)
            if (!file.exists()) {
                handler.post { if (playlist.isEmpty()) say("Downloading ads… (${i + 1} of ${wanted.size})") }
                download(path, file)
            }
            ads += Ad(file, isImage)
        }

        val keep = ads.map { it.file.name }.toSet()
        dir.listFiles()?.forEach { if (it.name !in keep) it.delete() }
        savePlaylist(ads)
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
            connection.inputStream.use { input -> part.outputStream().use { input.copyTo(it) } }
        } finally {
            connection.disconnect()
        }
        if (!part.renameTo(target)) throw IOException("couldn't save ${target.name}")
    }

    private fun savePlaylist(ads: List<Ad>) {
        val list = JSONArray()
        ads.forEach { list.put(JSONObject().put("file", it.file.name).put("image", it.isImage)) }
        prefs.edit().putString("playlist", list.toString()).apply()
    }

    private fun savedPlaylist(): List<Ad> = try {
        val list = JSONArray(prefs.getString("playlist", "[]"))
        (0 until list.length()).mapNotNull { i ->
            val item = list.getJSONObject(i)
            val file = File(dir, item.getString("file"))
            if (file.exists()) Ad(file, item.optBoolean("image")) else null
        }
    } catch (error: Exception) {
        emptyList()
    }

    private fun stopShowing() {
        handler.removeCallbacks(advance)
        video.stopPlayback()
        video.visibility = View.GONE
        image.setImageDrawable(null)
        image.visibility = View.GONE
    }

    private fun playCurrent() {
        handler.removeCallbacks(advance)
        if (!running || playlist.isEmpty()) return
        if (index >= playlist.size) index = 0
        val ad = playlist[index]
        say(null)
        if (ad.isImage) {
            video.stopPlayback()
            video.visibility = View.GONE
            image.setImageBitmap(decodeForScreen(ad.file))
            image.visibility = View.VISIBLE
            failedInARow = 0
            handler.postDelayed(advance, IMAGE_MS)
        } else {
            image.setImageDrawable(null)
            image.visibility = View.GONE
            video.visibility = View.VISIBLE
            video.setOnPreparedListener { player ->
                failedInARow = 0
                player.isLooping = playlist.size == 1
                video.start()
            }
            video.setOnCompletionListener { next() }
            video.setOnErrorListener { _, what, extra ->
                failedInARow += 1
                if (failedInARow >= playlist.size) {
                    stopShowing()
                    say("This TV couldn't play the ad videos (error $what/$extra).\n\nTrying again in a minute…")
                    failedInARow = 0
                    handler.postDelayed(advance, RETRY_MS)
                } else {
                    handler.postDelayed(advance, 1_000)
                }
                true
            }
            video.setVideoPath(ad.file.path)
        }
    }

    private fun next() {
        index = if (playlist.isEmpty()) 0 else (index + 1) % playlist.size
        playCurrent()
    }

    // Scales big photos down to the screen so they can't run the TV out of memory.
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
        private const val REFRESH_MS = 15 * 60 * 1000L
        private const val RETRY_MS = 60 * 1000L
        private const val IMAGE_MS = 2 * 60 * 1000L
    }
}
