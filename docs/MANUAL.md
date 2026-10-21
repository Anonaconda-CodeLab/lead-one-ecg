# Lead One ECG user manual

Lead One ECG turns a Polar H10 chest strap into a single-lead ECG recorder. It records your heart's electrical signal,
analyses it on your phone and produces a clear A4 report you can save as a PDF. It is free, needs no account, and nothing
you record ever leaves your device.

> **Important: for general wellness and education only. Lead One ECG is not a medical device.**
>
> If you feel unwell, with chest pain or pressure, fainting, severe shortness of breath, or a racing or very irregular
> heartbeat, **call your local emergency number now. Do not stop to record it.**

## Wellness use only: please read
Lead One ECG is designed for **general wellness, fitness training and education**: understanding your own heart-rate
patterns, recovery and heart rate variability over time. It is **not** a medical device and has **not** been tested,
evaluated, cleared or approved by any medical regulator.

**Do not use Lead One ECG to:**
- diagnose, or rule out, any illness or heart condition (for example an arrhythmia, atrial fibrillation, heart attack or
  heart disease);
- monitor a heart condition you already have, or check whether a treatment is working;
- decide whether to take, change or stop any medicine or treatment;
- decide whether you need to see a doctor, or to put off seeing one;
- check on someone else's health, including children; the reference ranges are for adults.

**Why:** the Polar H10 records one view of the heart (one "lead"), while a clinical ECG uses twelve and is read by a
trained professional. Many heart problems cannot be seen with a chest strap at all, the strap can produce misleading
signals, and automated analysis can be wrong. **A normal-looking report does not mean your heart is healthy**, and an
unusual-looking one is most often caused by the strap, a dry electrode or movement rather than by your heart.

Words such as "normal range", "borderline" or "outside normal range" in the app describe how a measurement compares with
published values for healthy adults. They are **not** medical findings. For any health concern, see a doctor, and do not
rely on this app.

The first time you open the app, it asks you to confirm that you have read and understood this.

## What you need
- A **Polar H10** chest strap.
- A browser that supports Bluetooth for web apps (called "Web Bluetooth"):
  - **On a phone, use Google Chrome or Chromium on Android.** This is the browser the app is built and tested for. Other phone
    browsers such as Firefox, Brave or Samsung Internet either cannot use Bluetooth in web apps or are not tested.
  - **On a computer** (Windows, macOS or ChromeOS), use **Chrome or Microsoft Edge**. Other Chromium-based browsers such
    as Opera usually work too. Brave and Linux need a setting switched on first (see *Troubleshooting*), and recording
    on Linux can be unreliable.
  - **On iPhone and iPad, use the free Bluefy browser** (from the App Store). Safari, Chrome and the other iPhone and iPad
    browsers do not offer Web Bluetooth and cannot connect to the strap. **Firefox and Safari** do not support it on any
    device.
- The app's web address: **https://leadone.anonacondacodelab.com**

There is nothing to install from an app store. To open the app from an icon like a normal app, tap **Add to home screen**
under **More** on the home screen and confirm. If Chrome doesn't offer it there, tap Chrome's **⋮** menu and choose **Add to
Home screen** (or **Install app**). The icon opens the same web address, so your recordings and history are all there.
It opens full screen, without the address bar.

## First-time setup
The first time you open the app it shows a short **Before you start** notice about wellness use. Tick the box to confirm
you understand it, then tap **Continue**.

Next it asks for your **date of birth** and **sex**. These choose the right reference ranges
and heart-rate zones; your age is worked out for the date of each recording, so you never need to update it. A name for
the reports is optional. You can change all of this later with the **settings icon** (top right).

## Putting on the strap
1. Moisten the two electrode areas on the inside of the strap with water.
2. Clip the sensor on and fasten the strap snugly just below the chest muscles, with the Polar logo upright.
3. **Close every other app that uses the strap** (Polar Beat, Polar Flow, Elite HRV, ECG Logger and so on). The H10
   sends its ECG to only one app at a time.

## Making a recording
1. Tap **Connect H10** and choose your strap from the list. The dot turns green when it is connected.
2. Optionally choose a **recording context** (Morning baseline, Orthostatic test, Training, Evening, Meditation, Sleep,
   General rest, Spot check) and a **body position** (Lying, Seated, Standing, Walking / moving). These matter more than
   they look: see *Your personal baseline* below.
   - **Orthostatic test**: a 6-minute recovery check, best on waking. Lie on your back and keep still. After 3 minutes the
     app beeps and vibrates: stand up straight away and stand still, without leaning, until it stops by itself at 6
     minutes. The report shows your lying heart rate, the peak on standing, how far heart rate stays raised, and lying and
     standing HRV. After 3 tests it compares each one with your usual values: a higher lying heart rate, a larger rise or
     lower lying HRV than usual can mean you haven't recovered from training, illness, poor sleep or stress.
   - **Spot check**: for when something felt off, such as a flutter or a skipped beat. Record for at least 2 minutes,
     ideally while you still feel it, and describe what you felt in the notes. The report lists any extra beats and pauses
     and compares the reading with your General rest readings. It cannot tell what caused how you felt and cannot rule
     anything out. **If you have chest pain or pressure, fainting, severe shortness of breath, or a racing heartbeat that
     won't settle, call emergency services instead of recording.**
3. Optionally add **session notes** (up to 200 characters), such as "after lunch" or "slept 5 hours".
4. Optionally turn on **Auto-stop** and choose a duration (1, 2 or 2.5 minutes, then in 5-minute steps). With Auto-stop off,
   the recording runs until you stop it, up to 8 hours.
5. Tap **Start**.

While recording you will see the elapsed time, heart rate, signal quality, strap battery, breathing rate (after about
30 seconds) and a live ECG trace.

- **Pause** stops counting without ending the recording. Paused time is left out of the analysis.
- **Dim screen** darkens the screen for long recordings; tap to wake it. Keep the app open in the foreground.
- **Hold to stop**: press and hold the button until it fills. Holding prevents accidental stops.
- If Bluetooth drops, the app reconnects by itself and marks the gap in the report.
- Data is saved every minute. If the phone or browser closes unexpectedly, the next time you open the app it offers to
  **Analyze recording** for the part that was saved.

When the recording ends, tap **View report**. You can also **Save recording file** to keep the raw ECG.

## Training sessions
Choose the **Training** context to measure your exercise heart rate, recovery and zones. Two more choices appear:

**Training type**
- **Session**: any steady or mixed workout (runs, rides, gym).
- **Intervals**: repeated hard efforts with easier recoveries between them (for example 4 × 4 minutes). The report finds
  each effort automatically and shows its peak and average heart rate and how far your heart rate fell before the next one.
  With short rests (Tabata, 30/30) heart rate has no time to fall, so the efforts run together. Pick an **Interval plan**
  (Tabata 20/10 × 8, 30/30, 10 × 1 min, 4 × 4 min, or your own work, rest and rounds) before you start, or later under
  **Details**. The report then lines the rounds up so the last one ends when you tapped **Start recovery**, and shows
  every round's average, peak and end-of-work heart rate. Tap **Start recovery** right as your last round ends.
- **Tempo**: a sustained, comfortably hard effort of at least 10 minutes. The report shows how steadily you held it and
  your cardiac drift: how much your heart rate crept up in the second half at the same effort.
- **DFA-α1 test**: finds your **aerobic threshold** (the top of truly easy training) without a lab, from how orderly your
  beat-to-beat variation is. This measure, DFA α1, is about 1.0 when you are relaxed and falls as effort rises: it crosses
  **0.75 at the aerobic threshold** and **0.5 at the anaerobic threshold**. Best on a bike or treadmill, where effort can rise
  smoothly. Start **very easy for the first 6 minutes**, then raise the effort a little at each beep (every 3 minutes). Keep
  pedalling or running smoothly; talking, stopping and coasting disturb the reading. The recording screen shows a **live α1**
  after the first 2 minutes. Keep going until it is below 0.5 or you are near your limit, then tap **Start recovery**. The
  report plots α1 against heart rate and gives both thresholds. A good, snug strap contact matters: if more than 5 % of beats
  in a stretch are irregular or missed, that stretch is left out. A Max HR ramp test also shows these thresholds when α1
  falls clearly enough.
- **Max HR ramp test**: start easy; the app beeps and vibrates every 3 minutes (with a 10-second warning) to tell you to
  increase the effort, until you cannot continue. Turn the phone's media volume up; the beeps are high-pitched so they
  carry over traffic. This finds your true maximum heart rate.
- **LTHR test**: warm up first **without recording**. Press **Start** at the moment you begin the 30-minute effort, then go
  as hard as you can sustain. The app tells you when 30 minutes are up; tap **Start recovery** then and keep recording for
  2 minutes. Your lactate threshold heart rate (LTHR) is the average of the last 20 minutes before you tapped Start
  recovery, and sets your training zones. (If you do record the warm-up, the 30-minute cue comes early: time the effort
  yourself and tap Start recovery exactly when it ends.)

**Recovery after exercise**
- **Active**: you keep moving gently after stopping (walking, easy pedalling).
- **Passive**: you stand, sit or lie still.

Heart rate falls faster when you stand still, so the app judges active recovery against a more relaxed limit.

**When you finish exercising, tap Start recovery and keep recording for at least 2 minutes.** Recovery is measured from that
moment, not from a peak in the middle of the session. If you forget, the app tries to find the end of exercise by itself.

Your **working maximum heart rate** comes from your own data: the highest heart rate you have held for 20 seconds in any
training recording, plus 2 %, or the plateau of a ramp test. Age formulas (Fox, Tanaka, Nes, and Gulati for women) are
shown for comparison and are used only until you have training data.

## Reading your report
The report has these parts:
1. **Summary**, with an overall verdict and the key numbers.
2. **What this means for you**: each result in plain language, with what it is, how yours compares and what to do.
3. **Training pages** (training recordings only): maximum heart rate, recovery and zones.
4. **Measurements, heart rate and rhythm, heart rate variability, waveform** and **ECG strips**, the detailed pages.
5. **Event log and methods**.

Each result gets a grade:
- **Favourable**: better than typical for your age and sex.
- **Within normal range**.
- **Borderline**: just outside the usual range. Common in a single reading; watch the trend.
- **Outside normal range**: repeat the reading first, since the strap is the most common cause. If you have any health
  concern, see a doctor; do not wait for the app to confirm it.
- **Not assessed**: could not be measured reliably, or does not apply (for example, average heart rate during exercise).

One borderline value does not make the whole report borderline; the overall verdict looks at all results together.

**About chest-strap ECGs.** The H10 records one view of the heart (one "lead"), while a hospital ECG uses twelve.
Waveform measurements such as QTc can read differently from a clinical ECG, and many conditions cannot be seen at all. A
single unusual result is most often caused by strap position, movement or a dry electrode, so repeat the reading. The
grades are for wellness tracking only and are not a diagnosis; see *Wellness use only* above.

### Saving and changing a report
- **Save as PDF** opens the print screen. Choose **Save as PDF** as the printer.
- **On iPhone and iPad:** Save recording and Export history open the share sheet; choose **Save to Files**. Bluefy has no
  print screen, so for a PDF: save the recording, open the app's address in **Safari**, tap **Open a recording file**, choose
  the saved file, and use **Save as PDF** there (Safari can open recordings; it just can't connect to the strap).
- **Save recording** keeps the raw ECG file, so the report can be regenerated later or opened on another device with
  **Open a recording file**.
- **Details** lets you correct the context, position, training type, recovery type or notes afterwards. Tap
  **Update report** to redo the analysis.

## Your personal baseline
After a few readings, the report compares each new reading with **your own usual values**, not just population averages.
This is often more useful: a drop in your heart rate variability compared with your usual range says more than how you
compare with other people.

- A reading is compared with readings of the **same context and position** from the **previous 30 days**. Comparisons
  start once there are **5** of them.
- Training sessions are compared by **training type and recovery type** instead of position.
- **Tag your readings consistently.** A morning reading tagged "Morning baseline · Lying" is only compared with other
  "Morning baseline · Lying" readings. If you forget a tag, fix it with **Details** on the report.

### A good morning-baseline routine
Record on waking, before caffeine, after using the toilet if needed, in the same position every day (lying or seated),
for the same duration (5 minutes is ideal; use Auto-stop). Breathe normally and stay still. Choose
**Morning baseline** and your position each time.

## Your data
Everything is stored **only in Chrome on the device you record with**, at this app's web address. There is no account
and no cloud copy.

- **Reading history** (the summary of each reading, used for your baseline and trends) is small and kept indefinitely.
- **Recordings** (the raw ECG) are kept on the device until you delete them from the list on the home screen.

**Back up regularly.** Clearing Chrome's browsing data ("Cookies and site data"), uninstalling Chrome, resetting or
replacing your phone, or using an Incognito tab would lose them. The app shows a reminder when a backup is due.

- **Settings → Export history** saves a backup file of your reading history. Keep it somewhere safe, such as Google Drive.
- **Settings → Import history** restores it, on the same phone or a new one. Readings already present are not duplicated.
- **Moving to a new phone:** send yourself the backup file (e-mail, Google Drive or a chat app), and **save it to the new
  phone first** (Download, or Save to Files). Then open the app; on the setup screen tap **Import your history file**, or
  later use **Settings → Import history**. Your profile comes across too.
- To keep a particular recording in full, use **Save recording** or **Save as PDF** on its report. Imported history brings
  back your baseline and trends, but not the raw recordings.

## Troubleshooting

### "Bluetooth isn't available"
On a phone, open the app in **Google Chrome or Chromium on Android**, from its https address. On a computer, use Chrome or Edge.
On iPhone and iPad, use the **Bluefy** browser. Safari and Firefox are not supported. On Linux,
enable `chrome://flags/#enable-experimental-web-platform-features`; in Brave, enable `brave://flags/#brave-web-bluetooth-api`.

### The strap connects, but the timer stays at 00:00:00 or "No ECG from the strap" appears
Another app is holding the strap's ECG stream. Force-close other heart-rate apps, unclip the sensor from the strap for
30 seconds, clip it back on, switch the phone's Bluetooth off and on, then reload the app and connect again.

### The strap is not in the list or will not connect
Moisten the electrodes and wear the strap (the H10 sleeps when it is not touching skin). Close other apps connected to
it, and try again after toggling Bluetooth.

### "Weak" or "Noisy" signal
Moisten the electrodes again, tighten the strap, and keep still. A worn strap or an old battery also weakens the signal.

### Breathing shows "…" or "n/a"
Breathing appears after about 30 seconds of still recording. It is measured from chest movement when available, otherwise
estimated from the ECG.

### The report says recovery was not measured
The recording ended while you were still exercising. Tap **Start recovery** when you stop, and keep recording for at least
2 minutes.

## Privacy
Lead One ECG makes no network requests at all while you use it: no analytics, no tracking, no cookies, no account. Your
recordings, history and profile never leave your device unless you export them yourself. The app's source code is open, so
anyone can check this.

## Support and feedback
Lead One ECG is free and open-source software from Anonaconda Code Lab, released under the GNU General Public License v3.
If it is useful to you, you can support its development at **https://ko-fi.com/anonacondacodelab**.

Polar and H10 are trademarks of Polar Electro Oy. Lead One ECG is independent and not affiliated with or endorsed by
Polar Electro.

---

*Lead One ECG is provided "as is", without warranty of any kind, under the GNU General Public License v3. It is for
general wellness and education only and is not a medical device.*
