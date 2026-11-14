package com.smato.player

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Belt-and-suspenders alongside the HOME intent-filter on MainActivity:
// some OEM launchers don't hand off to the default Home app immediately on
// boot, so this fires the app directly once boot has finished — but only
// while advertising mode and auto start are on. An unlocked TV (from the
// admin's Unlock TV, or the on-device emergency menu) stays unlocked
// through a restart.
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val prefs = context.getSharedPreferences(DeviceState.PREFS_NAME, Context.MODE_PRIVATE)
        if (!DeviceState.adsEnabled(prefs) || !DeviceState.autoStart(prefs)) return
        val launch = Intent(context, MainActivity::class.java)
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(launch)
    }
}
