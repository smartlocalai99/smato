package com.smato.tv

import android.app.Activity
import android.content.Context
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.widget.ImageView
import android.widget.TextView
import android.widget.VideoView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
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
// keeps playing without internet; the list is checked again every 30
// seconds, so ads changed in the dashboard reach the TV quickly and files
// for removed ads are deleted. Videos play directly through Android — no web engine involved.
// Playing starts as soon as the first file is in, smallest first; an
// interrupted download picks up where it stopped.
class AdPlayer(
    private val activity: Activity,
    private val video: VideoView,
    private val image: ImageView,
    private val status: TextView,
    // The name this TV was linked under on the dashboard (DeviceLink), if
    // any: ads sent to that name play here as well as "All autos" ones.
    private val linkedName: () -> String?,
    // Called each time a new ad starts (or nothing is on screen), so the
    // dashboard can show what's playing right away instead of minutes late.
    private val onNowPlaying: () -> Unit = {}
) {
    private data class Ad(val id: String, val file: File, val isImage: Boolean, val title: String)
    private data class Wanted(val id: String, val path: String, val isImage: Boolean, val bytes: Long, val title: String)

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

    // What's on screen right now, for the dashboard (read off the main thread).
    @Volatile
    var nowPlaying: String? = null
        private set

    // From the dashboard's Restart ads, or after linking/unlinking: fetch
    // the list again and start from the first ad.
    fun restart() {
        if (!running) return
        handler.removeCallbacks(refreshTick)
        index = 0
        playCurrent()
        refresh()
    }

    // From the dashboard's Play now: jump to that ad straight away, then
    // carry on through the list from there. Null when it's playing; else why not.
    fun playNow(id: String, title: String?): String? {
        if (!running) return "SMATO Ads isn't on the TV's screen right now."
        var at = playlist.indexOfFirst { it.id == id }
        if (at < 0 && !title.isNullOrBlank()) at = playlist.indexOfFirst { it.title == title }
        if (at < 0) {
            return "That ad isn't on this TV yet. It may still be downloading, be paused, or be meant for another TV."
        }
        index = at
        playCurrent()
        return null
    }

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
        nowPlaying = null
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
                    if (fresh.isEmpty()) {
                        playlist = fresh
                        stopShowing()
                        val forThis = linkedName()?.let { " or for $it" } ?: ""
                        say("No ads are scheduled right now.\n\nAdd an ad for \"All autos\"$forThis in the SMATO dashboard.")
                    } else {
                        adopt(fresh)
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

    // A first ad is ready while the rest are still downloading: start
    // playing (or extend what's playing) instead of waiting for them all.
    private fun offerReady(ready: List<Ad>) {
        if (!running || ready.isEmpty()) return
        adopt(ready)
    }

    // Takes a new list (changed order, ads added, paused or deleted on the
    // dashboard) without losing our place: the ad on screen keeps playing and
    // the list carries on after it in the new order, so "Up next" on the
    // dashboard is what really plays next. If the ad on screen was paused or
    // deleted, it stops now and the next one starts.
    private fun adopt(fresh: List<Ad>) {
        val current = playlist.getOrNull(index)
        val wasEmpty = playlist.isEmpty()
        playlist = fresh
        if (wasEmpty || current == null) {
            index = 0
            playCurrent()
            return
        }
        val at = fresh.indexOfFirst { it.id == current.id && it.file == current.file }
        if (at >= 0) {
            index = at
        } else {
            index = index.coerceAtMost(fresh.size - 1)
            playCurrent()
        }
    }

    // Background thread: today's ads for "All autos" (and for this TV once
    // linked), each file downloaded once; files for ads that stopped running
    // are removed.
    private fun syncAds(): List<Ad> {
        val name = linkedName()
        val target = if (name == null) {
            "auto_number=is.null"
        } else {
            "or=(auto_number.is.null,auto_number.eq.${URLEncoder.encode(name, "UTF-8")})"
        }
        val query = "select=id,title,file_path,file_size,media_type,start_date,end_date,sort_order" +
            "&active=eq.true&$target&order=sort_order"
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
        val wanted = mutableListOf<Wanted>()
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i)
            val start = if (row.isNull("start_date")) null else row.getString("start_date")
            val end = if (row.isNull("end_date")) null else row.getString("end_date")
            if (start != null && today < start) continue
            if (end != null && today > end) continue
            wanted += Wanted(
                row.optString("id"),
                row.getString("file_path"),
                row.optString("media_type") == "image",
                if (row.isNull("file_size")) 0L else row.optLong("file_size", 0L),
                row.optString("title")
            )
        }

        // Download smallest first so something is on screen sooner; the
        // playlist itself keeps the dashboard's order.
        val ready = mutableMapOf<String, Ad>()
        wanted.sortedBy { it.bytes }.forEachIndexed { i, item ->
            val file = File(dir, item.path.replace("/", "_"))
            if (!file.exists()) download(item, file, i + 1, wanted.size)
            ready[item.path] = Ad(item.id, file, item.isImage, item.title)
            val soFar = wanted.mapNotNull { ready[it.path] }
            handler.post { offerReady(soFar) }
        }
        val ads = wanted.mapNotNull { ready[it.path] }

        val keep = ads.map { it.file.name }.toSet()
        dir.listFiles()?.forEach { if (it.name !in keep) it.delete() }
        savePlaylist(ads)
        return ads
    }

    // Downloads into <name>.part, continuing from whatever an interrupted
    // attempt already saved (an HTTP Range request), and shows progress
    // while nothing is playing yet.
    private fun download(item: Wanted, target: File, number: Int, total: Int) {
        val encoded = item.path.split("/").joinToString("/") { URLEncoder.encode(it, "UTF-8").replace("+", "%20") }
        val part = File(target.path + ".part")
        val already = if (part.exists()) part.length() else 0L
        val connection = URL("${BuildConfig.SUPABASE_URL}/storage/v1/object/public/ads/$encoded")
            .openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        if (already > 0) connection.setRequestProperty("Range", "bytes=$already-")
        try {
            val code = connection.responseCode
            if (code == 416 && already > 0) {
                // Nothing left to fetch: the earlier attempt had it all.
                if (!part.renameTo(target)) throw IOException("couldn't save ${target.name}")
                return
            }
            if (code !in 200..299) throw IOException("the server answered $code")
            val resuming = already > 0 && code == 206
            var done = if (resuming) already else 0L
            val of = if (item.bytes > 0) " of ${megabytes(item.bytes)}" else ""
            var shownAt = 0L
            connection.inputStream.use { input ->
                FileOutputStream(part, resuming).use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        done += read
                        val now = SystemClock.uptimeMillis()
                        if (now - shownAt > 1_000) {
                            shownAt = now
                            val text = "Downloading ads… ($number of $total)\n\n${megabytes(done)}$of"
                            handler.post { if (playlist.isEmpty()) say(text) }
                        }
                    }
                }
            }
        } finally {
            connection.disconnect()
        }
        if (!part.renameTo(target)) throw IOException("couldn't save ${target.name}")
    }

    private fun megabytes(bytes: Long) = String.format(Locale.US, "%.1f MB", bytes / 1_000_000.0)

    private fun savePlaylist(ads: List<Ad>) {
        val list = JSONArray()
        ads.forEach { list.put(JSONObject().put("id", it.id).put("file", it.file.name).put("image", it.isImage).put("title", it.title)) }
        prefs.edit().putString("playlist", list.toString()).apply()
    }

    private fun savedPlaylist(): List<Ad> = try {
        val list = JSONArray(prefs.getString("playlist", "[]"))
        (0 until list.length()).mapNotNull { i ->
            val item = list.getJSONObject(i)
            val file = File(dir, item.getString("file"))
            if (file.exists()) Ad(item.optString("id"), file, item.optBoolean("image"), item.optString("title")) else null
        }
    } catch (error: Exception) {
        emptyList()
    }

    private fun stopShowing() {
        val had = nowPlaying != null
        nowPlaying = null
        if (had) onNowPlaying()
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
        nowPlaying = ad.title.ifBlank { null }
        onNowPlaying()
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
        // How soon a change on the dashboard (order, pause, delete, new ad)
        // reaches the TV. One small request; files are only downloaded once.
        private const val REFRESH_MS = 30 * 1000L
        private const val RETRY_MS = 60 * 1000L
        private const val IMAGE_MS = 2 * 60 * 1000L
    }
}
