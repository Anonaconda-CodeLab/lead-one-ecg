# Methods

This document describes how Lead One ECG records and analyses data, and where its reference ranges come from. It is written
for clinicians, researchers and contributors who want to check or improve the analysis. All processing happens in the
browser; the relevant code is in `src/core.js` (signal processing) and `src/report.js` (grading and report).

## Acquisition
| Stream | Source | Rate / resolution | Use |
|---|---|---|---|
| ECG | Polar H10, PMD measurement type 0 | 130 Hz, µV | Beat detection, waveform, ectopics, breathing fallback |
| Beat intervals | Bluetooth Heart Rate Measurement RR field | 1/1024 s | Heart rate variability (preferred source) |
| Acceleration | PMD measurement type 2, ±8 g, 16-bit | 25–200 Hz, averaged to ≈10–12.5 Hz | Breathing rate, movement |

Pauses and Bluetooth drop-outs are stored as gaps and excluded from every calculation. The accelerometer stream is kept
aligned to the ECG timeline (gaps padded, clock drift corrected to within 1 s).

## Signal conditioning and beat detection
- Zero-phase filtering: 0.5 Hz high-pass, 40 Hz low-pass, 50 Hz notch.
- Two-second segments with flat signal, clipping or high-frequency (muscle) noise are classed as artifact.
- QRS detection: Pan–Tompkins-type energy detector (band-pass 8–20 Hz, derivative, squaring, 150 ms integration) with
  adaptive thresholds and search-back for missed beats [1]. R peaks are refined on the conditioned signal and timed to
  sub-sample precision by parabolic interpolation.

## Ectopic beats and pauses
A beat is flagged as ectopic when it is more than 20 % premature relative to the local median interval and followed by
a compensatory interval (QRS correlation below 0.8 then also counts), or, if it arrives on time, only when its QRS is
clearly different: correlation below 0.6, or peak-to-peak amplitude below 0.4 or above 2.5 times normal. Each beat is
compared with a local template (median of up to 40 surrounding clean beats) over the QRS only (−46 to +62 ms), so the
shifts in P, ST and T at high heart rates do not cause false flags. Beats within 3 s form one event; only consecutive
ectopic beats are called a couplet or run. Pauses are clean RR intervals longer than 2 s.

## Heart rate variability
- Normal-to-normal (NN) intervals only. With strap intervals, values deviating more than 20 % from the local median are
  removed. The ECG-derived series is reported alongside for comparison.
- Time domain (RMSSD, SDNN, pNN50, pNN200, SD1/SD2) per the Task Force definitions [2].
- Frequency domain: linear interpolation to 4 Hz, linear detrending, Hann window, 5-minute segments with
  50 % overlap (shorter recordings use the whole span, minimum ≈110 s); LF 0.04–0.15 Hz, HF 0.15–0.40 Hz.
- LF/HF is flagged as not interpretable when breathing is slower than 9 breaths/min, because the respiratory oscillation
  then falls in the LF band.

## Breathing
1. **Chest movement (preferred).** The three accelerometer axes are analysed in 60-s windows (15-s steps): linear
   detrending, Hann window, summed power spectra, peak search 3–42 breaths/min with parabolic refinement. Windows are
   rejected for body movement (SD of total acceleration > 45 mg or high jerk) or when the peak is not clearly dominant
   (peak/median band power < 6). The result is used if at least 40 % of windows are valid.
2. **ECG-derived fallback.** Combined spectra of R-wave amplitude modulation and respiratory sinus arrhythmia in 90-s
   windows; at rest the search starts at 6 breaths/min to avoid the ≈0.1 Hz blood-pressure (Mayer) wave, which is strong
   when standing. Paced-breathing (meditation) recordings search from 3 breaths/min.

Breathing-linked HRV is the share of 0.033–0.4 Hz HRV power within ±0.03 Hz of the breathing frequency.

## Waveform measurements
Beats are averaged in 5-minute blocks and upsampled ×4. QRS onset is found by a slope threshold. The J point is found by
following the QRS limb by limb from the main peak (either polarity): a limb ends where its slope falls below 6 % of the
maximum QRS slope, and a further large deflection within 40 ms (or a limb ending well beyond the baseline, as at the
bottom of an S wave) continues the QRS. If no end is found within 120 ms of the peak, QRS width is reported as not
measurable rather than given a fixed value; this matters during exercise, when a raised, sloping ST segment can run
straight into the T wave. T end by the tangent method on the T-wave down-slope. QT is measured per beat; QTc is the median of per-beat Bazett values, with
Fridericia shown for comparison. A single chest lead is not equivalent to a 12-lead ECG; waveform findings should be
confirmed clinically.

## Training
### End of exercise and recovery
Session maximum and minimum heart rate come from a 5-beat running median of normal beats (beats spanning at most 8 s),
so one stray interval, such as a premature beat too mild to be flagged and its compensatory pause, cannot set them. Heart rate is averaged in 10-s and 20-s windows (time-weighted over clean beats). The end of exercise is the moment the
user taps **Start recovery**; if they do not, it is detected automatically as the highest point that everything after it
stays below, followed by a fall of at least 10 bpm within 2 minutes and no renewed effort (nothing within 12 bpm of it from
1 minute later onwards). Recovery is always measured from this point, never from a peak in the middle of a session, so
interval sessions with active recovery between efforts do not produce false flags. If the recording ends during the
effort, recovery is reported as not measured.

Reported: heart rate at stop, at +1 and +2 minutes, the falls (HRR1, HRR2), the recovery floor (lowest 10-s heart rate after
stopping) and the share of the total fall to the floor reached in the first minute. HRR1 is graded by recovery type:
**active** (kept moving) ≤ 12 bpm outside normal range, 13–17 borderline [6]; **passive** (still) ≤ 18 bpm outside,
19–22 borderline (passive recovery gives larger falls, so the limit is higher; approximate).

### Maximum heart rate
- **Working maximum:** the highest 20-s rolling-mean heart rate in any training recording, plus 2 % (true maximum usually
  sits a few bpm above anything yet recorded). A ramp test that reaches a plateau is used as measured, without margin. The
  higher of the two applies. Age formulas are used only when no training data exist (Tanaka).
- **Age formulas, for context only:** Fox (220 − age) [7], Tanaka (208 − 0.7 × age) [8], Nes (211 − 0.64 × age) [9] and,
  for women, Gulati (206 − 0.88 × age) [10]. If the recorded maximum is more than 12 % above Tanaka, the report flags a
  high-max individual for whom age formulas under-read.
- Interval sessions (e.g. 4 × 4 min) rarely elicit true maximum; their peaks are a floor, not a ceiling.

### Max HR ramp test
3-minute steps from the start of the recording with audio/vibration cues; the user increases the load at each step until
failure and taps Start recovery. Failure is the marked or detected end of exercise. Measured maximum = highest 20-s mean
before failure. A plateau is declared when it is within 2 bpm of the heart rate at the end of the last step completed at
least a minute before failure (at least three steps required).

### DFA-α1 thresholds
Detrended fluctuation analysis [14] of the beat intervals (the strap's 1-ms intervals when recorded, otherwise ECG normal
beats): the series is mean-centred and integrated, split into boxes of 4–16 beats (from the start and from the end), each box
is detrended with a straight line, and α1 is the slope of log fluctuation against log box size. It is computed over 2-minute
windows every 10 s up to the end of exercise; windows with fewer than 90 beats or more than 5 % artifacts (strap intervals
outside 300–2500 ms or more than 20 % from the local median, or ectopic beats) are left out. After a 5-window running median,
a straight line is fitted to α1 against heart rate from the highest α1 in the first 60 % of the test onward (α1 between
0.2 and 1.5). HRVT1 is the heart rate where the line crosses 0.75 [12] and HRVT2 where it crosses 0.5 [13], reported only
when α1 actually reached those levels, the line falls (r² ≥ 0.3), and the crossing lies within the observed heart-rate range.
The recording screen shows α1 live over the last 2 minutes, updated every 10 s.

### LTHR test
30-minute time trial; lactate-threshold heart rate = mean heart rate over the last 20 minutes before the end of exercise
(valid if the effort lasted at least 25 minutes and the window has signal for at least 80 % of its length; Bluetooth gaps
are left out). The effort is timed from the moment the 20-s heart rate first reaches 90 % of that mean, so pressing Start a
few minutes early does not lengthen it. Threshold zones follow Friel: Z1 < 85 %, Z2 85–89 %, Z3 90–94 %,
Z4 95–99 %, Z5a 100–102 %, Z5b 103–106 %, Z5c > 106 % of LTHR [11]. Training reports show LTHR zones first (from the most
recent valid test) and zones by working maximum (50–60/60–70/70–80/80–90/90+ %) alongside.

## Reference ranges and grading
Four grades are used: **Favourable**, **Within normal range**, **Borderline**, **Outside normal range** (plus *Not
assessed* where a population comparison would be misleading, e.g. HRV during exercise or paced breathing).

| Measure | Basis | Grading |
|---|---|---|
| RMSSD, SDNN (rest) | Pooled short-term norms (RMSSD 42 ± 15 ms, SDNN 50 ± 16 ms) [3]; age and sex adjustments approximated from [4]; position factors (seated 0.85, standing 0.6 for RMSSD) | < 5th percentile outside; 5th–15th borderline; 15th–75th normal; > 75th favourable. SDNN graded only for recordings ≤ 20 min |
| Resting heart rate | Conventional adult ranges; separate bands for sleep and standing | 40s–50s favourable at rest; > 100 or < 40 bpm (awake) outside |
| QTc (Bazett; Fridericia during training or when mean HR > 90 bpm) | Men ≤ 430 ms normal, 431–450 borderline, > 450 prolonged; women ≤ 450, 451–470, > 470 [5]; < 350 ms short | ≥ 500 ms flagged for prompt review |
| QRS duration | ≤ 100 ms normal; 101–119 borderline; ≥ 120 ms wide | |
| J point | −100 to +200 µV normal at rest (single chest lead) | Training: not graded (junctional depression is normal during exercise) unless below −200 µV; T-wave shape likewise unless < 70 % upright |
| Heart-rate recovery (1 min) | Active: ≤ 12 bpm outside, 13–17 borderline [6]; passive: ≤ 18, 19–22 | Active ≥ 30, passive ≥ 40 favourable |
| Ectopic beats | < 1 % normal; 1–10 % borderline; > 10 % outside | |
| Pauses | 2–3 s borderline when awake (normal in sleep); ≥ 3 s outside | |

The RMSSD and SDNN norms are approximations intended to orient users, not validated diagnostic thresholds. Contributions
that replace them with better-sourced, age- and sex-stratified values are welcome.

## Personal baseline
Readings with the same context and body position from the previous 30 days are compared once at least five exist.
Training readings are matched by training type (session, ramp test, LTHR test) and recovery type (active, passive)
instead of body position. The
usual RMSSD range is mean ± 1 SD of ln(RMSSD); heart rate uses mean ± 1 SD. Consecutive readings below range and the
7-reading trend relative to the 30-day mean are reported.

## References
1. Pan J, Tompkins WJ. A real-time QRS detection algorithm. *IEEE Trans Biomed Eng.* 1985;32(3):230–236.
2. Task Force of the European Society of Cardiology and the North American Society of Pacing and Electrophysiology. Heart
   rate variability: standards of measurement, physiological interpretation and clinical use. *Circulation.*
   1996;93(5):1043–1065.
3. Nunan D, Sandercock GRH, Brodie DA. A quantitative systematic review of normal values for short-term heart rate
   variability in healthy adults. *Pacing Clin Electrophysiol.* 2010;33(11):1407–1417.
4. Voss A, Schroeder R, Heitmann A, Peters A, Perz S. Short-term heart rate variability—influence of gender and age in
   healthy subjects. *PLoS One.* 2015;10(3):e0118308.
5. Goldenberg I, Moss AJ, Zareba W. QT interval: how to measure it and what is "normal". *J Cardiovasc Electrophysiol.*
   2006;17(3):333–336.
6. Cole CR, Blackstone EH, Pashkow FJ, Snader CE, Lauer MS. Heart-rate recovery immediately after exercise as a predictor
   of mortality. *N Engl J Med.* 1999;341(18):1351–1357.
7. Fox SM, Naughton JP, Haskell WL. Physical activity and the prevention of coronary heart disease. *Ann Clin Res.*
   1971;3(6):404–432.
8. Tanaka H, Monahan KD, Seals DR. Age-predicted maximal heart rate revisited. *J Am Coll Cardiol.* 2001;37(1):153–156.
9. Nes BM, Janszky I, Wisløff U, Støylen A, Karlsen T. Age-predicted maximal heart rate in healthy subjects: the HUNT
   Fitness Study. *Scand J Med Sci Sports.* 2013;23(6):697–704.
10. Gulati M, Shaw LJ, Thisted RA, Black HR, Bairey Merz CN, Arnsdorf MF. Heart rate response to exercise stress testing in
    asymptomatic women: the St. James Women Take Heart Project. *Circulation.* 2010;122(2):130–137.
11. Friel J. *The Triathlete's Training Bible.* 4th ed. Boulder, CO: VeloPress; 2016.
12. Rogers B, Giles D, Draper N, Hoos O, Gronwald T. A new detection method defining the aerobic threshold for endurance
    exercise and training prescription based on fractal correlation properties of heart rate variability. *Front Physiol.*
    2021;11:596567.
13. Rogers B, Giles D, Draper N, Mourot L, Gronwald T. Detection of the anaerobic threshold in endurance sports: validation of
    a new method using correlation properties of heart rate variability. *J Funct Morphol Kinesiol.* 2021;6(2):38.
14. Peng CK, Havlin S, Stanley HE, Goldberger AL. Quantification of scaling exponents and crossover phenomena in
    nonstationary heartbeat time series. *Chaos.* 1995;5(1):82–87.
