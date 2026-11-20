package com.smato.player

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

// The device-owner component. Set by QR-code setup (Provisioning.kt) or by
// the installer over USB; MainActivity uses it to allowlist the player for
// lock task mode and persist its Home assignment.
class AdminReceiver : DeviceAdminReceiver() {
    // QR setup has finished: open the player straight away, on the setup
    // screen where the auto number is chosen.
    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
