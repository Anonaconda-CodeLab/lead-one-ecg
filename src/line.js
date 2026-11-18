/* Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
   ---------- Lead One ECG: LINE's built-in browser ----------
   A link opened in a LINE chat opens in LINE's own browser, which has no Web Bluetooth (so it can't connect to the
   strap) and can't save files. There, and only there (never in the Android app), a banner offers to open the same
   address in the phone's own browser, using LINE's documented parameter openExternalBrowser=1 (developers.line.biz,
   "Using LINE features with the LINE URL scheme"). The studio's shared snippet, as in Remark. */
const LeadOneLine = (() => {
  'use strict';
  const inLine = ua => /\bLine\//.test(String(ua || ''));
  const externalUrl = href => { const u = new URL(href); u.searchParams.set('openExternalBrowser', '1'); return u.href; };
  function init() {
    const native = !!(globalThis.Capacitor && typeof globalThis.Capacitor.isNativePlatform === 'function' && globalThis.Capacitor.isNativePlatform());
    const bar = document.getElementById('lineBar');
    if (!bar || native || !inLine(navigator.userAgent)) return;
    document.getElementById('lineOpen').href = externalUrl(location.href);
    bar.hidden = false;
  }
  if (typeof document !== 'undefined') init();
  return { inLine, externalUrl };
})();
globalThis.LeadOneLine = LeadOneLine;
