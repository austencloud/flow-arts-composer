# Kill the Bar — App-Forward In-App-Browser Path — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the arrival in-app-browser banner with a sign-in-intent compact note, fix detection to named-app-only, and route escapes through one flag-gated resolver so store-launch is a one-line flip.

**Architecture:** A pure `resolveEscapeTarget()` function is the single source of truth for what the escape action/label/URL is, keyed on platform + iOS version + an `appLaunched` flag. The detector stops false-positiving real browsers by matching named apps only. A compact note (hosting an extracted `InAppEscapeControls` component) reveals on a webview Google/Facebook tap instead of a banner on arrival. The old full-screen sheet and banner are deleted.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, Vitest (`tests/config/vitest.config.ts`), PostHog (`captureEvent`), Capacitor.

**Spec:** `docs/superpowers/specs/2026-07-22-kill-the-bar-app-forward-design.md`

**Test command (unit):** `npx vitest run --config tests/config/vitest.config.ts <path>`
**Typecheck (once, at the end only):** `npm run check` — never in the inner loop.
**Commit discipline:** scoped pathspec only (`git commit -- <paths>`); the tree is shared with other sessions.

---

## File Structure

**New:**
- `src/lib/shared/auth/services/escape-target.ts` — pure resolver + types.
- `src/lib/shared/auth/services/escape-target.test.ts` — matrix unit tests.
- `src/lib/shared/auth/config/app-availability.ts` — reads the `appLaunched` flag + store URLs from env, with a `?appLaunched=1` override.
- `src/lib/shared/auth/components/InAppEscapeControls.svelte` — the escape machinery (fire scheme/intent, failure watcher, pointed guide, copy fallback), extracted from `InAppBrowserPrompt.svelte`.

**Modified:**
- `src/lib/shared/auth/services/in-app-browser-detector.ts` — drop generic iOS heuristic + allowlist; add `getIosMajorVersion()`; add `getEscapeTarget()` delegating to the resolver.
- `src/lib/shared/auth/components/SocialAuthCompact.svelte` — reveal the compact note on a webview Google/FB tap; fire `inapp_browser_signin_intent`.
- `src/lib/shared/auth/components/InAppBrowserPrompt.svelte` — delete (banner + sheet both go); machinery already moved to `InAppEscapeControls`.
- `src/routes/+layout.svelte` — remove the `InAppBrowserPrompt` mount.
- `src/lib/shared/auth/components/EmailLinkAuth.svelte` — bridge-framed copy string only.

**Config (manual, not code — Task 9):** `.env` keys, `apple-app-site-association` Team ID.

---

## Task 1: The escape-target resolver (pure, TDD)

**Files:**
- Create: `src/lib/shared/auth/services/escape-target.ts`
- Test: `src/lib/shared/auth/services/escape-target.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/shared/auth/services/escape-target.test.ts
import { describe, it, expect } from "vitest";
import { resolveEscapeTarget } from "./escape-target";

const base = { currentUrl: "https://tkaflowarts.com/create/construct" };

describe("resolveEscapeTarget", () => {
  it("android pre-launch → browser intent, browser label", () => {
    const t = resolveEscapeTarget({ ...base, platform: "android", iosMajorVersion: null, appLaunched: false });
    expect(t.method).toBe("android_intent");
    expect(t.isAppTarget).toBe(false);
    expect(t.url).toContain("intent://");
    expect(t.url).toContain("scheme=https");
    expect(t.url).not.toContain("package=");
    expect(t.label).toBe("Open in Chrome");
  });

  it("android post-launch → app intent with package + play-store fallback", () => {
    const t = resolveEscapeTarget({ ...base, platform: "android", iosMajorVersion: null, appLaunched: true });
    expect(t.method).toBe("android_intent");
    expect(t.isAppTarget).toBe(true);
    expect(t.url).toContain("package=com.tkaflowarts.composer");
    expect(t.url).toContain("S.browser_fallback_url=");
    expect(t.label).toBe("Open in the app");
  });

  it("ios 17+ → x-safari-https scheme, Safari label", () => {
    const t = resolveEscapeTarget({ ...base, platform: "ios", iosMajorVersion: 18, appLaunched: false });
    expect(t.method).toBe("ios_scheme");
    expect(t.url).toBe("x-safari-https://tkaflowarts.com/create/construct");
    expect(t.label).toBe("Open in Safari");
  });

  it("ios 16 → instructions only, NO scheme fired (avoids invalid-page dialog)", () => {
    const t = resolveEscapeTarget({ ...base, platform: "ios", iosMajorVersion: 16, appLaunched: false });
    expect(t.method).toBe("ios_instructions");
    expect(t.url).toBeNull();
  });

  it("ios unknown version → instructions only", () => {
    const t = resolveEscapeTarget({ ...base, platform: "ios", iosMajorVersion: null, appLaunched: false });
    expect(t.method).toBe("ios_instructions");
    expect(t.url).toBeNull();
  });

  it("other platform → generic instructions, no scheme", () => {
    const t = resolveEscapeTarget({ ...base, platform: "other", iosMajorVersion: null, appLaunched: false });
    expect(t.method).toBe("generic_instructions");
    expect(t.url).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/auth/services/escape-target.test.ts`
Expected: FAIL — `resolveEscapeTarget` not found.

- [ ] **Step 3: Write the resolver**

```ts
// src/lib/shared/auth/services/escape-target.ts

/** Android/iOS package + store identity. Single place to change if it ever moves. */
const ANDROID_PACKAGE = "com.tkaflowarts.composer";
const IOS_MIN_SCHEME_VERSION = 17; // x-safari-https:// is reliable on iOS 17+.

export type EscapeMethod =
  | "android_intent"
  | "ios_scheme"
  | "ios_instructions"
  | "generic_instructions";

export interface EscapeTarget {
  method: EscapeMethod;
  /** Button text. Comes entirely from here so no component hardcodes it. */
  label: string;
  /** Scheme/intent URL to fire, or null for a guide-only method. */
  url: string | null;
  /** Routing to the native app vs the browser. */
  isAppTarget: boolean;
}

export interface EscapeInput {
  platform: "ios" | "android" | "other";
  iosMajorVersion: number | null;
  appLaunched: boolean;
  currentUrl: string;
  /** Store URLs, injected so the resolver stays pure and testable. */
  playStoreUrl?: string;
  appStoreUrl?: string;
}

function androidIntent(input: EscapeInput): EscapeTarget {
  const u = new URL(input.currentUrl);
  const tail = `${u.host}${u.pathname}${u.search}${u.hash}`;
  if (input.appLaunched) {
    const fallback = encodeURIComponent(
      input.playStoreUrl ??
        `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`
    );
    return {
      method: "android_intent",
      label: "Open in the app",
      url: `intent://${tail}#Intent;scheme=https;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`,
      isAppTarget: true,
    };
  }
  // Pre-launch: no package, so it resolves against any installed browser.
  return {
    method: "android_intent",
    label: "Open in Chrome",
    url: `intent://${tail}#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(input.currentUrl)};end`,
    isAppTarget: false,
  };
}

export function resolveEscapeTarget(input: EscapeInput): EscapeTarget {
  if (input.platform === "android") return androidIntent(input);

  if (input.platform === "ios") {
    // Fire the scheme only where it is reliable. On older/unknown iOS an
    // unsupported scheme raises a native "invalid page" dialog, so guide instead.
    if (input.iosMajorVersion !== null && input.iosMajorVersion >= IOS_MIN_SCHEME_VERSION) {
      return {
        method: "ios_scheme",
        label: "Open in Safari",
        // x-safari-https:// takes the URL with its https scheme replaced.
        url: input.currentUrl.replace(/^https:\/\//, "x-safari-https://"),
        isAppTarget: false,
      };
    }
    return { method: "ios_instructions", label: "Open in Safari", url: null, isAppTarget: false };
  }

  return { method: "generic_instructions", label: "Open in your browser", url: null, isAppTarget: false };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/auth/services/escape-target.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/auth/services/escape-target.ts src/lib/shared/auth/services/escape-target.test.ts
git commit -m "feat(auth): escape-target resolver, single source of truth for in-app escape" -- src/lib/shared/auth/services/escape-target.ts src/lib/shared/auth/services/escape-target.test.ts
```

---

## Task 2: Detector — named-app-only + iOS version parse (TDD)

**Files:**
- Modify: `src/lib/shared/auth/services/in-app-browser-detector.ts`
- Test: `src/lib/shared/auth/services/in-app-browser-detector.test.ts` (create)

Context: `detect()` at `:166-193` currently has, after the named-pattern loop, a generic fallback (`if (this.isIOS() && !IOS_REAL_BROWSERS.test(combined) && !combined.includes("Safari"))`) that flags any iOS UA lacking `Safari`. That is the false-positive source. Named-app matching alone cannot false-positive a real browser, so the generic block AND the `IOS_REAL_BROWSERS` allowlist both go.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/shared/auth/services/in-app-browser-detector.test.ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { InAppBrowserDetector } from "./in-app-browser-detector";

function withUA(ua: string) {
  vi.stubGlobal("navigator", { userAgent: ua, vendor: "" });
}
afterEach(() => vi.unstubAllGlobals());

const IG_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0";
const OPERA_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 OPT/3.3.3 Mobile/15E148";
const IOS26_IG =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0";

describe("InAppBrowserDetector", () => {
  it("flags Instagram iOS", () => {
    withUA(IG_IOS);
    expect(new InAppBrowserDetector().isInAppBrowser()).toBe(true);
  });

  it("does NOT flag Opera for iOS (the deleted generic heuristic's false positive)", () => {
    withUA(OPERA_IOS);
    expect(new InAppBrowserDetector().isInAppBrowser()).toBe(false);
  });

  it("parses iOS major version from the UA", () => {
    withUA(IG_IOS);
    expect(new InAppBrowserDetector().getIosMajorVersion()).toBe(18);
    withUA(IOS26_IG);
    expect(new InAppBrowserDetector().getIosMajorVersion()).toBe(26);
  });

  it("returns null iOS version on a non-iOS UA", () => {
    withUA("Mozilla/5.0 (Linux; Android 13) Instagram 300.0");
    expect(new InAppBrowserDetector().getIosMajorVersion()).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/auth/services/in-app-browser-detector.test.ts`
Expected: FAIL — Opera test fails (still flagged) and `getIosMajorVersion` not defined.

- [ ] **Step 3: Delete the generic heuristic + allowlist**

In `in-app-browser-detector.ts`, remove the `IOS_REAL_BROWSERS` const (near the pattern list) and delete the entire generic fallback block inside `detect()` — the one shaped like:

```ts
// DELETE THIS BLOCK:
if (
  this.isIOS() &&
  !IOS_REAL_BROWSERS.test(combined) &&
  !combined.includes("Safari")
) {
  this.cachedResult = { isInApp: true, name: "App" };
  return this.cachedResult;
}
```

After the named-pattern loop, `detect()` falls straight through to `{ isInApp: false, name: null }`.

- [ ] **Step 4: Add `getIosMajorVersion()`**

Add this public method (near `getPlatform`):

```ts
/** iOS major version parsed from the UA, or null when not iOS / unparseable. */
getIosMajorVersion(): number | null {
  if (typeof navigator === "undefined") return null;
  // "CPU iPhone OS 18_7 like Mac OS X" / "CPU OS 26_5" on iPad.
  const m = navigator.userAgent.match(/OS (\d+)[_.]/);
  return this.isIOS() && m ? Number(m[1]) : null;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/auth/services/in-app-browser-detector.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/auth/services/in-app-browser-detector.ts src/lib/shared/auth/services/in-app-browser-detector.test.ts
git commit -m "fix(auth): detector matches named apps only, kills Opera-iOS false positive; add iOS version parse" -- src/lib/shared/auth/services/in-app-browser-detector.ts src/lib/shared/auth/services/in-app-browser-detector.test.ts
```

---

## Task 3: app-availability config

**Files:**
- Create: `src/lib/shared/auth/config/app-availability.ts`

- [ ] **Step 1: Write it**

```ts
// src/lib/shared/auth/config/app-availability.ts
import { PUBLIC_APP_LAUNCHED, PUBLIC_APP_STORE_URL, PUBLIC_PLAY_STORE_URL } from "$env/static/public";

/**
 * Whether the native app is live in the stores. The whole app-forward escape
 * path flips on this one value, so store-launch is an env change, not a code
 * change. `?appLaunched=1` overrides it for testing before the real flag flips.
 */
export function isAppLaunched(searchParams?: URLSearchParams): boolean {
  if (searchParams?.get("appLaunched") === "1") return true;
  return PUBLIC_APP_LAUNCHED === "1" || PUBLIC_APP_LAUNCHED === "true";
}

export function appStoreUrl(): string | undefined {
  return PUBLIC_APP_STORE_URL || undefined;
}

export function playStoreUrl(): string | undefined {
  return PUBLIC_PLAY_STORE_URL || undefined;
}
```

- [ ] **Step 2: Add the keys to `.env.example`**

Append:

```
# Native app availability (flip PUBLIC_APP_LAUNCHED=1 at store launch)
PUBLIC_APP_LAUNCHED=
PUBLIC_APP_STORE_URL=
PUBLIC_PLAY_STORE_URL=
```

- [ ] **Step 3: Wire `getEscapeTarget()` on the detector**

In `in-app-browser-detector.ts`, add a convenience that composes the detector's own signals with the resolver, so components have one call:

```ts
import { resolveEscapeTarget, type EscapeTarget } from "./escape-target";
import { isAppLaunched, playStoreUrl, appStoreUrl } from "../config/app-availability";

// method on the class:
getEscapeTarget(searchParams?: URLSearchParams): EscapeTarget {
  return resolveEscapeTarget({
    platform: this.getPlatform(),
    iosMajorVersion: this.getIosMajorVersion(),
    appLaunched: isAppLaunched(searchParams),
    currentUrl: typeof window !== "undefined" ? window.location.href : "",
    playStoreUrl: playStoreUrl(),
    appStoreUrl: appStoreUrl(),
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/auth/config/app-availability.ts src/lib/shared/auth/services/in-app-browser-detector.ts .env.example
git commit -m "feat(auth): app-availability flag + detector.getEscapeTarget() convenience" -- src/lib/shared/auth/config/app-availability.ts src/lib/shared/auth/services/in-app-browser-detector.ts .env.example
```

---

## Task 4: Extract `InAppEscapeControls.svelte`

**Files:**
- Create: `src/lib/shared/auth/components/InAppEscapeControls.svelte`

Move the escape machinery out of `InAppBrowserPrompt.svelte` verbatim in behavior: the fire-target logic, the `visibilitychange`/`pagehide`/1500ms failure watcher (`escapeState` idle/waiting/stayed), the pointed-menu guide blocks (ios / generic), and the already-fixed `handleCopyUrl` + manual-copy field. The component takes no route/banner concerns — it renders the escape button, guide, and copy inline and expands on failure.

- [ ] **Step 1: Create the component**

Props: `{ target }: { target: EscapeTarget }` plus a `route` string for telemetry. Body carries over these unchanged from `InAppBrowserPrompt.svelte`: `escapeState`, `escapeTimer`, `watching`, `onVisibilityChange`, `onPageHide`, `clearEscapeWatch`, `resolveEscape`, `copied`, `copyFailed`, `handleCopyUrl`, `copyViaClipboardApi`, `copyViaSelection`, and the `.escape-instructions` / `.instruction-step` / `.step-number` / `.manual-copy` styles.

`handleEscape()` becomes target-driven:

```svelte
<script lang="ts">
  import type { EscapeTarget } from "../services/escape-target";
  import { captureEvent } from "$lib/shared/analytics/services/posthog";

  let { target, route }: { target: EscapeTarget; route: string } = $props();

  let escapeState = $state<"idle" | "waiting" | "stayed">("idle");
  let copied = $state(false);
  let copyFailed = $state(false);
  const currentUrl = typeof window !== "undefined" ? window.location.href : "";
  // ...watcher fns carried over unchanged (onVisibilityChange, onPageHide,
  //    clearEscapeWatch, resolveEscape) but resolveEscape reports target.method...

  function handleEscape() {
    copyFailed = false;
    captureEvent("inapp_browser_escape_attempted", { method: target.method, route });

    if (target.url === null) return; // instructions-only methods just show the guide

    if (target.method === "android_intent" || target.method === "ios_scheme") {
      escapeState = "waiting";
      clearEscapeWatch();
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("pagehide", onPageHide);
      watching = true;
      escapeTimer = setTimeout(() => resolveEscape("stayed"), 1500);
      window.location.href = target.url;
    }
  }
  // handleCopyUrl / copyViaClipboardApi / copyViaSelection: carried over verbatim.
</script>
```

Markup: the `{target.label}` button (calls `handleEscape`), then the guide shown when `target.method` is `ios_instructions` / `generic_instructions` OR after `escapeState === "stayed"`, then the Copy Link button + manual-copy field on `copyFailed`. Reuse the exact guide/copy markup from `InAppBrowserPrompt.svelte:322-378`, swapping the platform `{#if}` to key off `target.method`.

- [ ] **Step 2: Verify it compiles in isolation**

No unit test (Svelte component; verified via the manual `?forceIAB` matrix in Task 8). Confirm no TS errors by eye against the imported `EscapeTarget` shape.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/auth/components/InAppEscapeControls.svelte
git commit -m "feat(auth): InAppEscapeControls — extracted, target-driven escape machinery" -- src/lib/shared/auth/components/InAppEscapeControls.svelte
```

---

## Task 5: Compact note in `SocialAuthCompact.svelte`

**Files:**
- Modify: `src/lib/shared/auth/components/SocialAuthCompact.svelte`

Context: `handleGoogleClick()` at `:100` already sets `googleError = blockedProviderMessage("Google")` and returns when `detector.isInAppBrowserOrForced(...)` (used at `:71`). `handleFacebookClick()` at `:169`. Error rendered at `:279-280`. This task reveals the escape note alongside that error.

- [ ] **Step 1: Add note state + reveal**

In the script, add:

```ts
import { getInAppBrowserDetector } from "../get-in-app-browser-detector";
import InAppEscapeControls from "./InAppEscapeControls.svelte";
import { captureEvent } from "$lib/shared/analytics/services/posthog";
import { analyticsRoute } from "$lib/shared/analytics/analytics-context";

let showEscapeNote = $state(false);
const escapeTarget = $derived(
  getInAppBrowserDetector().getEscapeTarget(page.url.searchParams)
);

function revealEscapeNote() {
  showEscapeNote = true;
  captureEvent("inapp_browser_signin_intent", {
    method: escapeTarget.method,
    route: analyticsRoute(),
  });
}
```

In `handleGoogleClick` and `handleFacebookClick`, at the in-app-browser branch where the blocked message is set, also call `revealEscapeNote()`.

- [ ] **Step 2: Render the note**

Below the `{#if googleError}` block (`:279-281`), add:

```svelte
{#if showEscapeNote}
  <div class="escape-note">
    <p class="escape-note-lead">
      Google and Facebook sign-in are blocked in this browser. Use the email link
      above, or open this page in your browser:
    </p>
    <InAppEscapeControls target={escapeTarget} route={analyticsRoute()} />
  </div>
{/if}
```

Style `.escape-note` compact: reserved space, no layout shift on reveal (`no-layout-shift.md`), real button affordances (the escape button comes from `InAppEscapeControls`).

- [ ] **Step 3: Manual smoke (deferred to Task 8's matrix)** — no unit test for the Svelte wiring.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/auth/components/SocialAuthCompact.svelte
git commit -m "feat(auth): reveal compact escape note on webview Google/Facebook tap" -- src/lib/shared/auth/components/SocialAuthCompact.svelte
```

---

## Task 6: Delete the banner + full-screen sheet

**Files:**
- Delete: `src/lib/shared/auth/components/InAppBrowserPrompt.svelte`
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Remove the mount**

In `src/routes/+layout.svelte`, delete the `InAppBrowserPromptComp` state (`:283`), its dynamic import (`:574-582`), and the `{#if containerReady && InAppBrowserPromptComp}<InAppBrowserPromptComp />` block (`:743-744`). Confirm no other importer:

Run: `grep -rn "InAppBrowserPrompt" src/`
Expected: only matches inside the file being deleted (none after deletion).

- [ ] **Step 2: Delete the component**

```bash
git rm src/lib/shared/auth/components/InAppBrowserPrompt.svelte
```

- [ ] **Step 3: Verify no dangling references**

Run: `grep -rn "InAppBrowserPrompt\|setIabBannerVisible\|setIabBannerHeight\|iab-banner-state" src/`
Expected: banner-state helpers may still exist; if `iab-banner-state.svelte` and its `--iab-banner-height` consumer in `MainApplication.svelte` are now unused, remove them too (grep first). If still referenced elsewhere, leave them.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(auth): delete arrival banner + full-screen sheet; escape lives in the compact note now" -- src/routes/+layout.svelte src/lib/shared/auth/components/InAppBrowserPrompt.svelte
```

(If banner-state files were removed in Step 3, add them to this commit's pathspec.)

---

## Task 7: EmailLinkAuth bridge copy

**Files:**
- Modify: `src/lib/shared/auth/components/EmailLinkAuth.svelte`

- [ ] **Step 1: Reframe the hint in the in-app-browser case**

Find the hint string (`No password needed - we'll email you a sign-in link.` per the spec) and, when `detector.isInAppBrowserOrForced(page.url.searchParams)` is true, render:

```
We email you a link. Open it in Safari or the app and you are signed in there.
```

Keep the normal-browser string unchanged. No mechanics change.

- [ ] **Step 2: Commit**

```bash
git add src/lib/shared/auth/components/EmailLinkAuth.svelte
git commit -m "copy(auth): frame magic link as the web-to-browser/app bridge in webviews" -- src/lib/shared/auth/components/EmailLinkAuth.svelte
```

---

## Task 8: Verification — typecheck + manual matrix

- [ ] **Step 1: One machine-wide typecheck**

First confirm no other `svelte-check` is running (see `resource-budget.md`):

```bash
powershell -Command "@(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'svelte-check' }).Count"
```

If `0`, run once and capture:

```bash
npm run check > /tmp/kill-bar-check.log 2>&1
grep -niE "error" /tmp/kill-bar-check.log
```

Fix every error in files this plan touched. Ignore pre-existing errors in unrelated files (see spec §1 / the known-red list). Iterate to green on our files.

- [ ] **Step 2: Unit suite for the two tested units**

```bash
npx vitest run --config tests/config/vitest.config.ts src/lib/shared/auth/services/escape-target.test.ts src/lib/shared/auth/services/in-app-browser-detector.test.ts
```

Expected: all pass.

- [ ] **Step 3: Manual `?forceIAB` matrix** (dev server on :5173, HTTPS)

Ask Austen to load and confirm (browser verification needs his OK per `CLAUDE.md`):
- `https://localhost:5173/create/construct?forceIAB=true` — NO banner on arrival.
- Open the auth modal, tap Google → compact note appears, magic link is above it, no popup.
- `?forceIAB=ios` → note button says "Open in Safari".
- `?forceIAB=android` → "Open in Chrome"; `?forceIAB=android&appLaunched=1` → "Open in the app".
- `?forceIAB=other` → "Open in your browser", guide never mentions Safari.
- A normal browser (no forceIAB) → no escape chrome at all (the false-positive regression guard).

- [ ] **Step 4: Final commit if any check-fixes were made**

```bash
git commit -m "fix(auth): typecheck fixes for kill-the-bar path" -- <paths touched>
```

---

## Task 9: Manual steps handoff (not code — report to Austen)

These block the app-forward half from going live; surface them, do not fake values:

- [ ] Replace `TEAMID` in `static/.well-known/apple-app-site-association` with the real Apple Developer Team ID.
- [ ] Set `PUBLIC_APP_STORE_URL`, `PUBLIC_PLAY_STORE_URL`, and `PUBLIC_APP_LAUNCHED=1` (Cloudflare Pages env) at store launch.
- [ ] Confirm the Android `assetlinks.json` SHA-256 fingerprint matches the published app once it exists.

---

## Self-Review

- **Spec coverage:** §2 Phase A → Tasks 2 (detection), 4/5/6 (note replaces banner), 7 (bridge copy), 1/3 (resolver + flag). §2 Phase B → Tasks 1/3 (resolver + appLaunched, Android intent, iOS scheme). §3 resolver → Task 1. §4 trigger model → Tasks 5/6. §5 iOS escape → Tasks 1 (version gate) + 4 (fire+watch). §6 telemetry → Tasks 4/5 (`escape_attempted`, `escape_result`, `signin_intent`; `get_app_clicked` fires from the app-target button in Task 4's `handleEscape` — add it there). §7 manual → Task 9. Deferred items correctly absent.
- **`get_app_clicked` gap:** add `captureEvent("inapp_get_app_clicked", { platform, app_launched, route })` inside `handleEscape` when `target.isAppTarget` is true (Task 4).
- **Placeholders:** none — all code shown.
- **Type consistency:** `EscapeTarget`/`EscapeMethod`/`resolveEscapeTarget`/`getEscapeTarget`/`getIosMajorVersion` used identically across Tasks 1–5.
