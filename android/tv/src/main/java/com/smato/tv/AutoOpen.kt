package com.smato.tv

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import androidx.core.content.ContextCompat

// Opening SMATO Ads by itself whenever the TV turns on — after a full power
// on (BootReceiver) and after waking from standby (WakeService). Opening is
// all it does: nothing is locked, Back and Home work as usual.
//
// Android 10+ only lets an app bring itself to the front if it may "display
// over other apps"; the player screen explains how to allow it.
object AutoOpen {
    fun allowed(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || Settings.canDrawOverlays(context)

    fun openPlayer(context: Context) {
        if (!allowed(context)) return
        try {
            context.startActivity(
                Intent(context, PlayerActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            )
        } catch (error: Exception) {
            // The TV refused this time; the next power on tries again.
        }
    }

    fun startWatching(context: Context) {
        try {
            ContextCompat.startForegroundService(context, Intent(context, WakeService::class.java))
        } catch (error: Exception) {
            // Some TVs refuse background services; full power-ons still open the app.
        }
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, "android.intent.action.QUICKBOOT_POWERON" -> {
                AutoOpen.startWatching(context)
                AutoOpen.openPlayer(context)
            }
        }
    }
}

// Stays running quietly so it hears the TV wake from standby (the screen
// coming back on), which Android only announces to running apps.
class WakeService : Service() {
    private val screenOn = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            AutoOpen.openPlayer(context)
        }
    }

    override fun onCreate() {
        super.onCreate()
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        ContextCompat.registerReceiver(
            this,
            screenOn,
            IntentFilter(Intent.ACTION_SCREEN_ON),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) = START_STICKY

    override fun onDestroy() {
        try {
            unregisterReceiver(screenOn)
        } catch (error: Exception) {
            // Wasn't registered.
        }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    @Suppress("DEPRECATION")
    private fun buildNotification(): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "SMATO Ads", NotificationManager.IMPORTANCE_MIN)
            )
            Notification.Builder(this, CHANNEL_ID)
        } else {
            Notification.Builder(this)
        }
        return builder
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("SMATO Ads")
            .setContentText("Opens the ads when the TV turns on")
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "smato_ads"
        private const val NOTIFICATION_ID = 1
    }
}
