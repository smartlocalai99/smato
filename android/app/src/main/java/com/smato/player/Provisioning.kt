package com.smato.player

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Bundle

// QR-code setup (docs/tablet-setup.md): on a freshly reset tablet, tapping
// the welcome screen 6 times opens a scanner; the QR code tells Android to
// download this app and make it the device owner. During that, Android
// asks the app two things. Both answers are immediate — there's nothing to
// configure.

// "Which kind of setup?" — a fully managed device (device owner), which is
// what lets the kiosk hide every button, bar and swipe.
class ProvisioningModeActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(
            RESULT_OK,
            Intent().putExtra(
                DevicePolicyManager.EXTRA_PROVISIONING_MODE,
                DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
            )
        )
        finish()
    }
}

// "Anything to set up before finishing?" — no.
class PolicyComplianceActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(RESULT_OK)
        finish()
    }
}
