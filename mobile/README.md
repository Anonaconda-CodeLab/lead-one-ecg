# Lead One ECG for Android

The Android app wraps the same web app (`../dist/index.html`) with [Capacitor](https://capacitorjs.com).
Native code is small and lives in `android/app/src/main/java/com/anonacondacodelab/leadone/`:

- `LeadOnePlugin.java`: saving files, printing to PDF, vibration, keeping the screen on, starting the recording service,
  and opening web and email links in the phone's browser or mail app.
- `RecordingService.java`: a foreground service with a partial wake lock, so recording continues with the screen off.
- `MainActivity.java`: the Back button never closes the app during a recording.

Bluetooth uses [@capacitor-community/bluetooth-le](https://github.com/capacitor-community/bluetooth-le); `src/native.js`
in the web app maps the Web Bluetooth calls the app makes onto it.

The app has **no internet permission** (it is removed in the manifest and the build checks for it).

## Building

GitHub builds the APK on every change to `main` (`.github/workflows/android.yml`) and, once the owner approves the
signing step, publishes it as the `android-test` pre-release. To build locally you need Node 22, JDK 21 and the Android SDK:

```
node build.mjs                      # in the repository root
cd mobile && npm ci && npx cap sync android
cd android && ./gradlew assembleRelease
```

Release signing reads `LEADONE_KEYSTORE`, `LEADONE_KEYSTORE_PASSWORD`, `LEADONE_KEY_ALIAS` and `LEADONE_KEY_PASSWORD`
from the environment. Without them the release APK is unsigned, and Android will not install an unsigned APK. To sign
your own build, make a key once and point the build at it:

```
keytool -genkeypair -v -keystore my-release.jks -alias mykey -keyalg RSA -keysize 4096 -validity 10000
export LEADONE_KEYSTORE=$PWD/my-release.jks LEADONE_KEY_ALIAS=mykey
export LEADONE_KEYSTORE_PASSWORD=... LEADONE_KEY_PASSWORD=...
cd android && ./gradlew assembleRelease     # app/build/outputs/apk/release/app-release.apk
```

A build signed with your own key cannot install over the official app (Android checks the signature). Export your
history and recordings first, uninstall the official app, then install yours.

## Releases

Releases are made by running the *Android APK* workflow by hand on `main` with **release** ticked (Actions → Android
APK → Run workflow, or `gh workflow run android.yml --ref main -f release=true`). Pushing a tag does nothing: the
workflow creates the `v<version>` tag itself, from `package.json`. It works in three separate jobs:

1. **Build** (read-only access): builds the web app and an *unsigned* APK. npm and Gradle never see the signing key,
   its password or a token that could write to the repository.
2. **Sign** (read-only access): signs that APK with the studio's key using `apksigner`, then checks that it has no
   internet permission and that it is signed with the published key (`certSha256` in `../build.mjs`). The key is kept
   in the protected `signing` environment, so every signed build, test builds included, waits for the owner's approval.
3. **Publish** (the only job that can write): publishes the GitHub release with the APK, its SHA-256 checksum and the
   changelog entry, or on an ordinary push to `main` the `android-test` pre-release.

The source code of that exact version is attached to every release by GitHub.
