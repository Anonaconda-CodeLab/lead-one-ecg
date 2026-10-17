# Contributing

Thanks for your interest in Lead One ECG.

## Development
Requirements: Node.js 18 or later. There are no npm dependencies.

```sh
npm run build   # writes dist/index.html
npm test        # builds, then runs the test suite (node --test)
```

Source layout:

| File | Purpose |
|---|---|
| `src/core.js` | Signal processing: filters, beat detection, ectopic classification, HRV, breathing, waveform measurements, PMD frame decoding, synthetic test signals |
| `src/report.js` | Reference ranges, grading, plain-language text, personal baseline and the A4 report renderer |
| `src/app.js` | Bluetooth recording, storage, history, import/export and the user interface |
| `src/body.html`, `src/style.css` | Markup and styles |
| `build.mjs` | Inlines everything into a single self-contained page with a strict Content Security Policy |

The app is deliberately a single static page with no build-time dependencies, so anyone can audit it and host it anywhere.

## Pull requests
- Run `npm test` and commit the rebuilt `dist/index.html` (CI checks that it is up to date).
- Add or update tests for changes to analysis, grading or file parsing.
- Keep the no-network guarantee: no external scripts, fonts, images or requests.
- For changes to reference ranges or grading, cite the source in `docs/METHODS.md`.
- **Never include real recordings, reports or exports**, even your own, in issues or pull requests. Use `makeDemo()`
  synthetic data instead.

## Licensing of contributions
Lead One ECG is licensed under the GNU GPL v3 or later. By submitting a contribution (a pull request, patch or code in an
issue) you confirm that:

1. you wrote it yourself, or otherwise have the right to submit it;
2. it is licensed to everyone under the GNU GPL v3 or later, like the rest of the project; and
3. you also grant Anonaconda Coding Studio a perpetual, worldwide, non-exclusive, royalty-free licence to use, modify
   and distribute your contribution under other licence terms as well, for example in a separately distributed app.

You keep the copyright in your contribution. If you do not agree to point 3, say so in your pull request before it is
merged.

## Scope
Medical claims, diagnostic labels (e.g. naming a specific arrhythmia) and treatment advice are out of scope. Findings are
described as measurements relative to reference ranges, with a recommendation to consult a clinician where appropriate.
