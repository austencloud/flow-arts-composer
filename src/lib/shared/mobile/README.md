# Mobile

PWA install, fullscreen, gestures, and share helpers.

## Add to home screen

- `components/EnhancedPWAInstallGuide.svelte`: the bottom sheet with
  iPhone / Android / Computer pills and numbered steps. Bind `showGuide` to
  open it. The detected device is the default pill; a manual pick is kept in
  the `?install=` URL param while the sheet is open.
- `config/pwa-install-instructions.ts`: step copy and screenshot paths per
  platform and browser, plus `resolveInstallVariant()` for the pill mapping.
  Step text is trusted HTML rendered with `{@html}`; keep it static.
- `services/mobile-fullscreen-manager.ts`: holds Chrome's
  `beforeinstallprompt` event. `src/app.html` captures that event at page
  load into `window.__tkaInstallPrompt`, and the manager adopts it, because
  the manager is created lazily and would otherwise miss it.
- `/start` calls `promptInstallPWA()` when `canInstallPWA()` is true and opens
  the sheet otherwise.

Screenshots live in `static/images/install-guides/`. The Android ones are crops
of the captures in `docs/install-guide-captures/`. The iPhone steps have no
screenshots yet; set `image` on an ios-safari step to add one.

## Other pieces

- `services/platform-detector.ts`: platform, browser, and in-app browser detection.
- `services/pwa-engagement-tracker.ts`, `services/pwa-install-dismissal-manager.ts`:
  install-nudge timing and dismissal memory.
- `services/gesture-handler.ts`, `share-action.svelte.ts`, `utils/keyboard-inset.svelte.ts`.
