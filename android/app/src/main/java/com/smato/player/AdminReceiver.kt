package com.smato.player

import android.app.admin.DeviceAdminReceiver

// Required boilerplate for any Device Admin app. This one only ever calls
// lockNow() from MainActivity — it has no interest in admin lifecycle
// callbacks (password changes, admin-disabled events, etc), so nothing is
// overridden here.
class AdminReceiver : DeviceAdminReceiver()
