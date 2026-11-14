package com.smato.player

import android.app.UiModeManager
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.content.res.Configuration
import java.security.MessageDigest
import java.util.UUID

// Everything about this device's advertising state that has to survive a
// restart, in one place. Stored on the device itself, so the offline
// emergency menu and the boot receiver work with no network at all.
object DeviceState {
    const val PREFS_NAME = "smato"
    const val KEY_URL = "player_url"
    private const val KEY_ADS_ENABLED = "ads_enabled"
    private const val KEY_AUTO_START = "auto_start"
    private const val KEY_TOKEN = "device_token"
    private const val KEY_PIN_HASH = "recovery_pin_hash"

    // Advertising mode: the player owns the screen. Off once unlocked.
    fun adsEnabled(prefs: SharedPreferences) = prefs.getBoolean(KEY_ADS_ENABLED, true)

    fun autoStart(prefs: SharedPreferences) = prefs.getBoolean(KEY_AUTO_START, true)

    fun setAdvertising(prefs: SharedPreferences, enabled: Boolean) {
        prefs.edit().putBoolean(KEY_ADS_ENABLED, enabled).putBoolean(KEY_AUTO_START, enabled).apply()
    }

    fun setAutoStart(prefs: SharedPreferences, enabled: Boolean) {
        prefs.edit().putBoolean(KEY_AUTO_START, enabled).apply()
    }

    // The secret this device pairs with. Generated here and never leaves the
    // device except to the server, which stores only its hash.
    fun token(prefs: SharedPreferences): String {
        prefs.getString(KEY_TOKEN, null)?.let { return it }
        val fresh = UUID.randomUUID().toString() + UUID.randomUUID().toString()
        prefs.edit().putString(KEY_TOKEN, fresh).apply()
        return fresh
    }

    // Unpairing: the next pairing starts with a brand new secret.
    fun forgetPairing(prefs: SharedPreferences) {
        prefs.edit().remove(KEY_TOKEN).apply()
    }

    fun pinHash(prefs: SharedPreferences): String? = prefs.getString(KEY_PIN_HASH, null)?.takeIf { it.isNotBlank() }

    fun setPinHash(prefs: SharedPreferences, hash: String?) {
        prefs.edit().putString(KEY_PIN_HASH, hash ?: "").apply()
    }

    // Same recipe the admin uses when setting the PIN (lib/tvAdmin.js).
    fun hashPin(pin: String): String = sha256Hex("smato-pin:$pin")

    fun isTv(context: Context): Boolean {
        val uiMode = context.getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
        return uiMode.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION ||
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
    }

    private fun sha256Hex(text: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(text.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}
