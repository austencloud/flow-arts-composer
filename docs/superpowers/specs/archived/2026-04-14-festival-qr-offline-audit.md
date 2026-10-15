---
status: archived
value: 4
effort: M
remaining: "Superseded by the active native-mobile integration spec and the 2026-06-30 offline-persistence audit. Android App Links and appUrlOpen shipped; iOS Universal Links remain owned by native mobile. The proposed dense inline-QR default was deliberately retired as unscannable."
depends_on: "2026-04-24-native-mobile-integration-design.md"
plan_path: ""
tags: []
last_triaged: 2026-07-30
---
# Festival QR Offline Flow — Audit & Path Forward (Capacitor-era)

> **Archived 2026-07-30:** Superseded by
> `active/2026-04-24-native-mobile-integration-design.md` and
> `docs/archive/swarm-2026-10-14/reference/offline-persistence-audit-2026-06-30.md`. Android App Links
> and cold/warm `appUrlOpen` routing landed in `d321342cc3`. iOS Universal
> Links and device verification remain in the native-mobile spec. The proposed
> festival default of dense self-contained `s~...` QRs was later rejected in
> `29ad58ae16` because those codes were not reliably scannable.

**Date:** 2026-04-14
**Scope:** The "festival QR code scenario": user scans a printed QR code with a phone that may have poor or no connectivity, lands on a sequence viewer, and should see the sequence render.

**Update 2026-04-14:** Project is pivoting to native app distribution via Capacitor 8 (Android already wired, iOS pending GitHub Actions setup). This changes the offline problem substantially. PWA-scoped fixes are de-prioritized; the real work is deep link configuration.

## TL;DR

With Capacitor, the app shell lives on-device from install. Service worker scope, Workbox precache, and static snapshot fallback — the big three gaps in the PWA audit — are all **moot for app users**. The remaining offline-critical work is:

1. **Android App Links + iOS Universal Links**, so QR codes open *in* the installed app rather than the browser.
2. **Inline encoding (`s~...`)** must be the default for all festival-printed QR codes — it decodes locally with zero network, works immediately after app install.
3. **A minimal web fallback** for users who scan before installing the app — redirects them to the App Store / Play Store.

The PWA path still matters for the desktop web experience, but it is no longer the critical path for festival QR.

## What Capacitor Changes

| Problem in PWA audit | Status with Capacitor |
|---|---|
| SW scope `/app` excludes `/p/[code]` | Moot — no SW, app shell is bundled in APK/IPA |
| Static snapshot file missing | Still useful as Firebase-outage fallback, but not offline-critical |
| Snapshot script output path wrong | Fix only if we keep the snapshot as fallback |
| JSON excluded from Workbox precache | Moot |
| Firebase resolution offline | Still relevant — Firestore `persistentLocalCache` handles re-scans |
| 3D assets not precached | Moot — bundled in app binary via `webDir: "build"` |

## Current Capacitor State (as of 2026-04-14)

- Android: `android/` exists, builds, has signed APK at repo root.
- iOS: not yet scaffolded. Plan: GitHub Actions macOS runner when ready.
- `capacitor.config.ts`: `appId: "com.tkaflowarts.composer"`, `androidScheme: "https"`, `webDir: "build"`.
- `build:native` script sets `DISABLE_PWA=true` before building, so the native bundle has no service worker. Correct.
- `AndroidManifest.xml`: **no `android.intent.action.VIEW` intent filter for web URLs.** Only `MAIN`/`LAUNCHER`. QR codes pointing at `tkaflowarts.com/p/CODE` will open Chrome, not the app.
- No `.well-known/assetlinks.json` deployed. Required to prove domain ownership for Android App Links.
- `android-twa/` legacy folder still present. Decision needed: which one ships to Play Store.

## Festival QR Flow in the Capacitor World

### User already has the app installed

1. QR code `https://tkaflowarts.com/p/s~<encoded>` scanned by phone camera.
2. OS recognizes the App Link → launches TKA Composer directly.
3. Capacitor App plugin's `appUrlOpen` event fires with the URL.
4. App routes internally to `/p/s~<encoded>`.
5. `ShortCodeManager.resolveShortCode()` sees `s~` prefix → local decode. No network.
6. Sequence renders. Works offline.

### User does not have the app installed

1. QR scan opens Chrome/Safari.
2. Browser loads `tkaflowarts.com/p/s~<encoded>`.
3. If online: web viewer renders the sequence. Offer App Store / Play Store banner.
4. If offline: browser error page. Accepted failure mode — the printed card can include "Install TKA before scanning" messaging.

### User has a Firebase-backed code (`/p/ABC123`) offline

1. If code was previously resolved online: Firestore `persistentLocalCache` hit → renders.
2. If never seen before: graceful "needs internet to fetch this code" screen.

## Required Work

### Tier 1 — Festival-critical (blocks actual use case)

1. **Android App Links configuration.**
   - Add `<intent-filter>` to `AndroidManifest.xml` with `android.intent.action.VIEW`, `android:autoVerify="true"`, and data tags for `https://tkaflowarts.com/p/*` (and `/sequence/*`, `/share/*` — any deep-linkable routes).
   - Generate `.well-known/assetlinks.json` with the Play Store signing cert SHA-256 fingerprint.
   - Deploy `assetlinks.json` to `tkaflowarts.com/.well-known/assetlinks.json`.
   - Verify with `adb shell am start -a android.intent.action.VIEW -d "https://tkaflowarts.com/p/XYZ"` — should open the app, not the browser.

2. **Handle `appUrlOpen` in the app.**
   - Register a listener on the `@capacitor/app` plugin's `appUrlOpen` event.
   - Extract the path from the incoming URL, route via SvelteKit's `goto()`.
   - Cold-start handling: when the app launches from a link (vs. LAUNCHER icon), route to the link target before the default entry screen.

3. **Enforce inline encoding for festival-printed QR codes.**
   - Find every festival/print QR code generation site. Switch them to `ShortCodeManager.createOfflineCode()` exclusively.
   - Verify the resulting URL length fits on a printed card at readable QR size.

### Tier 2 — iOS Universal Links (blocks iOS launch)

4. Once the `ios/` platform is scaffolded, configure Associated Domains entitlement + `apple-app-site-association` file served from `tkaflowarts.com/.well-known/apple-app-site-association`.

### Tier 3 — Web fallback cleanup (after app is the primary distribution)

5. Simplify the web `/p/[code]` page to render the sequence and show a prominent "Install the app for offline access" banner.
6. Decide whether to keep the PWA plugin at all for the web build. Useful for desktop "add to homescreen," not critical.
7. Decide whether to generate and deploy the static shortcode snapshot. It's now a Firebase-outage backup, not an offline enabler.

### Tier 4 — Cleanup

8. Remove or archive `android-twa/`. Two Android projects invite confusion.

## What Not to Do

- Don't change the PWA service worker scope. It was the right call in the PWA audit but Capacitor makes the scope change a distraction.
- Don't run the static snapshot script or update precache globs until deciding whether the snapshot is still wanted.
- Don't touch `android-twa/` until the Capacitor Android build is confirmed for Play Store submission.

## Verification Plan

No claim of "festival QR works offline" until all of these pass on a test device in airplane mode, with the app freshly installed:

1. QR scan of a `https://tkaflowarts.com/p/s~...` URL opens the TKA Composer app, not the browser.
2. The app routes to the correct sequence and renders it without network.
3. QR scan of a Firebase-backed code previously resolved online renders from Firestore cache.
4. QR scan of a never-seen Firebase-backed code shows the "needs internet" screen, not a crash.
5. Cold start (app fully killed, offline) → scan QR → app opens and renders.

## Open Questions

- Is the Play Store submission going through the `android/` (Capacitor) project or `android-twa/` (legacy TWA)?
- Are any current festival QR codes out in the wild already printed with Firebase-backed formats? If yes, they need to keep working — the Firestore cache path handles this for re-scans.
- Does the app need to handle launches from universal links on top of an already-running instance (`singleTask` launchMode is already set, good)?
