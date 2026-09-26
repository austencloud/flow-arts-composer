# Install Guide Drill-down

Status: APPROVED by Austen 2026-09-23 ("send it with this design").

## Problem

The /start page's "Add it to your home screen" button opens a text sheet whose
steps are wrong on both platforms.

- **Android.** Chrome's menu item is "Install and create shortcut", not "Add
  to Home screen" or "Install app". Verified on Austen's Z Fold6 on
  2026-09-16; captures are in `docs/install-guide-captures/android-chrome-2026-09-16/`.
  The button also never uses Chrome's native install prompt, even when Chrome
  offers one.
- **iPhone.** The steps describe the Safari layout from before iOS 26. On iOS
  26 and 27, Share sits behind the ⋯ button next to the address bar, and the
  sheet has an "Open as Web App" switch. Source: Apple's iOS 27 guide,
  https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios
- **Picking a platform.** The sheet only shows the detected platform, so
  nobody can switch, for example to read the iPhone steps on a laptop.

## Why the native prompt is missed today

`MobileFullscreenManager` captures `beforeinstallprompt`, but it is only
created lazily. The root layout loads `FullscreenPrompt` inside
`requestIdleCallback`, and that component is the first caller of
`getMobileFullscreenManager()`. Chrome fires `beforeinstallprompt` early in
page load. Any event that fires before the manager exists is lost, so
`canInstallPWA()` can be false even though Chrome offers an install.

## Design

### 1. Capture the prompt at page load

Add a small inline script to `src/app.html`, next to the existing inline
scripts. It listens for `beforeinstallprompt`, calls `preventDefault()`, and
stores the event on `window.__tkaInstallPrompt`. It clears that value on
`appinstalled`.

The `MobileFullscreenManager` constructor adopts `window.__tkaInstallPrompt`
if it is already set. It keeps its own listeners for later events. The CSP
already allows inline scripts.

### 2. The /start button tries the native prompt first

`openInstallGuide()` in `src/routes/(public)/start/+page.svelte`:

- **Prompt available.** When `getMobileFullscreenManager().canInstallPWA()` is
  true, call `promptInstallPWA()`.
  - Accepted: the button becomes a disabled status line reading "Installing.
    Look for FA Composer on your home screen."
  - Dismissed: nothing else happens. We respect the dismissal and do not push
    the sheet.
- **No prompt.** This covers iOS, Firefox, a prompt already used, and a missing
  install criterion. Open the sheet.
- **Already installed.** When `isPWA()` is true, hide the install button,
  because the visitor is already in the app.
- **Analytics.**
  - `start_page_install_opened` gains `method: "native" | "guide"`.
  - A new `start_page_install_prompt_result` event carries
    `{ outcome: "accepted" | "dismissed" }`.

`MobileFullscreenManager.handleInstallRequest()` is unchanged. It is not used
on this path.

### 3. The sheet gets platform pills

`EnhancedPWAInstallGuide.svelte` gets a segmented control directly under the
header, with three options: **iPhone**, **Android**, and **Computer**. The
approved design named iPhone and Android. Computer keeps the existing desktop
steps reachable, because the sheet also opens from the app shell.

- **Default selection.** The pill starts on the detected platform, and the
  detected pill is marked "(this device)".
- **Instruction variant.** Tapping a pill picks the variant with the detected
  browser taken into account:
  - iPhone: `ios-safari` when the detected browser is Safari, or when the
    visitor is not on iOS at all. Otherwise `ios-other`.
  - Android: `android-samsung` when the detected browser is Samsung Internet.
    Otherwise `android-chrome`.
  - Computer: `desktop-chrome`, or the desktop fallback for unsupported
    browsers, which is the existing behavior.
- **URL state.** A pill tap writes `?install=ios|android|desktop` with
  SvelteKit `replaceState`. Opening the sheet reads it, so a manual choice
  survives a reload or HMR. Closing the sheet removes the param.
- **Pill style.** No checkboxes. The pills use the same visual language as
  other segmented controls in the app.

### 4. Corrected steps

These edits go in `src/lib/shared/mobile/config/pwa-install-instructions.ts`.
The copy below is final wording. `<strong>` marks the on-screen labels.

**android-chrome**

1. Tap the <strong>⋮</strong> menu next to the address bar. Image: a crop of
   capture 02.
2. Tap <strong>Install and create shortcut</strong>. Image: a crop of capture
   03.
3. Pick <strong>Install</strong>, not Create shortcut. A shortcut only opens a
   Chrome tab. Image: a crop of capture 04.
4. Tap <strong>Install</strong> to confirm. Chrome finishes in the background.
   Image: a crop of capture 05.
5. Open <strong>FA Composer</strong> from your home screen. No image, because
   the capture shows the old "Composer" label.

**ios-safari**

1. Tap the <strong>Share</strong> button. On iOS 26 and later, tap
   <strong>⋯</strong> next to the address bar first, then
   <strong>Share</strong>.
2. Scroll down and tap <strong>Add to Home Screen</strong>. If it's missing,
   scroll to the bottom, tap <strong>Edit Actions</strong>, and add it.
3. Make sure <strong>Open as Web App</strong> is on.
4. Tap <strong>Add</strong>. FA Composer shows up on your home screen.

**ios-other.** Step 1 is "Open this page in <strong>Safari</strong>". The
remaining steps are the ios-safari steps.

**Unchanged.** The android-samsung, desktop-chrome, and fallback entries stay
as they are, because they are unverified.

The "Native app performance" benefit is removed because it is not true. The
other benefit lines stay.

### 5. Screenshots

- **Android.** Crop captures 02 to 05 to the region that matters: the menu,
  the menu item, the two-row sheet, and the dialog. Export each crop with
  sharp as WebP, about 600px wide, to
  `static/images/install-guides/android-chrome-step{1..4}.webp`.
- **iPhone.** Its entries keep `image: null`. If Austen later drops his own
  captures at `static/images/install-guides/ios-safari-step{n}.webp`, filling
  in each path is a one-line change per step.
- **Where they come from.** Every image is our own capture. We do not reuse
  Apple's or any third party's screenshots or icons.

### 6. Name on the home screen

- In `static/pwa/manifest.webmanifest`, change `short_name` from "Composer" to
  "FA Composer".
- In `src/app.html`, change `apple-mobile-web-app-title` from "Flow Arts
  Composer" to "FA Composer". iOS truncates labels longer than about 12
  characters, and this value pre-fills the name in Add to Home Screen.
- `manifest-launcher.webmanifest` is a separate launcher app and is left
  alone.

## Out of scope

- Verifying Samsung Internet and desktop steps.
- iOS screenshots.
- Changes to `handleInstallRequest`.
- The App Store build.

## Verification

- **Unit tests** in vitest cover three things:
  - The variant mapping for each pill and detected-browser combination.
  - The manager adopting `window.__tkaInstallPrompt`.
  - The accepted, dismissed, and missing-prompt branches of the /start install
    handler, if that handler is extracted.
- **Type gate.** Run `pnpm run check:fast`.
- **Browser check.** In the in-app browser on the worktree dev server, the /start
  success state opens the sheet. The pills switch content, `?install=` round-trips
  through a reload, and each Android step shows its image.
- **On the phone.** Over `adb reverse`, open the worktree dev server at
  `localhost` in Chrome on the Z Fold6, which is a secure context. That origin
  differs from tkaflowarts.com, so the installed production app does not
  suppress the prompt. Tapping the button must open Chrome's "Install app"
  dialog directly.
