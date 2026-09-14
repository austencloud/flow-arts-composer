# Android build verification — September 8, 2026

Installed package `com.tkaflowarts.shapeengine`, version 1.0, using wireless
ADB on the connected Samsung SM-F956U, Android user 0. Installation returned
`Success`. The final APK and build logs are preserved outside the worktree in
`E:/tka-platform-media/shape-engine-android-2026-09-08/`.

## Passed

- Standalone Vite production build and Gradle `assembleDebug`.
- Repository Svelte check: zero errors, zero warnings.
- 23 focused tests: shared URL codec, native view restoration and public share
  URLs, reactive renderer settings and persisted fan appearance.
- In-app browser inspection of the actual bundled build: matrix selection,
  ratio selection, timing changes, canvas pause, effects switching, prop
  selection, fan construction, About, and restoration after reload.
- Phone portrait, unfolded Fold dimensions, short landscape, tablet portrait,
  laptop and larger desktop layouts were inspected. The narrowest header
  abbreviates the two mode names; the accessible names remain complete.
- Missing fan build previews and position-glyph arrow were found and bundled.
- Adaptive icon references a unique Shape Engine foreground resource so the
  scaffold's Android-version-specific icon cannot override the selected art.

## Boundaries and remaining device checks

The phone was in active use during verification. Installation is confirmed;
physical-device interaction, folding continuity, native Back dismissal,
system-bar insets and launch appearance still need an uninterrupted device
pass. Browser inspection is not proof of those native behaviors. No perfect
score or exhaustive functionality claim is made.

The shared app currently labels Level 4 pictographs as being in visual
calibration; the animation and quarter-turn controls render, but that existing
readout is not a completed pictograph timeline.

The icon is provisionally option 1. Four alternatives are in `assets/options`;
the user's final choice was pending when this build was packaged.

The host uses local renderer settings and bundled placement tables. Cloud
gallery lookup, account-uploaded poi images, live administrator arrow
overrides, and premium account cosmetics are not part of this standalone
instrument. Pattern generation and rendering reuse the shared implementation.
Website changes appear in the next Android build; this APK has no over-the-air
update service.

An independent source review found the missing glyph asset and native Back
gap. Back now delegates to the shared escape-layer manager and app navigation
owners, minimizing only at the root. Two other audit suspicions were rejected
against installed Capacitor 8 source: SystemBars is built in, and DARK status
bar style means light text on a dark background.
