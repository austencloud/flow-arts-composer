# Kill the Bar — Hardening (post-Codex-review) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the correctness bugs, overclaims, and coverage gaps Codex 5.6 found in the shipped "kill the bar" path, and make the Phase B (app-forward) route genuinely launch-ready.

**Architecture:** Same shape as the shipped feature — a pure `resolveEscapeTarget()` resolver, a named-app detector, and an inline escape note. This plan hardens each: correct URL handling in the resolver, a typed effective-platform + broader auth-time detection, a hand-off *signal* watcher (not a fake rate), spec-accurate telemetry, a non-shifting accessible note, and the Phase B corrections (iOS store action, Android bridge route, magic-link claim + guest-draft warning).

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, Vitest (`tests/config/vitest.config.ts`), PostHog (`captureEvent`), Capacitor.

**Spec:** `docs/superpowers/specs/2026-07-22-kill-the-bar-app-forward-design.md` — §R is authoritative.

**Test (unit):** `npx vitest run --config tests/config/vitest.config.ts <path>`
**Typecheck (once, end only):** `npm run check` — check no other `svelte-check` runs first (`resource-budget.md`).
**Commits:** scoped pathspec only (`git commit -- <paths>`); shared tree.

**Out of scope (separate spec):** the secure single-use guest-transfer token (R.6.3 full fix). This plan only corrects the claim and warns on pending drafts.

---

## Task 1: Resolver — HTTPS-safe input, fragment-safe intents, iOS store action

Covers R.1.1 (fragment bug), R.1.2 (non-HTTPS/malformed), R.1.4 ("browser" copy), R.6.2 (iOS App Store action).

**Files:**
- Modify: `src/lib/shared/auth/services/escape-target.ts`
- Test: `tests/unit/auth/escape-target.test.ts`

- [ ] **Step 1: Add the failing boundary tests**

Append to `escape-target.test.ts`:

```ts
describe("resolveEscapeTarget — boundaries", () => {
  const hashUrl = "https://tkaflowarts.com/glossary?x=1#term";

  it("android intent data URI never contains the page hash (it breaks #Intent)", () => {
    const t = resolveEscapeTarget({
      platform: "android", iosMajorVersion: null, appLaunched: false, currentUrl: hashUrl,
    });
    const dataPart = t.url!.split("#Intent")[0]; // everything before the intent block
    expect(dataPart).not.toContain("#term");
    expect(t.url).toContain("#Intent;");
    // full url (hash included) survives in the fallback
    expect(decodeURIComponent(t.url!)).toContain("#term");
  });

  it("ios scheme preserves query and hash", () => {
    const t = resolveEscapeTarget({
      platform: "ios", iosMajorVersion: 18, appLaunched: false, currentUrl: hashUrl,
    });
    expect(t.url).toBe("x-safari-https://tkaflowarts.com/glossary?x=1#term");
  });

  it("non-HTTPS url → instruction-only target, never a fired url", () => {
    for (const platform of ["ios", "android"] as const) {
      const t = resolveEscapeTarget({
        platform, iosMajorVersion: 18, appLaunched: false,
        currentUrl: "http://tkaflowarts.com/create",
      });
      expect(t.url).toBeNull();
      expect(t.method).toMatch(/instructions$/);
    }
  });

  it("malformed url → instruction-only target, does not throw", () => {
    expect(() =>
      resolveEscapeTarget({
        platform: "android", iosMajorVersion: null, appLaunched: false, currentUrl: "not a url",
      })
    ).not.toThrow();
    const t = resolveEscapeTarget({
      platform: "android", iosMajorVersion: null, appLaunched: false, currentUrl: "not a url",
    });
    expect(t.url).toBeNull();
  });

  it("pre-launch android label + guide say browser, not Chrome", () => {
    const t = resolveEscapeTarget({
      platform: "android", iosMajorVersion: null, appLaunched: false,
      currentUrl: "https://tkaflowarts.com/x",
    });
    expect(t.label).toBe("Open in browser");
  });

  it("ios appLaunched=true surfaces an App Store action", () => {
    const t = resolveEscapeTarget({
      platform: "ios", iosMajorVersion: 18, appLaunched: true,
      currentUrl: "https://tkaflowarts.com/create",
      appStoreUrl: "https://apps.apple.com/app/id123",
    });
    expect(t.isAppTarget).toBe(true);
    expect(t.appStoreUrl).toBe("https://apps.apple.com/app/id123");
  });
});
```

Update the existing `"android pre-launch"` test to expect `label: "Open in browser"` (was `"Open in Chrome"`).

- [ ] **Step 2: Run — expect fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/auth/escape-target.test.ts`
Expected: FAIL (fragment in data URI, non-HTTPS fires, label mismatch, no appStoreUrl field).

- [ ] **Step 3: Implement**

Add an `appStoreUrl` field to `EscapeTarget`, an HTTPS guard, and fragment-safe intent building:

```ts
export interface EscapeTarget {
  method: EscapeMethod;
  label: string;
  url: string | null;
  isAppTarget: boolean;
  /** iOS post-launch: the App Store link shown as a secondary "Get the app". */
  appStoreUrl?: string;
}

/** Absolute https only. Anything else is not escapable and must not be fired. */
function parseHttpsUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

const INSTRUCTIONS: Record<"ios" | "other", EscapeTarget> = {
  ios: { method: "ios_instructions", label: "Open in Safari", url: null, isAppTarget: false },
  other: { method: "generic_instructions", label: "Open in your browser", url: null, isAppTarget: false },
};
```

Rewrite `androidIntent` to take the parsed `URL` and never include `u.hash` in the data URI:

```ts
function androidIntent(u: URL, input: EscapeInput): EscapeTarget {
  // host+path+search only — the hash is dropped here because the first '#'
  // would terminate the URI and swallow the '#Intent' block. The full URL,
  // hash included, is preserved in browser_fallback_url.
  const tail = `${u.host}${u.pathname}${u.search}`;
  const fullUrl = u.href;
  if (input.appLaunched) {
    const fallback = encodeURIComponent(
      input.playStoreUrl ?? `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`
    );
    return {
      method: "android_intent",
      label: "Open in the app",
      url: `intent://${tail}#Intent;scheme=https;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`,
      isAppTarget: true,
    };
  }
  return {
    method: "android_intent",
    label: "Open in browser",
    url: `intent://${tail}#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(fullUrl)};end`,
    isAppTarget: false,
  };
}
```

`resolveEscapeTarget`:

```ts
export function resolveEscapeTarget(input: EscapeInput): EscapeTarget {
  const u = parseHttpsUrl(input.currentUrl);
  // No https URL → nothing safe to fire. Give the platform's guide instead.
  if (!u) return input.platform === "other" ? INSTRUCTIONS.other : INSTRUCTIONS.ios;

  if (input.platform === "android") return androidIntent(u, input);

  if (input.platform === "ios") {
    if (input.iosMajorVersion !== null && input.iosMajorVersion >= IOS_MIN_SCHEME_VERSION) {
      return {
        method: "ios_scheme",
        label: "Open in Safari",
        url: u.href.replace(/^https:\/\//, "x-safari-https://"),
        isAppTarget: input.appLaunched,
        appStoreUrl: input.appLaunched ? input.appStoreUrl : undefined,
      };
    }
    return { ...INSTRUCTIONS.ios, isAppTarget: input.appLaunched, appStoreUrl: input.appLaunched ? input.appStoreUrl : undefined };
  }
  return INSTRUCTIONS.other;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/auth/escape-target.test.ts`
Expected: PASS (all boundary + original tests).

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(auth): resolver — drop hash from intent URI, require https, iOS store action, browser copy" -- src/lib/shared/auth/services/escape-target.ts tests/unit/auth/escape-target.test.ts
```

---

## Task 2: Detector — effective platform, iPad desktop mode, GSA token, native test

Covers R.1.3 (iPadOS), R.2 (GSA arrival token), R.5 (forced effective platform), R.7 (native carve-out test).

**Files:**
- Modify: `src/lib/shared/auth/services/in-app-browser-detector.ts`
- Test: `tests/unit/auth/in-app-browser-detector.test.ts`

- [ ] **Step 1: Failing tests**

```ts
const GSA_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 GSA/300.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15 Instagram 300.0";

it("flags the Google iOS app (GSA)", () => {
  withUA(GSA_IOS);
  expect(new InAppBrowserDetector().isInAppBrowser()).toBe(true);
});

it("treats a touch iPad in desktop mode as iOS", () => {
  vi.stubGlobal("navigator", { userAgent: IPAD_DESKTOP, vendor: "", maxTouchPoints: 5 });
  const d = new InAppBrowserDetector();
  expect(d.getPlatform()).toBe("ios");
  expect(d.getIosMajorVersion()).not.toBeNull();
});

it("a forced value yields a typed effective platform on desktop", () => {
  withUA("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537");
  const d = new InAppBrowserDetector();
  const params = new URLSearchParams("forceIAB=ios");
  expect(d.getEffectivePlatform(params)).toBe("ios");
});
```

Also add a native-carve-out test in a `describe` that re-mocks Capacitor to `isNativePlatform: () => true` and asserts `isInAppBrowser()` is false even for `IG_IOS`. (Use `vi.doMock` + dynamic import, or a second test file, since the top-level mock is static.)

- [ ] **Step 2: Run — expect fail.**

- [ ] **Step 3: Implement**

Add `GSA/` to the pattern list (Meta section is fine, or a new "Other apps" entry):

```ts
{ pattern: /GSA\//i, name: "Google App" },
```

iPad desktop-mode aware `isIOS`:

```ts
private isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
  // iPadOS 13+ desktop mode sends a Mac UA; touch points disambiguate it from
  // a real Mac, which reports maxTouchPoints 0.
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  return /Macintosh/i.test(navigator.userAgent) && (nav.maxTouchPoints ?? 0) > 1;
}
```

Typed effective platform (resolves a forced value to a platform centrally):

```ts
/**
 * The platform to resolve escapes against, honoring ?forceIAB=ios|android so
 * the test matrix actually exercises those paths on a desktop. A forced value
 * that isn't a platform (true/false) falls back to real detection.
 */
getEffectivePlatform(searchParams?: URLSearchParams): InAppBrowserPlatform {
  const forced = this.getForcedValue(searchParams);
  if (forced === "ios" || forced === "android") return forced;
  return this.getPlatform();
}
```

Update `getEscapeTarget` to use `getEffectivePlatform(searchParams)` instead of `getPlatform()`.

- [ ] **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(auth): detector — GSA token, iPad desktop-mode, typed effective platform + native test" -- src/lib/shared/auth/services/in-app-browser-detector.ts tests/unit/auth/in-app-browser-detector.test.ts
```

---

## Task 3: OAuth-failure recovery detection

Covers R.2 (the auth-path miss). When a provider tap slips past detection and OAuth returns `disallowed_useragent`, treat it as a detected webview: reveal the note and record it.

**Files:**
- Modify: `src/lib/shared/auth/components/SocialAuthCompact.svelte`

- [ ] **Step 1: Handle the disallowed_useragent code in the Google catch**

In `handleGoogleClick`'s `catch`, after `getAuthErrorCode(error)`, add:

```ts
if (errorCode === "auth/operation-not-supported-in-this-environment" ||
    /disallowed_useragent/i.test(String((error as { message?: string })?.message))) {
  // OAuth rejected this environment as an embedded webview even though arrival
  // detection didn't name it. Surface the escape path instead of a raw dead end.
  googleError = blockedProviderMessage("Google");
  captureEvent("inapp_browser_oauth_rejected", { provider: "google", route: analyticsRoute() });
  revealEscapeNote();
  return;
}
```

(Facebook's failure path routes through `onFacebookAuth?.()`, which is host-owned; leave a TODO note in the report that the same recovery belongs wherever that surfaces its error.)

- [ ] **Step 2: Verify by grep**

Run: `grep -n "inapp_browser_oauth_rejected\|disallowed_useragent" src/lib/shared/auth/components/SocialAuthCompact.svelte`
Expected: the new branch present.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(auth): reveal escape note when OAuth rejects the environment (webview miss recovery)" -- src/lib/shared/auth/components/SocialAuthCompact.svelte
```

---

## Task 4: Failure watcher — hand-off signal, not a fake rate

Covers R.3. Record raw signals + elapsed time, send via `sendBeacon`-class immediate transport, keep the watcher alive after fallback.

**Files:**
- Modify: `src/lib/shared/auth/components/InAppEscapeControls.svelte`

- [ ] **Step 1: Replace the binary resolve with a signal recorder**

Change `resolveEscape` to record the raw signal + elapsed and NOT tear down the watcher on `stayed` (keep listening in case the hand-off is just slow):

```ts
let attemptStartedAt = 0;

function recordSignal(signal: "hidden" | "pagehide" | "timeout") {
  if (escapeState !== "waiting") {
    // A late hand-off after the timeout already flipped us to "stayed": still
    // worth recording, since it proves the escape eventually worked.
    if (signal !== "timeout") {
      captureEvent("inapp_browser_escape_signal", {
        method: target.method, signal, phase: "late",
        elapsed_ms: nowMs() - attemptStartedAt, route,
      });
    }
    return;
  }
  const elapsed = nowMs() - attemptStartedAt;
  if (signal === "timeout") {
    escapeState = "stayed"; // reveal fallback, but keep listeners attached
  } else {
    clearEscapeWatch();
    escapeState = "idle";
  }
  captureEvent("inapp_browser_escape_signal", {
    method: target.method, signal,
    phase: signal === "timeout" ? "timeout" : "handoff",
    elapsed_ms: elapsed, route,
  });
}
```

- Add `function nowMs() { return typeof performance !== "undefined" ? performance.now() : 0; }`.
- `onVisibilityChange` → `recordSignal("hidden")`; `onPageHide` → `recordSignal("pagehide")`; the timer → `recordSignal("timeout")`.
- In `handleEscape`, set `attemptStartedAt = nowMs()` before firing, and do NOT `clearEscapeWatch()` when entering `stayed` — only on unmount (`onDestroy`) and on a confirmed `hidden`/`pagehide`.

- [ ] **Step 2: Send the signal immediately**

`captureEvent` batches. For the `pagehide`/`hidden` branch specifically, flush immediately. PostHog exposes `posthog.capture(name, props, { transport: "sendBeacon" })` — add a thin helper in the analytics service (or call `captureEvent` with an options passthrough if one exists; if not, add `captureEventImmediate`). Verify the installed posthog-js supports the `sendBeacon` transport option before relying on it; if not, call `posthog.capture(..., { send_instantly: true })`. Cite the verified option in a comment.

- [ ] **Step 3: Update the spec claim** — already done in §R.3 (signal, not rate). No code.

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(auth): escape watcher records raw hand-off signals + elapsed, immediate transport" -- src/lib/shared/auth/components/InAppEscapeControls.svelte src/lib/shared/analytics/services/posthog.ts
```

---

## Task 5: Telemetry schema + dedupe + pre-init queue

Covers R.4 (telemetry).

**Files:**
- Modify: `src/lib/shared/auth/components/InAppEscapeControls.svelte`, `SocialAuthCompact.svelte`

- [ ] **Step 1: Pass an immutable attempt context into the controls**

`SocialAuthCompact` passes a `context` prop `{ platform, iosMajor, appLaunched }` (read once from the detector) alongside `target`. `InAppEscapeControls` spreads it into `escape_attempted`, `escape_signal`, and `get_app_clicked` so all three carry `platform`, `ios_major`, `app_launched`. `get_app_clicked` drops `method`-only.

- [ ] **Step 2: Fire signin_intent only on the reveal transition**

In `revealEscapeNote`, guard:

```ts
function revealEscapeNote() {
  if (showEscapeNote) return; // already revealed by a prior provider tap
  showEscapeNote = true;
  captureEvent("inapp_browser_signin_intent", { method: escapeAction.method, route: analyticsRoute() });
}
```

- [ ] **Step 3: Queue pre-init events**

If `captureEvent` drops when PostHog isn't ready (it early-returns on `!initialized`), route these auth-critical events through `onPostHogReady` (already exported from posthog.ts) so a tap before init still records once ready. Add a small `captureWhenReady(name, props)` helper in the analytics service and use it for `signin_intent` / `oauth_rejected`.

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(auth): telemetry carries platform/ios_major/app_launched, dedupes intent, queues pre-init" -- src/lib/shared/auth/components/InAppEscapeControls.svelte src/lib/shared/auth/components/SocialAuthCompact.svelte src/lib/shared/analytics/services/posthog.ts
```

---

## Task 6: Note UX — no double shift, guide always present

Covers R.4 (layout). 

**Files:**
- Modify: `src/lib/shared/auth/components/InAppEscapeControls.svelte`, `SocialAuthCompact.svelte`

- [ ] **Step 1: Keep the guide + copy present during the optimistic attempt**

Change the derived visibility so the guide and copy do NOT disappear while `escapeState === "waiting"`: show a small inline "Opening…" note *next to* the primary button rather than replacing the whole control set. `showGuide` becomes `true` for instruction methods always, and for scheme/intent methods show a compact hint immediately (not only after `stayed`).

- [ ] **Step 2: Replace the provider error, don't stack**

In `SocialAuthCompact`, collapse `googleError`/`facebookError`/`instagramError` into a single `providerError` string so switching providers replaces the message instead of rendering three `<p>`s.

- [ ] **Step 3: Reserve height**

Wrap the note in a container that reserves its max height (measure the fully-expanded state, or use a min-height token) so the reveal doesn't shove the buttons above it (`no-layout-shift.md`).

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(auth): escape note reserves height, keeps guide during attempt, single provider error" -- src/lib/shared/auth/components/InAppEscapeControls.svelte src/lib/shared/auth/components/SocialAuthCompact.svelte
```

---

## Task 7: Accessibility — focus, announce, contrast

Covers R.4 (a11y).

**Files:**
- Modify: `src/lib/shared/auth/components/InAppEscapeControls.svelte`, `SocialAuthCompact.svelte`

- [ ] **Step 1: Focus + select the manual field on reveal**

When `copyFailed` flips true, after render focus and select the field:

```svelte
<input ... use:autoselect />
```

with a small action:

```ts
function autoselect(node: HTMLInputElement) {
  node.focus();
  node.select();
}
```

(The `onfocus` select stays as a fallback.) Add `aria-live="polite"` copy-failure text so the change is announced.

- [ ] **Step 2: Wire aria on the reveal relationship**

On the provider buttons in `SocialAuthCompact`, add `aria-expanded={showEscapeNote}` and `aria-controls="inapp-escape-note"`; give the note container `id="inapp-escape-note"` and `role="region"` + an `aria-label`.

- [ ] **Step 3: Fix button contrast**

White text on the `#4285f4`→`#34a853` gradient fails AA (~3.06:1 on the green). Darken the gradient stops (e.g. `#1a56db`→`#177245`) or drop the gradient for a solid that passes 4.5:1 with white. Verify the chosen stops against WCAG AA for normal text.

- [ ] **Step 4: Commit**

```bash
git commit -m "a11y(auth): focus/announce manual copy field, wire aria-expanded/controls, fix button contrast" -- src/lib/shared/auth/components/InAppEscapeControls.svelte src/lib/shared/auth/components/SocialAuthCompact.svelte
```

---

## Task 8: Test-override safety

Covers R.5 (override footguns).

**Files:**
- Modify: `src/lib/shared/auth/config/app-availability.ts`, `src/lib/shared/auth/components/InAppEscapeControls.svelte`

- [ ] **Step 1: Gate `?appLaunched=1` to non-production hosts**

```ts
import { dev } from "$app/environment";

export function isAppLaunched(searchParams?: URLSearchParams): boolean {
  // The query override is a test hook, honored only off production so a shared
  // link carrying ?appLaunched=1 can't route real visitors to an unbuilt path.
  const overrideAllowed = dev || nonProdHost();
  if (overrideAllowed && searchParams?.get("appLaunched") === "1") return true;
  const flag = env.PUBLIC_APP_LAUNCHED;
  return flag === "1" || flag === "true";
}
```

Add `nonProdHost()` checking `window.location.hostname` against `localhost`/`dev.`/`127.0.0.1` (SSR-safe: return false when `window` is undefined).

- [ ] **Step 2: Strip test params from the copied URL**

In `InAppEscapeControls`, build the copy/currentUrl with `forceIAB` and `appLaunched` removed:

```ts
function cleanShareUrl(): string {
  const u = new URL(window.location.href);
  u.searchParams.delete("forceIAB");
  u.searchParams.delete("appLaunched");
  return u.href;
}
```

Use `cleanShareUrl()` for both the clipboard write and the manual field so a copied link never carries the test flags.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(auth): gate appLaunched override to non-prod, strip test params from copied links" -- src/lib/shared/auth/config/app-availability.ts src/lib/shared/auth/components/InAppEscapeControls.svelte
```

---

## Task 9: Delete the stale detector methods

Covers R.1.5.

**Files:**
- Modify: `src/lib/shared/auth/services/in-app-browser-detector.ts`

- [ ] **Step 1: Confirm no external consumers**

Run: `for m in getOpenInBrowserUrl canOpenInExternalBrowser getInAppBrowserName; do grep -rn "$m" src/ | grep -v "in-app-browser-detector.ts:"; done`
Expected: no output (getForcedValue stays — getEffectivePlatform uses it internally).

- [ ] **Step 2: Delete `getOpenInBrowserUrl`, `canOpenInExternalBrowser`, `getInAppBrowserName`** and any now-unused private helpers they alone used (verify each `isAndroid`/`isIOS` still has a caller before removing).

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(auth): delete stale detector methods superseded by the resolver" -- src/lib/shared/auth/services/in-app-browser-detector.ts
```

---

## Task 10: Phase B launch-readiness (design + code where actionable)

Covers R.6. The pure-config/manual bits are flagged, not faked.

- [ ] **Step 1 (code): Android app escapes route through a manifest-covered bridge**

The app only App-Links `/q/`, `/sequence/`, `/store/`. Add a bridge: when `isAppTarget` and the current path is NOT one of those prefixes, build the intent against a covered bridge path that carries the real destination as a validated query param — e.g. `/store/open?to=<pathname+search>` — and have the app restore it. Implement the resolver side here (build the bridge intent); the native restore handler is a native-app task tracked separately. Add a `PROJECT_ROUTE_PREFIXES` check so covered routes still deep-link directly.

- [ ] **Step 2 (code): magic-link claim correction + guest-draft warning**

`EmailLinkAuth.svelte`: when `inAppBrowser` AND pending anonymous drafts exist (grep the anonymous-draft source used by `anonymous-upgrade.ts` / `captureAnonDrafts`), show a warning line: "Your unsaved work stays on this browser. Finish here, or it won't follow the link." Do not claim the drafts transfer. (Full transfer = separate spec.)

- [ ] **Step 3 (config/manual — report, do not fake):**
  - Replace `TEAMID` in `static/.well-known/apple-app-site-association` with the real Apple Team ID.
  - Add native associated-domains entitlement (iOS) for Universal Links.
  - Widen the AASA `components` + Android manifest `pathPrefix` to cover the app route families the bridge does not (or rely on the single bridge path from Step 1).
  - Set `PUBLIC_APP_STORE_URL`, `PUBLIC_PLAY_STORE_URL`, `PUBLIC_APP_LAUNCHED=1` at launch.

- [ ] **Step 4: Commit** (code parts only)

```bash
git commit -m "feat(auth): Android app-escape bridge route + magic-link guest-draft warning" -- src/lib/shared/auth/services/escape-target.ts src/lib/shared/auth/components/EmailLinkAuth.svelte
```

---

## Task 11: Verify

- [ ] **Step 1: Unit suite**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/auth/`
Expected: all green, including every new boundary/matrix/native test.

- [ ] **Step 2: One machine-wide typecheck** (confirm no other `svelte-check` first, per `resource-budget.md`)

```bash
npm run check > /tmp/kill-bar-hardening-check.log 2>&1
grep -niE "error" /tmp/kill-bar-hardening-check.log
```

Fix every error in touched files; iterate to green.

- [ ] **Step 3: Manual matrix** (Austen, dev server, HTTPS — browser use needs his OK)

`?forceIAB=ios` now actually forces iOS platform on desktop; verify the label/guide match; `/glossary#term?forceIAB=android` produces a valid intent (no double `#`); `?appLaunched=1` does nothing on production host; copied link carries no test params.

---

## Self-Review

- **Coverage vs §R:** R.1.1→T1, R.1.2→T1, R.1.3→T2, R.1.4→T1, R.1.5→T9, R.2→T2+T3, R.3→T4, R.4(telemetry)→T5, R.4(layout)→T6, R.4(a11y)→T7, R.5→T2+T8, R.6.1→T10.1, R.6.2→T1(resolver)+T10.3(config), R.6.3→T10.2(warn)+separate spec, R.7→T1/T2 tests + T11.
- **Placeholders:** none — code shown for every code step. The one deliberately-deferred item (secure guest-transfer) is named as a separate spec, not left as a TODO in code.
- **Type consistency:** `EscapeTarget.appStoreUrl`, `getEffectivePlatform`, `recordSignal`, `captureWhenReady`, `cleanShareUrl`, `nonProdHost` used consistently across tasks.
- **Ordering:** T1/T2 (pure, tested) before T3–T8 (components consuming them); T9 cleanup after consumers settle; T10 last (Phase B); T11 verifies.
