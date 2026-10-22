# Changelog

## 1.8.0
- First public release of the Android app, alongside the web app. Download, install guide and checksums:
  https://leadone.anonacondacodelab.com/android.html
- Android app: **Check for updates** in Settings → About; links open in your browser or mail app.
- Contact address (hello@anonacondacodelab.com) and source-code link in Settings → About, the manual and the README.
- Source code published at https://github.com/Anonaconda-CodeLab/lead-one-ecg. Releases are built from tagged source by
  GitHub Actions, with the APK's SHA-256 checksum and the signing certificate's fingerprint in every release.

## 1.7.2
- Deleting a recording now also removes it from your personal baseline (it used to keep counting in later comparisons).
- Orthostatic test: gentler wording when standing HRV comes out higher than lying.

## 1.7.1
- Android app: Bluetooth requests to the strap now wait their turn and are retried if the strap is still busy. This
  fixes "Writing characteristic failed with status code 201" when starting a recording soon after connecting; if it
  still happens, the message now says what to do.
- Orthostatic test: lying values use the 2 minutes ending before the get-ready beep, so the heart-rate rise when you
  prepare to stand is not counted as lying. The report notes when standing HRV comes out higher than lying (deep breaths
  or movement while standing).

## 1.7.0
- New context: **Orthostatic test**. Lie still for 3 minutes, stand at the beep, stand still for 3 minutes; the app guides
  you and stops by itself. The report shows lying heart rate, the peak on standing, the sustained rise, lying and standing
  HRV and the 30:15 ratio, with a chart, and compares each test with your usual values after three tests. New sample report.
- New context: **Spot check** (something felt off). Reports extra beats and pauses, compares with your General rest
  readings, and shows a prominent notice on when to seek emergency care instead.

## 1.6.5
- Recording screen fits the visible screen: Pause, Dim screen and Hold to stop no longer sit under the phone's
  navigation buttons in the Android app. The live ECG trace shrinks to make room for the training panels.

## 1.6.4
- DFA-α1 test: when α1 falls steeply and the two thresholds land within 8 bpm of each other, the report says so and
  points to the aerobic threshold as the more reliable one, with a tip to use smaller steps around that heart rate.
- Link previews (Open Graph), canonical address, robots.txt and sitemap.xml for the web app.

## 1.6.3
- A short thank-you note with a Ko-fi link at the foot of the home screen.

## 1.6.2
- **Interval plans** for intervals sessions: Tabata, 30/30, 10 × 1 min, 4 × 4 min or your own work / rest / rounds,
  chosen before recording or later under Details. The report shows a round-by-round table and a chart with the work
  rounds shaded. Short rests leave no dip in heart rate, so without a plan Tabata looked like one long effort.
- Fixed: J-point level and systolic amplitude were missing from reports since 1.4.0.

## 1.6.1
- Works on iPhone and iPad in the Bluefy browser; the browser guidance now says so. On iPhone and iPad, Save recording and
  Export history use the share sheet (Save to Files); Save as PDF in Bluefy explains the Safari route.
- Date of birth is entered as day, month and year. The phone's own date picker could show another calendar (for example
  Thai Buddhist years, 2511 instead of 1968). Dates in the recordings list no longer follow the phone's calendar either.

## 1.6.0
- New training type: **DFA-α1 test**. 3-minute steps with the usual beeps, a live DFA α1 readout on the recording screen,
  and a report page plotting α1 against heart rate with the aerobic (α1 = 0.75) and anaerobic (α1 = 0.5) thresholds.
  Max HR ramp tests also show these thresholds when α1 falls clearly enough. New DFA-α1 sample report.

## 1.5.3
- Android app: Save recording wrote an empty file for recordings over about 1 MB. The file is now written in pieces
  after the save location is chosen.

## 1.5.2
- Android app (first test build): the same app with native Bluetooth, recording with the screen off, Android's own save
  and print screens, and no internet permission. Browser guidance is hidden in the app.

## 1.5.1
- Maximum and minimum heart rate now come from a 5-beat running median of normal beats. A single stray interval (for
  example a mildly premature beat and its compensatory pause) set a 195 bpm "maximum" in one LTHR test whose real
  peak was about 166 bpm.
- LTHR test: the effort is now timed from when heart rate first reaches effort level, not from pressing Start, and the
  report says how much of the 20-minute window had signal when Bluetooth dropped out.

## 1.5.0
- Settings: tapping the settings icon again, or pressing Esc, closes Settings without saving (as Cancel does).
- Rest sample report: gentler slow heart-rate swings, so its SDNN (about 51 ms) is realistic for a calm morning
  reading; it was 96 ms.
- Privacy fix: sample reports showed the name, age and sex from your profile. They now use a fixed, made-up profile
  (no name, age 40), so they are safe to screenshot and share.
- Browser guidance now reads "Google Chrome or Chromium".
- A gentle Ko-fi card at the bottom of the home screen after 20, 50 and 100 readings. "Not now" hides it until the next
  milestone; tapping Ko-fi hides it for good. Nothing is tracked.
- Add to home screen: a new button under **More** installs the app as a home-screen icon that opens full screen. The
  app now has a web manifest and icons; it still has no service worker and makes no network requests.

## 1.4.0
- LTHR test instructions (app hint, manual, report) now say plainly: warm up first, then press Start as the 30-minute
  effort begins.
- Fix: QRS width could be over-read during exercise (a constant 129 ms in one ramp test). When the main QRS spike points
  downward and the ST segment is raised and sloping, the end of the QRS was pinned to the edge of an 80 ms search window.
  The QRS end is now found by following each QRS wave until its slope levels off, for either polarity; if no clear end
  exists, QRS width is shown as not measurable instead of a fixed value. The J-point level is corrected with it.
- Fix: ordinary beats at high heart rates could be flagged as "different shape" ectopics. Beats are now compared with
  the surrounding beats (a local template) over the QRS only, and on-time beats need a clearly different QRS to be
  flagged. Early beats with a compensatory pause are detected as before.
- Fix: "Run of N beats" now means N consecutive ectopic beats; separate beats close together are listed as a cluster.
- Signal quality: the report now says whether unusable signal was a lost Bluetooth connection or noise, with matching advice.
- New training types: Intervals (each effort detected, with recovery between efforts and fade across the session) and
  Tempo (sustained block, steadiness and cardiac drift).
- Louder training cues: higher-pitched square-wave beeps through a limiter (about +22 dB), with longer vibrations.
- Fix: after importing a history file, the setup screen kept asking for date of birth and sex. A restored profile now
  completes setup.
- New QRS, ectopic, interval and tempo tests.

## 1.3.2
- Linking to the app with `#manual` opens the user manual directly.
- Fix: since 1.3.1, tapping Import on Android asked for microphone permission, because an unfiltered file picker offers
  camera and audio capture. The pickers now list the file types a backup can arrive as, including generic data
  (application/octet-stream), and no media types.

## 1.3.1
- Fix: importing a history file on another phone could fail. Android greyed out backup files received through chat or
  e-mail apps (they arrive labelled as generic data); the file pickers no longer filter by type and validate the
  contents instead. Files with a byte-order mark are accepted.
- First-run setup offers "Import your history file" for people moving from another phone.
- A history export opened with "Open a recording file" is now imported instead of rejected.
- Clearer messages when the chosen file is a recording, unreadable, or not an export.

## 1.3.0
- Home screen states up front that Google Chrome is required (iPhone, Safari and Firefox cannot connect).
- User manual (`docs/MANUAL.md`), built into the app: home screen > User manual, and Settings > About.
- Wellness use only, made explicit: a one-time "Before you start" notice that must be acknowledged before first use;
  a wellness-only line on the home screen; stronger wording in the report disclaimer, page footers and the plain-language
  page; a prominent section at the top of the manual and the README.
- Manual, README and in-app help state plainly which browsers to use: Google Chrome on Android phones; Chrome or Edge
  on computers; iPhone and iPad are not supported.

## 1.2.0
- New home: https://leadone.anonacondacodelab.com. In-app help now points to it (set `appUrl` in `build.mjs`).
- Backup reminder: a banner on the home screen when reading history has never been exported (after 5 readings or a
  week) or the last export is more than 30 days old and newer readings exist. "Remind me in a week" snoozes it.
  Settings shows when history was last backed up.
- Licence changed from MIT to the GNU General Public License v3 or later (copyright Anonaconda Code Lab);
  CONTRIBUTING.md now explains how contributions are licensed.
- Settings > About: "Support on Ko-fi" button (ko-fi.com/anonacondacodelab); FUNDING.yml points to Ko-fi.

## 1.1.0
- Training: working maximum heart rate from your own data (highest 20-s heart rate + 2 %, or a ramp-test plateau as
  measured); Tanaka only without training data. Fox, Tanaka, Nes and Gulati shown side by side for context, with a
  high-max flag when the recorded maximum is more than 12 % above Tanaka.
- New Max HR ramp test (3-minute steps with beeps, vibration and countdown; failure and plateau detection) and LTHR 30-minute
  test with Friel threshold zones (shown first, %max zones alongside).
- Recovery fix: measured from the end of exercise (Start recovery button, or automatic detection), never from a mid-session
  peak; recovery type active/passive with separate limits; heart rate at stop, +1 and +2 min, recovery floor and share of
  the fall. Sessions that end mid-effort no longer produce false borderline flags.
- Exercise grading: QTc uses the Fridericia correction during training or when mean heart rate exceeds 90 bpm; J-point and
  T-wave shape are not graded against resting norms during training (flagged only if extreme). End of exercise is detected
  at the start of the final fall, not at the top of the last effort.
- Training baselines are matched by training type and recovery type instead of body position.
- Fixed: the average-beat trace was shifted right and could run into the measurements panel.

## 1.0.0 — first public release
- Polar H10 ECG recording over Web Bluetooth (130 Hz) with the strap's own beat-to-beat intervals and accelerometer.
- Recording contexts (morning baseline, training, evening, meditation, sleep, general rest) and body positions.
- Auto-stop (1, 2, 2.5, then 5-minute steps up to 8 hours), pause/resume, automatic reconnection, crash-safe storage.
- Session notes (up to 200 characters).
- Analysis: beat detection with sub-sample timing, ectopic beats, pauses, time- and frequency-domain HRV, breathing rate
  from chest movement (ECG-derived fallback), QRS/QT/QTc, T-wave and J-point, exercise peak and heart-rate recovery.
- A4 report with a plain-language "What this means for you" section, four-level grading against age-, sex- and
  position-specific norms, personal baseline comparisons and ECG strips; save as PDF via the browser.
- History export/import; strict no-network Content Security Policy.
