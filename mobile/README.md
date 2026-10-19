# Lead One ECG for Android

The Android app wraps the same web app (`../dist/index.html`) with [Capacitor](https://capacitorjs.com).
Native code is small and lives in `android/app/src/main/java/com/anonacondacodelab/leadone/`:

- `LeadOnePlugin.java`: saving files, printing to PDF, vibration, keeping the screen on, starting the recording service.
- `RecordingService.java`: a foreground service with a partial wake lock, so recording continues with the screen off.
- `MainActivity.java`: the Back button never closes the app during a recording.

Bluetooth uses [@capacitor-community/bluetooth-le](https://github.com/capacitor-community/bluetooth-le); `src/native.js`
in the web app maps the Web Bluetooth calls the app makes onto it.

The app has **no internet permission** (it is removed in the manifest and the build checks for it).

## Building

GitHub builds the APK on every change (`.github/workflows/android.yml`) and publishes it as the `android-test`
pre-release. To build locally you need Node 22, JDK 21 and the Android SDK:

```
node build.mjs                      # in the repository root
cd mobile && npm ci && npx cap sync android
cd android && ./gradlew assembleRelease
```

Release signing reads `LEADONE_KEYSTORE`, `LEADONE_KEYSTORE_PASSWORD`, `LEADONE_KEY_ALIAS` and `LEADONE_KEY_PASSWORD`
from the environment. Without them the release APK is unsigned.
