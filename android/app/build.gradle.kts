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
        versionCode = 5
        versionName = "1.4"

        // For the built-in backup player (NativePlayer.kt). The publishable
        // key is the same public one the website ships to every browser;
        // it can only do what the database's row rules allow anonymously.
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
