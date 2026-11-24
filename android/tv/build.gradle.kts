plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// SMATO Ads: a plain full-screen ad player for TVs. Its own app (separate
// package from the kiosk tablet app in :app), so it installs alongside it
// and never locks anything — Back, Home and Settings all work as normal.
android {
    namespace = "com.smato.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.smato.tv"
        minSdk = 21
        targetSdk = 34
        versionCode = 6
        versionName = "1.5"

        // The same public publishable key the website ships to every
        // browser; it can only read what the database's row rules allow.
        buildConfigField("String", "SUPABASE_URL", "\"https://jkbsbadtejlpizohdyav.supabase.co\"")
        buildConfigField("String", "SUPABASE_KEY", "\"sb_publishable_MT2aikm_dm72sML7MUqTtg_ZphV-9sx\"")
    }

    buildFeatures {
        buildConfig = true
    }

    // One permanent key for every SMATO app, so updates install over the
    // old version and QR setup's fingerprint never changes. The keystore is
    // android/signing/smato-release.p12 (password-protected); CI supplies
    // the password as the SMATO_KEYSTORE_PASSWORD secret.
    signingConfigs {
        val password = System.getenv("SMATO_KEYSTORE_PASSWORD")?.takeIf { it.isNotBlank() }
        if (password != null) {
            create("smato") {
                storeFile = rootProject.file("signing/smato-release.p12")
                storePassword = password
                keyAlias = "smato"
                keyPassword = password
                storeType = "pkcs12"
            }
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfigs.findByName("smato")?.let { signingConfig = it }
        }
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    lint {
        abortOnError = false
    }
}

dependencies {
    // FileProvider, to hand a downloaded update to Android's installer.
    implementation("androidx.core:core:1.13.1")
}
