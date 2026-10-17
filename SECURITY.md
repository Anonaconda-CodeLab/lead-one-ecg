# Security and privacy

## Design
- **No network access.** The built page carries a Content Security Policy (`default-src 'none'; connect-src 'none'`) so the
  app cannot send or fetch anything, even if malicious code were injected. Fonts are embedded; there are no external scripts,
  analytics or trackers. The only outbound links are optional *Source code* / *Support on Ko-fi* buttons, which open in a new,
  isolated tab (`rel="noopener noreferrer"`).
- **Local storage only.** Recordings, history and profile (date of birth, sex, optional name) are stored in the browser's
  IndexedDB and localStorage on the user's own device. Nothing is uploaded. Data leaves the device only when the user exports
  a file.
- **Untrusted input.** Recording files, history imports and profile fields are validated (types, ranges, lengths, known
  values) and all text is HTML-escaped before display. Tests cover injection attempts.
- **Bluetooth scope.** The app requests only devices named `Polar H10`/`Polar H9` and only the services it needs (PMD
  streaming, heart rate, battery, device information).

## Known limitations
- Data at rest is not encrypted; anyone with access to the unlocked device and browser profile can read it.
- Bluetooth Low Energy traffic from the strap is not encrypted by the device.
- Exported files contain health data and, for history exports, the profile. Treat them like medical records.

## Reporting a vulnerability
Please report security issues privately using GitHub's **Security → Report a vulnerability** (private vulnerability
reporting) on this repository rather than opening a public issue. Include steps to reproduce and the affected version.
