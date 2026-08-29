package com.smato.player

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Belt-and-suspenders alongside the HOME intent-filter on MainActivity:
// some OEM launchers don't hand off to the default Home app immediately on
// boot, so this fires the app directly once boot has finished.
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val launch = Intent(context, MainActivity::class.java)
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(launch)
        }
    }
}
