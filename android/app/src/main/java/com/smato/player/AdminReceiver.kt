package com.smato.player

import android.app.admin.DeviceAdminReceiver

// Provisioned as device owner by the installer. MainActivity uses this
// component to allowlist the player for lock task mode and persist its Home
// assignment. No admin lifecycle callbacks are needed.
class AdminReceiver : DeviceAdminReceiver()
