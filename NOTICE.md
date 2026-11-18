# Notices

## Not a medical device
Lead One ECG is experimental software for personal, educational and research use. It is not a medical device, has not been
cleared or approved by any regulator, and must not be used to diagnose, treat or rule out any condition. See the
[disclaimer in the README](README.md#disclaimer).

## Trademarks
Polar and H10 are trademarks of Polar Electro Oy. Lead One ECG is an independent project and is not affiliated with,
endorsed by or sponsored by Polar Electro. Device names are used only to describe compatibility.

## Third-party components
The built app embeds two typefaces, each licensed under the SIL Open Font License 1.1:

| Font | Copyright | Licence file |
|---|---|---|
| Instrument Sans | The Instrument Sans Project Authors | [src/fonts/OFL-InstrumentSans.txt](src/fonts/OFL-InstrumentSans.txt) |
| IBM Plex Mono | IBM Corp. | [src/fonts/OFL-IBMPlexMono.txt](src/fonts/OFL-IBMPlexMono.txt) |

The **Android app** (built from `mobile/`) also includes:

| Component | Version | Licence |
|---|---|---|
| [Capacitor](https://capacitorjs.com) (`@capacitor/android`, `@capacitor/core`) | 8.5.3 | MIT |
| [@capacitor-community/bluetooth-le](https://github.com/capacitor-community/bluetooth-le) | 8.3.0 | MIT |
| AndroidX libraries (AppCompat, Core, Core KTX, Core SplashScreen, Activity, Fragment, CoordinatorLayout, WebKit) | see `mobile/android/variables.gradle` | Apache-2.0 |
| Kotlin standard library | 2.2.20 | Apache-2.0 |
| Apache Cordova Android framework (in Capacitor; with its [NOTICE](src/vendor/NOTICE-cordova.txt)) | 14.0.1 | Apache-2.0 |
| Gradle wrapper (`mobile/android/gradle/wrapper`, build tool only, not in the app) | | Apache-2.0 |

MIT and Apache-2.0 are compatible with the GNU GPL v3, under which the app as a whole is distributed.

The full licence texts ship with the app, in three places: the **Licences** screen (Settings > About; the Android
components are listed there in the Android app only), `licences.txt` beside the page (the typefaces) and
`licences-android.txt` (the Android components), both also inside the APK. Their sources are in this repository:
[src/fonts/](src/fonts) for the OFL texts and [src/vendor/](src/vendor) for Capacitor's and the Bluetooth plugin's MIT
licences, the Apache License 2.0 and Apache Cordova's NOTICE. A test fails if a font or licence file is added without
an entry.

No other third-party code is included. The Bluetooth protocol implementation is written from Polar's publicly documented
Measurement Data (PMD) specification in the [Polar BLE SDK](https://github.com/polarofficial/polar-ble-sdk).
