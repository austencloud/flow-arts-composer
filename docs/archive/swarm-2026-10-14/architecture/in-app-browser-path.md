# In-App Browser Path

Status: SUPERSEDED (2026-07-22) by
`docs/superpowers/specs/shipped/2026-07-22-kill-the-bar-app-forward-design.md` and its
implemented plan. That spec is app-forward and corrects this doc's §3 claim that
iOS escape is "manual only": fresh 2026 evidence shows `x-safari-https://` opens
Safari on iOS 17+, so the shipped path fires it optimistically (iOS 17+) with a
guided fallback, measured by the existing escape telemetry. This doc is kept for
its investigation record; do not implement from it.

Date: 2026-07-21
Origin: production incident 2026-07-20 22:38 CDT, Instagram DM to `/create/construct`

## Verdict

**Yes, it is safe to remove the full-screen blocker on arrival: nothing in this app hard-fails on page load inside an in-app webview, and the one thing that genuinely fails (Google/Facebook OAuth popups, rejected server-side by Google with `403 disallowed_useragent`) is reachable only by tapping a provider button, so the gate belongs on that click.**

### Evidence

The blocker's own stated justification is stale. `in-app-browser-detector.ts:4` reads:

> These webviews partition sessionStorage, breaking Firebase's `signInWithRedirect`.

A repo-wide grep for `signInWithRedirect` returns exactly one hit: that comment. The app signs in with `signInWithPopup` (`authenticator.ts:97` Google, `:121` Facebook) and `signInAnonymously` (`guest-identity.ts:21`). Nothing calls the API the comment describes.

What actually works inside a webview, with no popup, no redirect, and no `sessionStorage` dependency:

| Capability                    | Where                                                   | Works in webview             |
| ----------------------------- | ------------------------------------------------------- | ---------------------------- |
| Guest identity                | `guest-identity.ts:21` `signInAnonymously`              | Yes                          |
| Construct, Assemble, Generate | `guest-access-config.ts:16-19`                          | Yes                          |
| Browse gallery + library      | `guest-access-config.ts:16-19`                          | Yes                          |
| Local save, up to 3           | `guest-access-config.ts:10`                             | Yes                          |
| Magic-link send               | `EmailLinkAuth.svelte:34-51`, callable + `localStorage` | Yes                          |
| Magic-link completion         | `email-link-completion.ts:71-98`                        | Yes, including cross-browser |
| Google / Facebook popup       | `authenticator.ts:97,121`                               | **No**                       |

The Detroit visitor proved the top half of that table in production. Once he reached Safari he generated 4 sequences and changed 9 settings, all of it guest-tier work that would have succeeded in the webview if a full-screen `alertdialog` had not been sitting on top of it telling him sign-in was impossible.

Two secondary findings confirm the blocker is over-broad rather than merely mistargeted:

1. `InAppBrowserPrompt.svelte:24` already exempts `/sequence/*` into a non-blocking banner "because that route doesn't need sign-in." `/create/construct` does not need sign-in either, by the same `guest-access-config.ts` that governs both.
2. The detector produces at least one confirmed false positive: real Opera for iOS (`OPT/` user-agent token, no trailing `Safari/`) trips the fallback heuristic at `in-app-browser-detector.ts:102` and gets the full-screen block in a fully capable browser.

### What survives

The worry behind the blocker is legitimate, only mis-scoped. Google enforces `disallowed_useragent` server-side for embedded webviews, and `SocialAuthCompact.svelte:40-43` already records that Facebook's popup "dead-ends in the native WebView." Those two buttons need a real answer at the moment they are tapped. Everything else ships unblocked.

---

## 1. Trigger model

Page load stops producing a blocking dialog. Three tiers replace it.

### Tier 0: arrival

Nothing blocks. The route renders. Guest identity provisions as it already does at `construct-tab-state.svelte.ts:192`.

A non-blocking bottom banner appears on every route, not just `/sequence/*`. It is the same banner element that route already uses, with new copy, and it is dismissible. Dismissal persists for the session in component state only.

Banner copy, in three parts:

- Title line: `Instagram's built-in browser` (substitute `browserName`; when null, `This app's built-in browser`)
- Body line: `Building and saving work here. Google and Facebook sign-in do not.`
- Action button: `Open in Chrome` on Android, `Open in Safari` on iOS
- Dismiss: existing `x` control, `aria-label="Dismiss"`

The body line is the whole point of the redesign. It tells the visitor what is true in both directions, so nobody leaves a working page believing it is broken and nobody taps Google expecting it to work.

Layout: the banner is `position: fixed; bottom: 0`, so it never reflows content. `iab-banner-state.svelte.ts` already carries visibility and `IAB_BANNER_HEIGHT = 56` for padding coordination; extend that coordination from the `/sequence/` route to the app shell now that the banner shows everywhere.

### Tier 1: sign-in intent

When the auth modal opens inside a detected webview, it reorders itself. Magic link becomes the primary, expanded path. Google and Facebook are still visible but carry a warning and no longer attempt a popup. Full spec in section 2.

### Tier 2: escape

Tapping the banner's action button opens the escape sheet (Android fires the intent directly, iOS opens instructions). Full spec in section 3.

### Deleted

The `role="alertdialog"` full-screen branch at `InAppBrowserPrompt.svelte:141-213`, its `.in-app-browser-prompt` and `.prompt-content` styles, and the `Continue anyway (sign-in may not work)` dismiss. Its instruction block and copy-link machinery move into the escape sheet, unchanged in behavior.

The line `{browserName}'s built-in browser doesn't support sign-in` is deleted outright. It is false: magic link supports sign-in in that browser today.

---

## 2. Sign-in inside the webview

### Magic link completes cross-browser. Confirmed.

`localStorage` is per-browser, so a link requested in Instagram's webview and opened in Safari finds nothing saved. New links no longer ask for the address again. `sendMagicLink` stores the original email behind a server-generated 256-bit opaque state, puts only that state in the continue URL, and rejects resolution after 30 minutes. `EmailLinkConfirmModal` resolves the state without consuming Firebase's single-use `oobCode`, shows the account that will be opened, and consumes the code only after the user clicks `Finish signing in`.

The email never appears in the URL. This deliberately gives the link bearer-credential semantics across devices, replacing Firebase's typed-email session-fixation check. Showing the resolved account before the confirm click and limiting state resolution to 30 minutes reduce accidental misuse; they do not make a deliberately forwarded link harmless.

Magic link is therefore both the sign-in method and the escape hatch in one action: request it in the webview, open the email, land in Safari, finish there.

Completion records first-run setup as skipped. The user enters Create without
being asked for a password or profile name. Display-name editing remains
available in profile settings, and the account can keep using magic links.

### Ordering and labelling in a detected webview

`AuthModal.svelte` currently renders One Tap, then `SocialAuthCompact`, then a collapsed `Continue with email` toggle. When `getInAppBrowserDetector().isInAppBrowser()` is true, render this order instead:

1. **Google One Tap: not rendered.** It is FedCM-based and will not complete here. Skip the component entirely.
2. **`EmailAuthTabs`, expanded, no toggle.** Force `activeTab = "magic"` by passing a new `initialTab` prop, overriding the `lastMethod === "password"` default. Password sign-in stays reachable on its tab for anyone who has one.
3. Section heading above it: `Sign in by email`
4. Hint under the heading, replacing `EmailLinkAuth`'s `No password needed - we'll email you a sign-in link.` when in a webview: `We email you a link. Open it in Safari and you are signed in there.`
5. **Divider:** `Other options`
6. **`SocialAuthCompact`, buttons visible and enabled**, preceded by: `Google and Facebook block sign-in inside this browser.`

Leave the buttons tappable. People will try them regardless, and an enabled button that explains itself beats a disabled button that does not.

### Intercepting the provider click

In `SocialAuthCompact.svelte`, at the top of `handleGoogleClick` and `handleFacebookClick`, before any Firebase call:

```
if (getInAppBrowserDetector().isInAppBrowser()) {
  googleError = "Google blocks sign-in inside this browser. Use the email link above, or open this page in Safari.";
  captureEvent("inapp_auth_social_intercepted", { provider: "google" });
  return;
}
```

Do not attempt the popup first. Google answers with its own `403 disallowed_useragent` page rendered inside the webview, which is a worse dead end than a sentence in our own UI.

Facebook gets the identical treatment with `provider: "facebook"` and `facebookError`. Facebook's webview policy was not independently verified and may be stricter than Google's; defensive framing costs nothing and assuming parity risks a silent dead end.

### Known gap: guest drafts do not cross the browser boundary

If a visitor builds sequences as a guest in the webview and completes the magic link in Safari, `auth.currentUser?.isAnonymous` is false in that Safari context, so `email-link-completion.ts:113` takes the plain `signInWithEmailLink` branch. A new account is created and the webview's anonymous uid is stranded.

Do not build a uid-carry mechanism yet. Measure first. `EmailLinkAuth` fires `inapp_auth_magic_link_requested` with `guest_drafts_pending: boolean` (true when an anonymous user exists with at least one local save). If that property is rarely true, the gap is theoretical. If it is often true, the fix is to encode the anon uid in `continueUrl` and import from it at completion, mirroring what `upgradeMagicLinkCollision` already does for the same-browser case. That fix touches `email-link-completion.ts`, which is outside all three workstreams here, so it is a separate follow-up either way.

Do not add copy promising the work transfers. It does not.

---

## 3. iOS escape hatch

**Chosen: honest instructions plus the working copy button. No programmatic scheme attempt.**

Every candidate technique is dead or fragile for the exact webviews in this incident:

| Technique                    | Status                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `x-safari-https://`          | Reported broken specifically inside Instagram's in-app browser ([inapp-debugger#16](https://github.com/shalanah/inapp-debugger/issues/16)); inconsistent across iOS point releases |
| `googlechrome://`            | Only works if Chrome for iOS is installed, which a web page cannot feature-detect. Escapes to Chrome, not Safari                                                                   |
| `shortcuts://x-callback-url` | Unintended use of the Shortcuts app, already reported broken on iOS 18.1 beta by its own author, flashes the Shortcuts UI mid-flow                                                 |
| Universal Links              | Fire on OS-level link handling, not on a same-webview navigation Instagram's `WKWebView` already owns                                                                              |
| Smart App Banners            | Safari-only, never render in a third-party webview                                                                                                                                 |
| App Clips                    | Require a native target and Safari; not applicable                                                                                                                                 |

Firing one anyway produces a native "Cannot open this page because it is invalid" dialog. That reads as an app error and is worse than the current honest dead end.

The one reliable mechanism is Instagram's own menu, and it is manual. So iOS keeps:

- Step 1: `Tap the menu icon` with the `fa-ellipsis-h` glyph
- Step 2: `Select "Open in Safari" or "Open in Browser"`
- Then the copy button: `Copy Link` → `Copied` → `Copy it manually`, with the selectable field revealed on total failure

The copy button now reports its real outcome (`handleCopyUrl` at `InAppBrowserPrompt.svelte:60-68`). That fix already landed and is what turns this from a lie into a fallback. Keep all three states.

### Android

`intent://` is legitimate here and stays, with two fixes in `getOpenInBrowserUrl()`:

1. **Add `S.browser_fallback_url`.** Chrome's documented parameter for the case where the target package does not resolve. Without it, a Chrome-less or Chrome-disabled device gets a button that does nothing. Value is the URL-encoded current `https` URL.
2. **Drop `package=com.android.chrome`.** The generic `intent://host/path#Intent;scheme=https;end` form resolves against any installed browser and is the better-supported refinement.

Resulting shape:

```
intent://{host}{pathname}{search}{hash}#Intent;scheme=https;S.browser_fallback_url={encodeURIComponent(currentUrl)};end
```

`canOpenInExternalBrowser()` stays Android-only.

### Failure detection

Applies to Android only, since iOS never fires a scheme. On tapping the intent button:

1. Fire `inapp_browser_escape_attempted` with `method: "android_intent"`.
2. Start a 1500ms timer and listen for `visibilitychange` and `pagehide`.
3. If the page hides or unloads first, the escape worked: `inapp_browser_escape_result` with `outcome: "left"`.
4. If the timer fires while the page is still visible, the escape failed: `inapp_browser_escape_result` with `outcome: "stayed"`, and reveal the copy button plus the manual field in the same sheet.

Remove both listeners in either branch and on component destroy.

An unverified report suggests Instagram's Android app stopped honoring `intent://` links tapped from its feed around October 2024. That is a different code path from JS firing `intent://` inside an already-open webview, and it could not be confirmed from a fetchable source. The failure detection above makes the question moot: if it turns out blocked, the visitor sees the copy fallback within 1.5 seconds and the telemetry says so.

---

## 4. Detector corrections

File: `src/lib/shared/auth/services/in-app-browser-detector.ts`

### Fix 1: Opera for iOS false positive

`in-app-browser-detector.ts:102` flags any iOS user-agent lacking the substring `Safari`. Opera for iOS ships `OPT/3.3.3 Mobile/15E148` with no trailing `Safari/` compatibility token, so a real Opera user gets flagged. Opera and Opera GX are both actively maintained iOS apps as of July 2026.

Add a known-good allow-list checked before the fallback heuristic:

```ts
// Opera for iOS is the one mainstream browser that omits the vestigial
// "Safari/" compatibility token, so the heuristic below would flag a fully
// capable browser. Chrome, Firefox, Edge, Brave, and DuckDuckGo all keep it.
const IOS_REAL_BROWSERS = /\bOPT\/|\bOPX\//i;
```

Guard becomes `if (this.isIOS() && !IOS_REAL_BROWSERS.test(combined) && !combined.includes("Safari"))`.

Chrome (`CriOS`), Firefox (`FxiOS`), Firefox Focus, Edge (`EdgiOS`), Brave, and current DuckDuckGo were each checked against real user-agent strings and all retain `Safari/`. None need entries.

### Fix 2: Android intent URL

Per section 3. Two changes to `getOpenInBrowserUrl()`, at `in-app-browser-detector.ts:54-58`.

### Preserve: the Capacitor carve-out

`in-app-browser-detector.ts:84-87` returns early for `Capacitor.isNativePlatform()`, before the pattern loop. It is load-bearing: the native shell's user-agent contains `wv`, which `/\bwv\b/i` at line 35 would match, and sign-in there runs through the native Firebase plugin. **Do not touch it, do not reorder it, and do not fold it into the Opera fix.** The two are unrelated.

### Accepted, not fixed

iPadOS 13+ defaults to a desktop user-agent with no `iPad` token, so `isIOS()` at `:116-119` under-detects it. That is a false negative: the visitor sees no banner and nothing blocks them. Safe. Leave it.

The heuristic's dependence on third-party vendors continuing to append a functionally meaningless `Safari/` token is inherent. DuckDuckGo already shipped a version without it. The allow-list is the maintenance point when the next one drops it.

### Singleton convention

`src/lib/shared/auth/` uses colocated singleton getters: `get-account-manager.ts`, `get-username-validator.ts`, `get-user-document-manager.ts`, `get-user-feature-flag-persister.ts`, `get-global-feature-flag-persister.ts`. `InAppBrowserPrompt.svelte:7` deviates with a bare `new InAppBrowserDetector()`.

Add `src/lib/shared/auth/get-in-app-browser-detector.ts` mirroring `get-account-manager.ts`. This is now load-bearing rather than cosmetic, because WS-AUTH needs the same detection result and two independent `new` calls would each re-run and re-cache detection.

```ts
let instance: InAppBrowserDetector | null = null;

export function getInAppBrowserDetector(): InAppBrowserDetector {
  return (instance ??= new InAppBrowserDetector());
}
```

No `browser` guard throw here: unlike `getAccountManager`, `detect()` already handles `typeof navigator === "undefined"` at `:75-78` and callers may reasonably ask during SSR.

---

## 5. Noise filter

File: `src/lib/shared/analytics/services/posthog.ts`

### The contract, verified against installed source

Installed version is `posthog-js@1.341.0` (`node_modules/posthog-js/package.json`).

```ts
// @posthog/types/dist/capture.d.ts:64
export type BeforeSendFn = (cr: CaptureResult | null) => CaptureResult | null;

// @posthog/types/dist/posthog-config.d.ts:1061
before_send?: BeforeSendFn | BeforeSendFn[];
```

The dispatcher drops on `isNullish`, which covers `null` **and** `undefined`:

```ts
// posthog-core.ts, tag posthog-js@1.341.0
for (const fn of fns) {
  beforeSendResult = fn(beforeSendResult);
  if (isNullish(beforeSendResult)) { ...; return null }
}
```

### An error here silently drops all analytics

There is no exception, no warning, and no error state. A branch that falls off the end of the function returns `undefined`, `isNullish` treats that identically to an explicit `null`, and every event on that branch vanishes. The failure surfaces only when someone notices PostHog volume flatlined days later.

**Every non-drop branch must `return event` explicitly. Never rely on an implicit return.**

### Implementation

Add to the existing `posthog.init(...)` call at `posthog.ts:141-208`. Import types alongside the existing `CaptureOptions` import at `:16`:

```ts
import type { CaptureOptions, BeforeSendFn, CaptureResult } from "posthog-js";
```

```ts
// Three console.error strings that are confirmed SDK chatter, not app bugs.
// They were 80%+ of $exception volume on the Instagram-referral session that
// prompted this file's audit, which buries real errors under noise nobody can
// act on.
const EXCEPTION_NOISE = [
  // Firestore's multi-tab lease election. The three action names are the only
  // callers of the readwrite-primary path in @firebase/firestore@4.14.1, and
  // all three are background maintenance that self-recovers. Deliberately not
  // a wildcard on the action name: an unrecognised action would be new
  // behaviour worth seeing.
  /Failed to obtain primary lease for action '(Backfill Indexes|Collect garbage|Release target)'/,
  // Browser-native scheduling backpressure, permitted by the spec.
  /ResizeObserver loop completed with undelivered notifications/,
  // iOS Safari has no FCM support. Guarded at the call site now; this covers
  // any path that still reaches the SDK's own feature-detection throw.
  /messaging\/unsupported-browser/,
];

const dropKnownNoise: BeforeSendFn = (event: CaptureResult | null) => {
  // Null in means null out. Not our event to judge.
  if (!event) return event;
  if (event.event !== "$exception") return event;

  const list = event.properties?.$exception_list;
  if (!Array.isArray(list)) return event;

  const isNoise = list.some(
    (e) =>
      typeof e?.value === "string" &&
      EXCEPTION_NOISE.some((p) => p.test(e.value))
  );
  return isNoise ? null : event;
};
```

Register as `before_send: dropKnownNoise` inside the init options object.

Register it unconditionally, not behind `captureEnabled`. `capture_exceptions` is already false in dev (`:166`), so the function never sees a `$exception` there.

### Why match on `$exception_list[].value`

All three capture paths (uncaught errors, unhandled rejections, `console.error` autocapture) funnel into one `capture("$exception", ...)` with `$exception_list` and `$exception_level`. There is no top-level `$exception_message` on this path; that property exists only in posthog-js's optional Sentry bridge, which this app does not use. `console.error` args are joined with a single space before coercion, and `StringCoercer` preserves the joined string verbatim in `.value` unless it opens with an `XError: ` prefix. None of the three patterns do.

This fails open, not closed: if a future SDK upgrade reshapes exception capture, the filter stops matching and noise returns. That is the safe direction. Add a unit test asserting `dropKnownNoise` returns `null` for a synthetic event shaped like today's `$exception_list` and returns the event object for anything else, so the regression is visible.

### Firestore persistence in webviews

File: `src/lib/shared/auth/firebase.ts`

`initializeFirestore` races `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` against a 5000ms timeout (`:379-398`). In-app webviews partition IndexedDB unpredictably, and the incident session lasted 43 seconds before the visitor escaped to Safari. Spending 5 of those 43 seconds losing a race is a real cost.

Add one more knowing-memory-cache branch immediately after the existing SSR/no-IndexedDB branch at `:369-375`:

```ts
// In-app webviews partition IndexedDB unpredictably, and these sessions are
// short by nature: the visitor is on their way to a real browser. Skip the
// 5s persistent-cache race rather than spend it, and skip the multi-tab lease
// election that produces console noise nobody can act on.
if (getInAppBrowserDetector().isInAppBrowser()) {
  firestoreInstance = getFirestore(app);
  usingMemoryCache = true;
  debug.info("Firestore memory-only (in-app browser)");
  hmrManager.setFirestore(firestoreInstance);
  return firestoreInstance;
}
```

`isInAppBrowser()` is synchronous, side-effect-free, and memoized, so this adds no latency. Every existing fallback branch already returns a working instance; this one follows the same shape.

No telemetry event from `firebase.ts`. It runs before analytics init, and the branch is verifiable from `debug.info` plus the absence of lease errors.

---

## 6. Telemetry

Convention confirmed by grep: `snake_case`, domain-prefixed, past-tense or noun-phrase. Existing examples: `auth_modal_opened`, `auth_modal_submitted`, `auth_modal_abandoned`, `onboarding_tutorial_offered`, `guest_upgraded_to_account`, `scan_app_opened`, `landing_cta_click`, `shortcode_resolve_failed`.

**All events below go through `captureEvent(name, props)` imported from `src/lib/shared/analytics/services/posthog.ts`, which takes an arbitrary string name** (`posthog.ts:282-289`). Do not register them in `activity-event.ts`. That file is owned by a concurrent workflow and must not be edited here.

| Event                             | Owner   | Fires when                                                  | Properties                                                                    |
| --------------------------------- | ------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `inapp_browser_detected`          | WS-GATE | Prompt component mounts and detection is true               | `browser`, `platform` (`ios`/`android`/`other`), `route`, `can_open_external` |
| `inapp_browser_banner_shown`      | WS-GATE | Banner renders (detected, not dismissed, not installed PWA) | `browser`, `route`                                                            |
| `inapp_browser_escape_attempted`  | WS-GATE | Escape action tapped                                        | `method` (`android_intent`/`ios_instructions`)                                |
| `inapp_browser_escape_result`     | WS-GATE | 1500ms timer or visibility change resolves                  | `method`, `outcome` (`left`/`stayed`)                                         |
| `inapp_browser_link_copied`       | WS-GATE | Copy button resolves                                        | `path` (`clipboard_api`/`selection`/`manual`), `success`                      |
| `inapp_browser_banner_dismissed`  | WS-GATE | Dismiss tapped                                              | `route`                                                                       |
| `inapp_auth_magic_link_promoted`  | WS-AUTH | Auth modal opens in a detected webview                      | `route`                                                                       |
| `inapp_auth_social_intercepted`   | WS-AUTH | Google or Facebook tapped in a detected webview             | `provider`                                                                    |
| `inapp_auth_magic_link_requested` | WS-AUTH | Magic-link send succeeds in a detected webview              | `guest_drafts_pending`                                                        |

Existing `auth_modal_submitted` with `method: "magic_link"` keeps firing unchanged from `recordAuthSubmission`. Diffing its volume against `guest_upgraded_to_account` and `user_signed_up` gives the send-to-complete drop-off that no one has measured yet.

### Analytics note for whoever watches the funnel

`inapp_browser_*` impressions will be far lower than the old blocker's, because the blocker fired on every page load and the banner is a single dismissible bar. That is the intended change, not a regression. The number to watch is whether guest-tier activity from webview referrals goes up.

WS-NOISE ships no new events. Its correctness is proven by the unit test on `dropKnownNoise` and by `$exception` volume dropping without total event volume dropping.

---

## Implementation assignment

Three disjoint workstreams. No file appears twice. Each instruments its own telemetry by importing `captureEvent` directly. Do not create a shared telemetry module.

Every workstream imports `getInAppBrowserDetector` from `src/lib/shared/auth/get-in-app-browser-detector.ts`. Importing is not editing; only WS-GATE creates and modifies that file.

### WS-GATE: the trigger

**Owns:**

- `src/lib/shared/auth/services/in-app-browser-detector.ts`
- `src/lib/shared/auth/get-in-app-browser-detector.ts` (new)
- `src/lib/shared/auth/components/InAppBrowserPrompt.svelte`
- `src/lib/shared/auth/state/iab-banner-state.svelte.ts`
- `src/routes/+layout.svelte`

**Does:**

1. Opera allow-list before the iOS fallback heuristic. Preserve the Capacitor carve-out untouched.
2. `intent://` gets `S.browser_fallback_url`, loses `package=com.android.chrome`.
3. New singleton getter file.
4. Delete the full-screen blocking branch (`InAppBrowserPrompt.svelte:141-213`) and its styles. Keep the copy-link machinery and the iOS instruction block, relocated into the escape sheet.
5. Banner becomes the universal page-load treatment: drop the `isSequenceRoute` condition so it renders on all routes. New copy per section 1.
6. Escape sheet with the Android intent path plus `visibilitychange`/`pagehide` failure detection, and the iOS instruction path.
7. Extend banner padding coordination in `+layout.svelte` now that the banner is not route-scoped.
8. Six `inapp_browser_*` events.

**Preserve:** `?forceIAB=true` at `:14`. It is the test hook for all of this. The banner and escape sheet must both be reachable through it.

**Verify:** load any app route with `?forceIAB=true`, confirm no blocking dialog, confirm the banner, confirm construct still reaches a start-placement pick with the banner up.

### WS-AUTH: sign-in inside the webview

**Owns:**

- `src/lib/shared/auth/components/AuthModal.svelte`
- `src/lib/shared/auth/components/EmailAuthTabs.svelte`
- `src/lib/shared/auth/components/EmailLinkAuth.svelte`
- `src/lib/shared/auth/components/SocialAuthCompact.svelte`

**Does:**

1. `AuthModal`: when in a webview, skip `GoogleOneTap`, render `EmailAuthTabs` expanded above `SocialAuthCompact`, drop the `Continue with email` toggle, add the section headings and the `Other options` divider.
2. `EmailAuthTabs`: new `initialTab` prop so the caller can force `"magic"` regardless of `lastMethod`.
3. `EmailLinkAuth`: webview-specific hint copy; compute `guest_drafts_pending`; fire `inapp_auth_magic_link_requested`.
4. `SocialAuthCompact`: intercept both provider handlers before any Firebase call, set the inline error, fire `inapp_auth_social_intercepted`, return.
5. `inapp_auth_magic_link_promoted` on modal open in a webview.

**Does not:** touch `email-link-completion.ts`, `authenticator.ts`, or `anonymous-upgrade.ts`. The cross-browser drafts gap is measured here, not fixed here.

**Verify:** open the auth modal with `?forceIAB=true`, confirm magic link is first and expanded, confirm tapping Google produces the inline sentence and no popup attempt.

### WS-NOISE: signal quality

**Owns:**

- `src/lib/shared/analytics/services/posthog.ts`
- `src/lib/shared/auth/firebase.ts`

**Does:**

1. `before_send: dropKnownNoise` per section 5, registered unconditionally, every non-drop branch returning `event` explicitly.
2. Unit test asserting the filter drops the three synthetic noise shapes and passes everything else through as the same object.
3. The in-app-browser memory-cache branch in `initializeFirestore`.

**Does not:** add telemetry events. `before_send` cannot capture from inside itself.

**Verify:** the unit test. Then confirm normal event volume is unchanged in a production smoke check before trusting the `$exception` drop.

---

## Related

- `.claude/rules/clickables-look-like-buttons.md` — the escape action is a button, not a text link
- `.claude/rules/no-layout-shift.md` — the banner is fixed-position and reserves its own height
- `.claude/rules/never-hand-roll.md` — the banner, copy fallback, and instruction block already exist; this reuses them
- Memory: `feedback_design_system_mandatory`
