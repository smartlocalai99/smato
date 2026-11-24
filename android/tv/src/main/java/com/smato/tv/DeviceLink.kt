package com.smato.tv

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.Executors

// Links this TV to the SMATO dashboard on the admin's phone, and keeps it
// linked: until linked it offers a 6-digit code (tv_request_code) and waits
// for an admin to enter it on the TVs page (tv_code_status). Once linked it
// checks in every few minutes (online, what's playing) and carries out the
// dashboard's commands — Restart ads, Play now, Update app, Unpair —
// acknowledging each one
// (device_poll / device_ack). See docs/sql/tv-pairing.sql and tv-control.sql.
class DeviceLink(
    context: Context,
    private val nowPlaying: () -> String?,
    private val onChange: () -> Unit,
    private val onRestart: () -> Unit,
    // Play now: jump to one ad. Runs on the main thread; null means it's playing.
    private val onPlay: (id: String, title: String?) -> String?,
    // Update app: runs on this class's background thread.
    private val onUpdate: () -> Updater.Result,
    // Turn off / on screen from the dashboard (autos.screen_off). Main thread.
    private val onScreen: (off: Boolean) -> Unit = {}
) {
    private val prefs = context.getSharedPreferences("smato_tv", Context.MODE_PRIVATE)
    private val handler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private val tick = Runnable { step() }
    private var codeOffered = false
    private var lastBeat = 0L
    private var running = false

    // The name an admin gave this TV, once linked.
    val linkedName: String? get() = prefs.getString(KEY_NAME, null)

    // This TV's permanent 6-digit code: made on first start and kept for
    // good, so the same number links it again after an unpair or delete.
    val code: String
        get() = prefs.getString(KEY_CODE, null) ?: newCode().also { prefs.edit().putString(KEY_CODE, it).apply() }

    // Whether the dashboard has this TV's screen turned off. Kept on the TV
    // too, so it stays dark after a restart even before it's back online.
    val screenOff: Boolean get() = prefs.getBoolean(KEY_SCREEN_OFF, false)

    // Whether the server has accepted the code yet (it can be entered now).
    val codeReady: Boolean get() = codeOffered

    private val token: String
        get() = prefs.getString(KEY_TOKEN, null) ?: (UUID.randomUUID().toString() + UUID.randomUUID().toString())
            .also { prefs.edit().putString(KEY_TOKEN, it).apply() }

    fun start() {
        if (running) return
        running = true
        handler.post(tick)
    }

    fun stop() {
        running = false
        handler.removeCallbacks(tick)
    }

    fun release() {
        stop()
        executor.shutdownNow()
    }

    private fun step() {
        if (!running) return
        executor.execute {
            try {
                if (linkedName == null) offerAndWait() else stayLinked()
            } catch (error: Exception) {
                // Offline or the server didn't answer; the next round tries again.
            }
            handler.postDelayed(tick, if (linkedName == null) UNLINKED_EVERY_MS else LINKED_EVERY_MS)
        }
    }

    private fun offerAndWait() {
        if (!codeOffered) {
            // Keeps this TV's code; only if another TV already holds it is
            // it swapped for a fresh one (and kept from then on).
            var candidate = code
            for (attempt in 0 until 5) {
                val accepted = rpc("tv_request_code", JSONObject().put("p_code", candidate).put("p_token", token))
                if (accepted == "true") {
                    prefs.edit().putString(KEY_CODE, candidate).apply()
                    codeOffered = true
                    changed()
                    break
                }
                candidate = newCode()
            }
            if (!codeOffered) return
        }
        val name = rpc("tv_code_status", JSONObject().put("p_code", prefs.getString(KEY_CODE, "")).put("p_token", token))
        if (name.isNotBlank() && name != "null") {
            prefs.edit().putString(KEY_NAME, name.trim('"')).apply()
            codeOffered = false
            lastBeat = 0L
            changed()
            handler.post { onRestart() }
            stayLinked()
        }
    }

    private fun stayLinked() {
        val name = linkedName ?: return
        val now = System.currentTimeMillis()
        if (now - lastBeat >= BEAT_EVERY_MS) {
            checkIn(name)
            lastBeat = now
        }
        val answer = rpc("device_poll", JSONObject().put("p_auto", name).put("p_token", token))
        if (answer.isBlank() || answer == "null") {
            // The dashboard no longer knows this TV (unpaired): offer a code again.
            unlink()
            return
        }
        syncScreen(name)
        val commands = JSONObject(answer).optJSONArray("commands") ?: JSONArray()
        for (i in 0 until commands.length()) {
            val command = commands.getJSONObject(i)
            val id = command.getString("id")
            ack(name, id, "received", null)
            when (command.optString("command")) {
                "restart" -> {
                    handler.post { onRestart() }
                    ack(name, id, "completed", "Ads restarted.")
                    lastBeat = 0L
                }
                "play" -> {
                    val payload = command.optJSONObject("payload") ?: JSONObject()
                    val title = payload.optString("title").ifBlank { null }
                    val problem = onMain { onPlay(payload.optString("ad_id"), title) }
                    if (problem == null) {
                        ack(name, id, "completed", "Playing ${title?.let { "\"$it\"" } ?: "that ad"} now.")
                        // Show it as playing on the dashboard right away.
                        Thread.sleep(500)
                        checkIn(name)
                        lastBeat = System.currentTimeMillis()
                    } else {
                        ack(name, id, "failed", problem)
                    }
                }
                "update" -> {
                    val result = onUpdate()
                    ack(name, id, if (result.ok) "completed" else "failed", result.detail)
                }
                "unpair" -> {
                    ack(name, id, "completed", "Unpaired. The TV keeps playing and shows a new code.")
                    unlink()
                    return
                }
                "lock", "unlock" -> ack(name, id, "completed", "SMATO Ads doesn't lock the TV, so there was nothing to change.")
                else -> ack(name, id, "failed", "SMATO Ads doesn't know that command.")
            }
        }
    }

    // Runs block on the main thread and waits for its answer (UI state like
    // the playlist lives there). Gives up after a few seconds.
    private fun <T> onMain(block: () -> T): T? {
        val latch = java.util.concurrent.CountDownLatch(1)
        var answer: T? = null
        handler.post {
            try {
                answer = block()
            } finally {
                latch.countDown()
            }
        }
        latch.await(5, java.util.concurrent.TimeUnit.SECONDS)
        return answer
    }

    // The dashboard's Turn off / on screen, the same autos.screen_off the
    // tablets use. Read on every poll (20 s); acted on only when it changes.
    private fun syncScreen(name: String) {
        val rows = JSONArray(
            get("${BuildConfig.SUPABASE_URL}/rest/v1/autos?select=screen_off&auto_number=eq.${java.net.URLEncoder.encode(name, "UTF-8")}")
        )
        if (rows.length() == 0) return
        val off = rows.getJSONObject(0).optBoolean("screen_off", false)
        if (off == screenOff) return
        prefs.edit().putBoolean(KEY_SCREEN_OFF, off).apply()
        handler.post { onScreen(off) }
    }

    private fun get(url: String): String {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 20_000
        connection.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY)
        connection.setRequestProperty("Authorization", "Bearer ${BuildConfig.SUPABASE_KEY}")
        return try {
            if (connection.responseCode !in 200..299) throw IllegalStateException("server answered ${connection.responseCode}")
            connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    // A new ad just started: tell the dashboard now rather than at the next
    // 3-minute heartbeat, so the phone shows what's really on screen.
    fun reportNow() {
        if (!running || linkedName == null) return
        executor.execute {
            val name = linkedName ?: return@execute
            try {
                checkIn(name)
                lastBeat = System.currentTimeMillis()
            } catch (error: Exception) {
                // Offline; the next heartbeat tries again.
            }
        }
    }

    private fun unlink() {
        prefs.edit().remove(KEY_NAME).apply()
        codeOffered = false
        changed()
        handler.post { onRestart() }
    }

    private fun changed() {
        handler.post { onChange() }
    }

    // Online status and what's on screen, for the dashboard's TVs page.
    private fun checkIn(name: String) {
        val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }
            .format(Date())
        val row = JSONObject()
            .put("auto_number", name)
            .put("last_seen_at", iso)
            .put("now_playing_title", nowPlaying() ?: JSONObject.NULL)
            .put("device_type", "tv")
            .put("app_version", "SMATO Ads ${BuildConfig.VERSION_NAME}")
        request(
            "${BuildConfig.SUPABASE_URL}/rest/v1/autos?on_conflict=auto_number",
            row.toString(),
            "resolution=merge-duplicates,return=minimal"
        )
    }

    private fun ack(name: String, id: String, status: String, detail: String?) {
        rpc(
            "device_ack",
            JSONObject()
                .put("p_auto", name)
                .put("p_token", token)
                .put("p_id", id)
                .put("p_status", status)
                .put("p_detail", detail ?: JSONObject.NULL)
        )
    }

    private fun rpc(function: String, args: JSONObject): String =
        request("${BuildConfig.SUPABASE_URL}/rest/v1/rpc/$function", args.toString(), null)

    private fun request(url: String, body: String, prefer: String?): String {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.doOutput = true
        connection.connectTimeout = 15_000
        connection.readTimeout = 20_000
        connection.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY)
        connection.setRequestProperty("Authorization", "Bearer ${BuildConfig.SUPABASE_KEY}")
        connection.setRequestProperty("Content-Type", "application/json")
        if (prefer != null) connection.setRequestProperty("Prefer", prefer)
        return try {
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = connection.responseCode
            if (code !in 200..299) throw IllegalStateException("server answered $code")
            connection.inputStream.bufferedReader().use { it.readText() }.trim()
        } finally {
            connection.disconnect()
        }
    }

    private fun newCode() = (100000 + (Math.random() * 900000).toInt()).toString()

    companion object {
        private const val KEY_TOKEN = "device_token"
        private const val KEY_CODE = "pairing_code"
        private const val KEY_NAME = "linked_name"
        private const val KEY_SCREEN_OFF = "screen_off"
        private const val UNLINKED_EVERY_MS = 10_000L
        // Often enough that Play now feels immediate; one tiny request each time.
        private const val LINKED_EVERY_MS = 20_000L
        private const val BEAT_EVERY_MS = 3 * 60 * 1000L
    }
}
