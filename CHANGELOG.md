# Changelog

## 1.2.0
- Backup reminder: a banner on the home screen when reading history has never been exported (after 5 readings or a
  week) or the last export is more than 30 days old and newer readings exist. "Remind me in a week" snoozes it.
  Settings shows when history was last backed up.
- Licence changed from MIT to the GNU General Public License v3 or later (copyright Anonaconda Coding Studio);
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
