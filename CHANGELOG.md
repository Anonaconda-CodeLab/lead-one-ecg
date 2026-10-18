# Changelog

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
