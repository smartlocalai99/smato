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
        versionCode = 1
        versionName = "1.0"

        // The same public publishable key the website ships to every
        // browser; it can only read what the database's row rules allow.
        buildConfigField("String", "SUPABASE_URL", "\"https://jkbsbadtejlpizohdyav.supabase.co\"")
        buildConfigField("String", "SUPABASE_KEY", "\"sb_publishable_MT2aikm_dm72sML7MUqTtg_ZphV-9sx\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
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
