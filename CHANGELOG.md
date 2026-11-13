# Changelog

## 1.8.4
- **Lost strap contact is recognised:** when the strap loses contact mid-session, beats go missing and the timing turns
  erratic. That stretch is now left out of extra beats, pauses and averages, and the report says when it happened. A
  4 Nov ramp test had shown 157 extra beats and a 4-second "pause" with "reviewed by a doctor soon"; now 7 extra beats,
  no pause, and a note that contact was lost at 08:51–08:55.
- A gap of over 2 seconds with your heart rate above 100 bpm on both sides is shown as a signal gap, not graded as a
  pause, and left out of heart-rate averages (it could pull a 20-second heart rate down by 30 bpm). If such a gap
  falls right at one minute into recovery, the report says recovery was not measured, rather than "cut short".
- **Ramp test:** a step whose last 30 seconds fall in lost signal uses its latest clean 30 seconds or is marked "strap
  lost contact", instead of showing a wrong average (one step had read 129 bpm instead of about 162). Marked steps are
  left out of the plateau check, and a new chart shows heart rate through the steps with each step's value.
- **DFA-α1 thresholds** are fitted to the falling part of the curve only, so the flat stretches at easy and hard effort no
  longer push both thresholds too high (4 Nov: 150 and 156 bpm instead of 153 and 160). When the two are within 8 bpm,
  the anaerobic threshold is shown as approximate.
- Interval plans: the hint says a warm-up before round 1 is fine.
- **Recovery cut short:** if the recording stops less than a minute after Start recovery, the report now says "Cut short"
  with how many seconds were recorded and why it stopped (Stop held, auto-stop), instead of "not measured" or "ended
  while you were still exercising", and no longer shows a "recovery floor" taken from those few seconds. The Recording
  complete screen says so straight away. Holding **Stop** in the first 2 minutes after Start recovery now asks you to hold
  it again, so a stray hold can't cut the recovery short. Why a recording stopped is saved with it.
- Recovery: a few seconds of lost signal right at +1 or +2 minutes no longer leaves that value blank; it is read from
  the heart rates on either side (each at most 10 seconds away).
- **Breathing during Training:** when pedalling or running moves the chest too much for the motion sensor, the live
  display now says "moving" instead of "…" for the whole session, and the report says "Not measured" instead of an
  estimate from the ECG, which isn't reliable during exercise (a 13 Nov ride showed 21.2/min from estimates ranging
  6–27/min).
- **Opening a saved recording file kept its motion data only at some rates:** the H10's motion data (8.3 samples a
  second) was dropped, so breathing and "time still" changed when an export was reopened. Fixed; the Methods page
  also gave the wrong rate.
- Manual: new **Common questions** section, starting with "Why only the Polar H10?".
- Auto-stop no longer applies to **Training**: the switch is hidden and training recordings run until you stop them
  (maximum 8 hours), so a short auto-stop set for morning readings can't cut a session short. Your auto-stop setting is
  kept for the other contexts.
- Release builds (as in Still Point 1.0.2): the Gradle wrapper is checked to be an official Gradle release before it
  runs; the signed APK's version must match the web app's; a release can't attach to a tag left over from an earlier
  attempt; tests run on Node 20 and 22 (Node 18 is end of life; Node 20.12 or newer is required).

## 1.8.3
- **QTc is graded only where it can be trusted.** Above 100 bpm, or before the heart rate has settled after effort,
  heart-rate corrections aren't reliable and a chest strap's T wave is hard to time exactly. QTc is now graded only on
  steady stretches of at least a minute at 50–100 bpm, using Bazett (the correction the normal range was set with),
  and that value is the one shown next to the range, with Fridericia beside it. Otherwise it shows **Not assessed
  (rate)**, with the values but without the normal range, so a training session no longer gets a false "borderline"
  flag. The results summary says so too. Reported by a user.
- QTc trend chart labelled **QTc (Bazett)**; the rate-correction check explains that a flat cloud means the rate
  dependence was removed, while the level is graded separately.
- ECG strips no longer print a heart rate over the interval that starts at an ectopic beat (it read like a 195 bpm
  spike). The report's maximum heart rate already leaves ectopic beats out.
- **Fewer false extra beats:** when the strap shifts and the heartbeat spikes shrink, the app could time a beat on the
  wrong part of the spike and call it an extra beat (one training session showed 81 instead of about 13). A late beat
  followed by an early one is now recognised as a timing slip, and extra beats are not judged where the spikes are too
  small; the report says for how long. The extra-beats card now says "beats".
- **T-wave shape** is now judged on averaged beats, as the "Average beat" picture shows, instead of one beat at a
  time. When the strap's signal is small, single T waves are easily flipped by ordinary wobble, which gave false
  "Outside normal range" results on readings whose averaged T wave was clearly upright.
- Time in zones counts only normal beat-to-beat intervals, so extra beats and timing slips no longer add seconds to the
  top zones.
- **QTc on the short side:** from 330 ms is within the normal range, 320–329 ms borderline and below 320 ms outside it
  (short QT is diagnosed at 320 ms or less, and a chest strap reads QT slightly short). A resting reading of 342 ms is
  no longer flagged.
- **LTHR test:** if heart rate was still climbing over the last 5 minutes, the threshold is still set but marked
  "effort did not level off". The training zones page explains why a threshold effort splits its time between Z4
  and Z5a.
- The web version points to the Android app: a quiet "Also available as an Android app →" link at the bottom of the
  start screen, and an **Android app** button in About (neither shows in the Android app itself). **Check for
  updates** in About now shows only in the Android app, as intended.
- New thank-you line: "No ads, no tracking. If you find this app useful, please consider making a small donation to
  help fund development. Thank you!"
- Release and Android hardening from a security review: signing in a separate, approval-gated step; unused file
  sharing removed; saving writes only to the place chosen in the save screen.

## 1.8.2
- Saved files are named by date, time and recording type, like **2026-10-26_ECG_0712_morning** (.pdf for the report,
  .json for the recording file), so they list in date order and readings to compare are easy to spot.
- Results summary: **Avg heart rate** on every summary, including training and the orthostatic test (lying and standing).
- Links open in the same tab.
- Readings, reports, history and strap details are marked so a browser's Translate button leaves them out
  (translation sends the page's text to an online service). The manual explains this, and that opening the web app
  is an ordinary website visit.
- **New home:** the website moved to Cloudflare Pages, with stricter security headers: no other site can show
  the app inside its own page, and browsers always use HTTPS.
- Shorter thank-you line at the bottom of the start screen.

## 1.8.1
- **Even countdowns:** the recording timer and the step, orthostatic and time-trial countdowns now tick once a second
  evenly, instead of stalling and jumping as the strap's data arrives in Bluetooth bursts.
- **Summary when a recording ends:** the "Recording complete" screen now analyses the recording straight away and shows
  the report's overall verdict with 4-6 key results: heart rate and HRV (with the change from your usual), rhythm, ECG
  shape and signal quality; for training, peak heart rate, recovery and any test result; for the orthostatic test, the
  rise on standing and HRV lying and standing. **View full report** then opens instantly. Suggested by a user.
- Sharper audio cues on Android phones: the orthostatic "stand now" beep, the ramp and DFA step beeps and the end of the
  LTHR time trial are scheduled slightly ahead to allow for the phone's audio delay, so you hear them as the screen
  changes. Cues still waiting are cancelled when you pause, stop or start recovery, and no cues sound while paused.
  Measurements are unaffected: they come from the heartbeat data, not from when a beep is heard.

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
