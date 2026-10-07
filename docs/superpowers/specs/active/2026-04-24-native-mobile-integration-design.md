---
status: active
value: 5
effort: XL
remaining: "Verify TKA Composer — Native Mobile Integration Design Spec against the current TKA Composer — Native Mobile Integration Design Spec runtime and acceptance criteria before resuming implementation. Prior recorded remainder: 'Android + deep links + Capgo OTA + native Google sign-in shipped; no ios/ dir at all, no store listings, no SQLite/share/BLE/NFC'"
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# TKA Composer — Native Mobile Integration Design Spec

> **DRIFT WARNING — 2026-08-02.** Android + deep links + Capgo OTA + native Google sign-in shipped; **no `ios/` dir at all**, no store listings, no SQLite/share/BLE/NFC
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


**Date:** 2026-04-24
**Status:** Approved
**Supersedes:** `2026-04-13-capacitor-integration-design.md` (v1 wrapper — implemented, foundation in place)
**Goal:** Ship TKA Composer as a native iOS and Android app with offline-first storage, OTA live updates, per-card tracking, native share, and premium 3D recording — timed to land in stores before the first Choreo Card print run.

---

## Decisions

| Decision | Answer |
|----------|--------|
| App ID | `com.tkaflowarts.composer` |
| App Store name | TKA Composer |
| Capacitor version | 8.3.0 (already installed) |
| Repo structure | Monorepo — `ios/` and `android/` at project root |
| Platform priority | Both iOS and Android, Android first (builds on Windows) |
| iOS build strategy | GitHub Actions macOS runners |
| OTA updates | Capgo (free tier: 1K devices, 5 GB/month) |
| Offline storage | SQLite + Capacitor Filesystem (Tier 3 — every sequence touched cached forever) |
| Auth strategy | No biometric gate. Guest mode → optional sign-in via native Google → session auto-restores |
| App Clips / Instant Apps | Dropped. Web viewer at `/q/[code]` IS the instant experience |
| 3D in WebView | Full Three.js/Threlte — test on physical devices before store submission |
| Card tracking | Per-card unique short codes. One code = one physical card |
| Monetization | Stripe web checkout (not IAP). Scribe tier = $5/month |
| Release timing | App in stores BEFORE first card print run |

---

## Architecture Overview

### Dual-Deploy from Single Codebase

```
src/ (SvelteKit + Svelte 5)
  │
  ├─ npm run build ──────────────────→ build/ ──→ Cloudflare Pages (web)
  │                                       │
  └─ npm run build:native ──→ build/ ──→ cap sync ──→ android/ ──→ Play Store
     (DISABLE_PWA=true)                              └─→ ios/    ──→ App Store
                                                          │
                                          Capgo OTA ◄─────┘ (web-layer updates
                                                              skip store review)
```

### Platform Branching Model

- `PlatformDetector` (already built) gates native-only code paths
- Dynamic imports (`await import("@capacitor/haptics")`) — zero native code in web bundle
- `AccessTier` (guest/Composer/Scribe) works identically on web and native
- Existing guest flow unchanged — card-first journey hits no auth wall

### What Native Adds Over Web

| Capability | Web | Native |
|---|---|---|
| View sequences | Yes | Yes |
| 3D viewer | Yes | Yes |
| Offline viewing | Service worker (fragile) | SQLite + Filesystem (bulletproof) |
| Haptics | Vibration API (limited) | Taptic Engine / Android vibration |
| Auth | Password / Google popup | Native Google sign-in (OS account picker) |
| Share | Web Share API (limited) | Native share sheet |
| Push notifications | Firebase web push | APNs (iOS) + FCM (Android) |
| QR scan → app | Opens web viewer | App Link opens in-app directly |
| Record 3D scene | Premium (web) | Premium (native) |
| OTA updates | Instant (it's a website) | Capgo — minutes, no store review |

**Key invariant:** The web app is never degraded. Every feature works on web. Native adds polish and offline durability, not exclusive functionality.

### Card-First Acquisition Flow

```
Scan QR → tka.run/A1F8 → 302 → tkaflowarts.com/q/A1F8
                                        │
                         ┌──────────────┴──────────────┐
                         │                             │
                    App installed?                 No app?
                         │                             │
                    App Link opens               Web viewer
                    sequence in-app              (full experience)
                         │                             │
                    Native features              Smart banner:
                    (offline, haptics,           "Open in TKA Composer"
                    biometrics)                        │
                                                 App Store link
```

Smart App Banners (iOS meta tag + Android manifest `related_applications`) give the install prompt. Zero build complexity.

---

## Phase 1 — Store-Ready

Ship a published app in both stores with OTA escape hatch. Cards can be printed safely after this phase.

### 1.1 Fix Stale Configs

AndroidManifest.xml deep links — update from `/p/` to `/q/`:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" />
    <data android:host="tkaflowarts.com" />
    <data android:pathPrefix="/q/" />
    <data android:pathPrefix="/sequence/" />
    <data android:pathPrefix="/store/" />
</intent-filter>
```

PWA manifest: update `related_applications` from `com.tkacomposer.app` to `com.tkaflowarts.composer`.

### 1.2 App Links + Universal Links

**Android:** `static/.well-known/assetlinks.json` — package name + Play App Signing SHA-256 fingerprint. Android fetches automatically when `autoVerify="true"`.

**iOS:** `static/.well-known/apple-app-site-association` — team ID + bundle ID. Apple fetches on app install.

Both served as static files from Cloudflare Pages.

### 1.3 Smart App Banner

iOS — one meta tag in `app.html`:
```html
<meta name="apple-itunes-app" content="app-id=YOUR_APP_ID">
```

Android — `related_applications` in PWA manifest (already exists, needs appId fix).

### 1.4 CI/CD Pipeline

```
Push to main
  ├─ Cloudflare Pages (automatic, existing)
  └─ GitHub Actions (manual trigger OR version tag)
       ├─ Android job (ubuntu-latest)
       │    pnpm install → build:native → cap sync android
       │    → gradle assembleRelease → sign AAB → upload to Play Console
       │
       └─ iOS job (macos-latest)
            pnpm install → build:native → cap add ios → cap sync ios
            → xcodebuild archive → upload to TestFlight
```

### 1.5 Capgo OTA Integration

```typescript
// capacitor.config.ts — add Capgo plugin
plugins: {
    CapacitorUpdater: {
        autoUpdate: true,
        statsUrl: "",
    }
}
```

Update flow:
1. User opens app
2. Capgo SDK checks for new bundle in background
3. Downloads silently if available
4. Next app open loads new bundle
5. Crash → auto-rollback to previous version

Deploy: `npx @capgo/cli upload` — minutes to all users, no store review.

### 1.6 3D WebView Testing

Minimum target: WebGL 2.0 with Three.js automatic WebGL1 fallback.

Test: 16-beat sequence with trails effect at 60fps on:
- Physical Android (Pixel-class or better)
- Physical iPhone (SE 3 or better)
- Low-end Android emulator (Pixel 4a profile) — 30fps+ acceptable

### 1.7 Store Listings

**Google Play:** $25 one-time. AAB signed with Play App Signing. Category: Education → Arts & Design.

**Apple App Store:** $99/year. TestFlight beta first (100 internal testers, no review). Category: Education → Reference.

Privacy policy: `tkaflowarts.com/privacy` (exists).

---

## Phase 2 — Native Differentiation

All delivered via Capgo OTA except native Google sign-in and share sheet (new plugins → one store update).

### 2.1 Tier 3 Offline Storage

SQLite for structured data + Capacitor Filesystem for encoded blobs.

```
┌─────────────────────────────────────────┐
│           Local Storage Layer           │
│                                         │
│  SQLite (structured)     Filesystem     │
│  ├─ sequences table      ├─ /encoded/   │
│  │   id, word, hash,     │   {hash}.bin │
│  │   lastViewed,         │              │
│  │   source (scan/save/  └─ /thumbs/    │
│  │          browse),         {hash}.png │
│  │   cardCode?,                         │
│  │   contentHash                        │
│  ├─ scan_history table                  │
│  │   code, scannedAt,                   │
│  │   city, country                      │
│  └─ sync_queue table                    │
│      action, payload,                   │
│      createdAt, synced                  │
└─────────────────────────────────────────┘
```

**Cache lifecycle:**
- Every sequence touched (scan, browse, create, share link) → cached locally
- User's own saved sequences: never evicted
- Scanned cards: pinned (never evicted)
- Other sequences: LRU eviction at 500MB configurable limit

**Sync strategy:**
- Online: Firestore is source of truth, local cache is read-through
- Offline: all reads from SQLite/Filesystem
- Mutations queued in `sync_queue`, flushed on connectivity
- Conflict resolution: last-write-wins with server timestamp

**Plugin:** `@capacitor-community/sqlite`

### 2.2 Native Share Sheet

```typescript
import { Share } from '@capacitor/share';

async function shareSequence(word: string, encoded: string): Promise<void> {
    await Share.share({
        title: `TKA: ${word}`,
        text: 'Check out this flow arts sequence',
        url: `https://tkaflowarts.com/sequence/${encoded}`,
        dialogTitle: 'Share sequence',
    });
}
```

Share URLs use `/sequence/` route — NOT `/q/`. Shared links don't pollute scan analytics.

Web fallback: Web Share API or copy-to-clipboard.

### 2.3 Native Google Sign-In

OS-level account picker replaces browser-tab popup. No browser hop, smooth native feel.

**Plugin:** `@nickkostov/capacitor-google-auth`

Requires OAuth client IDs for iOS + Android in Google Cloud Console (Firebase project already exists).

### 2.4 Per-Card Short Code Schema

Every physical card gets a unique short code. Same sequence printed on 50 cards = 50 unique codes.

Firestore `shortcodes/{code}` document:

```typescript
interface ShortCodeDoc {
    // Existing fields
    encoded: string;
    sequenceData?: object;
    
    // Per-card identity
    contentHash: string;          // SHA-256 of encoded blob
    printRun?: string;            // e.g. "2026-Q3-001"
    printIndex?: number;          // card #23 of this run
    printedAt?: Timestamp;
    
    // Per-card scan tracking
    scans: Array<{
        at: Timestamp;
        city: string | null;
        country: string | null;
        platform: 'web' | 'ios' | 'android';
    }>;
    scanCount: number;            // denormalized
    firstScannedAt?: Timestamp;
    lastScannedAt?: Timestamp;
}
```

**Cross-card queries:**
- "All cards with this sequence" → `where contentHash == X`
- "All cards from Q3 2026 run" → `where printRun == "2026-Q3-001"`
- "Oldest still-active card" → `orderBy printedAt, where scanCount > 0, limit 1`

No breaking changes — new fields are additive.

---

## Phase 3 — Premium Native

New native plugins → store updates required.

### 3.1 Stripe Subscription

Wire Stripe to the existing 3-tier access system.

| Tier | Price | Key Unlocks |
|---|---|---|
| Guest | Free, no account | Create (3 tabs), Browse (gallery), 8-beat cap |
| Composer | Free, account required | All modules, 16-beat cap, save/export, community |
| Scribe | $5/month | 64-beat cap, 3D scene recording, priority generation |

**Implementation:** Stripe Checkout in system browser (Capacitor `Browser` plugin). Not IAP — TKA is a content creation tool, Stripe web checkout is compliant with Apple/Google policies.

Subscription status synced to Firebase user doc → `resolveAccessTier()` reads `isPremium`.

**Open design question:** Tier naming may invert — "Scribe" (records notation) as base, "Composer" (creates/arranges) as premium. To be brainstormed separately.

### 3.2 3D Scene Recording — Premium Gate

- Recording uses `MediaRecorder` API on canvas stream — works in modern WebViews
- Gate: `if (accessTier !== 'premium')` → upgrade nudge
- Output: MP4 saved via `@capacitor/filesystem` to device gallery
- Chain with native share sheet for Instagram/TikTok export

### 3.3 Bluetooth LE — LED Prop Sync

**Plugin:** `@capacitor-community/bluetooth-le`

Connects to LED props (Flowtoys, Ignis) and pushes TKA sequence timing data as LED patterns.

Cross-reference: `project_led_pattern_engine.md` — spec exists, needs implementation plan.

Genuine hardware integration — BLE doesn't work reliably in web browsers. This is the bridge between notation and physical props.

### 3.4 NFC Card Reading

**Plugin:** `@nickkostov/capacitor-nfc`

Future cards embed NFC chips alongside QR codes. Tap phone to card → opens sequence. Same URL scheme as QR (`https://tkaflowarts.com/q/{code}`). Everything downstream is identical.

NFC chips: ~$0.10-0.30/unit at volume. Premium feature — economics need to make sense before committing.

---

## Testing & Safety Strategy

### Pre-Print Test Protocol

Before ANY cards get printed:

**QR → App flow (sacred path):**
1. Generate short code for test sequence
2. Generate QR encoding `HTTPS://TKA.RUN/{CODE}`
3. Print QR on paper (physical scan, not emulator)
4. Scan with iPhone (Safari) → web viewer loads → sequence animates
5. Scan with Android (Chrome) → web viewer loads → sequence animates
6. Scan with iPhone (app installed) → App Link opens in-app
7. Scan with Android (app installed) → App Link opens in-app
8. Scan with no network → offline cache serves sequence (Phase 2)
9. Scan same code 5x rapidly → scan count = 1 (dedup works)

**Inline fallback (immortal path):**
10. Generate inline code (`s~` prefix)
11. Full URL works in browser with no Firestore access
12. `decodeFromQR()` roundtrip: encode → decode → encode → identical

**Domain durability:**
13. `tka.run/{code}` → 302 → `tkaflowarts.com/q/{code}`
14. `tka.to/{code}` → 302 → `tkaflowarts.com/q/{code}`
15. Both domains auto-renew confirmed in registrar dashboard

### Device Test Matrix

| Device | Test | Pass criteria |
|---|---|---|
| Physical Android (your phone) | Full app, QR scan, 3D viewer, offline | 60fps on 16-beat sequence |
| Android emulator (Pixel 7) | App Links, deep linking | QR scan opens in-app |
| Physical iPhone (TestFlight) | Full app, QR scan, Universal Links | Sequence loads, 3D renders |
| iOS Simulator | Layout, safe areas, keyboard | No visual overflow |
| Low-end Android (Pixel 4a profile) | 3D viewer performance | 30fps+ acceptable |

### First Print Run Mitigation

- **Small batch first.** 50 cards, not 500. Distribute to friends. Wait 2 weeks for scan data.
- **Every card has inline fallback.** Encoded blob in shortcode doc = self-contained. Secondary QR with `s~` prefix on card back = fully offline-decodable.
- **OTA escape hatch.** Bug in viewer → Capgo push → fixed in minutes. Web users get it instantly via Cloudflare.
- **Print run metadata.** Tag first batch as `printRun: "2026-TEST-001"`. Query by run if issues arise.
- **Monitor scan analytics.** Watch Scan Activity tab for anomalies post-distribution.

### Rollback Plan

| Severity | Response | Time to fix |
|---|---|---|
| Web-layer bug (UI, routing, viewer) | Capgo OTA push | Minutes |
| Native plugin crash | Hotfix store update | 1-3 days |
| QR resolution broken | Fix Worker on Cloudflare | Minutes |
| Domain down | Registrar intervention | Hours |
| Firestore down | Inline codes + R2 CDN fallback | Automatic |

---

## Existing Foundation (from v1 spec, 2026-04-13)

Already implemented and working:

- Capacitor 8.3.0 installed with 9 plugins
- Android project generated at `android/`
- `PlatformDetector` service in DI container
- `NativeInitializer` service (status bar, keyboard, splash screen, app lifecycle, deep links)
- `HapticFeedback` service with native branch
- `build:native` script with `DISABLE_PWA=true`
- Live reload: `npx cap run android --livereload --external`
- `appUrlOpen` listener routes deep links via SvelteKit `goto()`

---

## Capacitor Plugin Inventory

### Already Installed (v1)
| Plugin | Version | Status |
|---|---|---|
| `@capacitor/core` | 8.3.0 | Working |
| `@capacitor/android` | 8.3.0 | Working |
| `@capacitor/ios` | 8.3.0 | Working |
| `@capacitor/app` | 8.1.0 | Working |
| `@capacitor/haptics` | 8.0.2 | Working |
| `@capacitor/keyboard` | 8.0.3 | Working |
| `@capacitor/splash-screen` | 8.0.1 | Working |
| `@capacitor/status-bar` | 8.0.2 | Working |
| `@capacitor/push-notifications` | 8.0.3 | Installed, not wired |

### Phase 1 (new)
| Plugin | Purpose |
|---|---|
| `@capgo/capacitor-updater` | OTA live updates |

### Phase 2 (new — triggers one store update)
| Plugin | Purpose |
|---|---|
| `@capacitor/share` | Native share sheet |
| `@capacitor-community/sqlite` | Offline storage |
| `@capacitor/filesystem` | Blob/thumbnail storage |
| `@nickkostov/capacitor-google-auth` | Native Google sign-in |

### Phase 3 (new — triggers store update)
| Plugin | Purpose |
|---|---|
| `@capacitor-community/bluetooth-le` | LED prop sync |
| `@nickkostov/capacitor-nfc` | NFC card reading |
| `@nickkostov/capacitor-screen-recorder` or MediaRecorder API | 3D scene recording |

---

## Open Design Questions

1. **Tier naming:** Current guest → Composer → Scribe may invert to guest → Scribe → Composer. Needs separate brainstorm.
2. **Stripe vs IAP:** Stripe web checkout avoids 30% Apple/Google cut. Verify this remains compliant as app evolves.
3. **Secondary QR on card back:** Should every Choreo Card include an inline-encoded (`s~`) QR as a fallback alongside the short code QR? Adds redundancy but makes QR layout busier.
4. **R2 CDN snapshot frequency:** Daily snapshot of shortcode collection to R2. Confirm Cloudflare R2 free tier covers this.
5. **LED Pattern Engine:** Spec exists at `project_led_pattern_engine.md`. Needs its own implementation plan session before Phase 3 BLE work begins.

---

## Success Criteria

### Phase 1
- [ ] App published in Google Play Store
- [ ] App published in Apple App Store (via TestFlight first)
- [ ] QR scan on physical paper → sequence loads in both web and native
- [ ] App Links verified (Android) + Universal Links verified (iOS)
- [ ] Capgo OTA: push a trivial change, confirm it arrives on device
- [ ] 3D viewer renders at 60fps on mid-range Android + iPhone
- [ ] Smart App Banner appears on `/q/[code]` for non-installed users

### Phase 2
- [ ] Airplane mode: previously-viewed sequence loads from local cache
- [ ] Scanned card sequence pinned in local storage permanently
- [ ] Native share sheet opens with `/sequence/` URL (not `/q/`)
- [ ] Google sign-in uses OS account picker, no browser hop
- [ ] Per-card scan tracking: two prints of same sequence show independent scan histories

### Phase 3
- [ ] Scribe subscription: Stripe Checkout → `isPremium` → 64-beat cap unlocked
- [ ] 3D recording: premium user records, saves to gallery, shares via sheet
- [ ] BLE: connect to test LED prop, push timing data from TKA sequence
- [ ] NFC: tap phone to NFC-enabled test card, sequence opens in app
