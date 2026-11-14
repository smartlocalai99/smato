plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.smato.player"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.smato.player"
        // 21 (Lollipop) is the oldest Android with an updatable system
        // WebView — anything older can't run a modern enough engine for
        // service workers / Cache Storage regardless of what this app does.
        minSdk = 21
        targetSdk = 34
        versionCode = 3
        versionName = "1.2"

        // For the built-in backup player (NativePlayer.kt). The publishable
        // key is the same public one the website ships to every browser;
        // it can only do what the database's row rules allow anonymously.
        buildConfigField("String", "SUPABASE_URL", "\"https://jkbsbadtejlpizohdyav.supabase.co\"")
        buildConfigField("String", "SUPABASE_KEY", "\"sb_publishable_MT2aikm_dm72sML7MUqTtg_ZphV-9sx\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
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
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
}
