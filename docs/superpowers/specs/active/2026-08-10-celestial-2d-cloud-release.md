---
status: active
value: null
effort: null
remaining: "Verify published celestial package contents, cloud layer test, and release evidence against current tag before archival."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: verification
---
# Celestial 2D Cloud Release

**Queue evidence (2026-10-07):** The historical release claim needs current package contents and release-evidence verification before archival.

**Original status (historical):** Shipped
**Approved:** 2026-08-10
**Shipped:** 2026-08-10

## Outcome

Celestial's 2D background is a bright animated sky made from cumulus, cirrus, and stratus clouds. The former dark island scene, god rays, pillars, and floating islands are no longer part of the Celestial 2D theme.

This spec supersedes only the Celestial 2D requirements in `docs/superpowers/specs/shipped/2026-05-20-theme-lab-unification-design.md`. The rest of that shipped spec remains in force.

## Root cause

The cloud rewrite was completed locally in `@austencloud/backgrounds`, but its source file was never committed. The package release workflow rebuilt version 0.7.11 from the repository's old committed source, so npm, TKA, and the Android bundle all received the former island scene even though the local package `dist` folder showed the new clouds.

## Ownership decision

Repository searches covered Celestial rendering, cloud sprites, background controllers, Theme Lab controls, stored lab settings, theme palettes, and package release automation.

The implementation extends the existing `@austencloud/backgrounds` Celestial renderer. TKA continues to use the package's `BackgroundController`, the existing Theme Lab shell, and the existing `ChipToggle` control. No second renderer, theme registry, or toggle primitive is introduced.

## Scope

### Shared backgrounds package

- Commit the existing cloud renderer in `packages/backgrounds/src/backgrounds/celestial/services/CelestialBackgroundSystem.ts`.
- Keep tightly sized offscreen cloud sprites and reuse them during animation.
- Update Celestial card colors to match the bright sky.
- Add a focused regression test for the cloud-only layer contract.
- Add an isolated patch changeset for `@austencloud/backgrounds`.
- Publish the release from the pushed package commit and verify the registry tarball.

### TKA integration

- Upgrade `@austencloud/backgrounds` to the published cloud release.
- Replace the obsolete God Rays, Islands, and Pillars Theme Lab controls with Sun Glow, Atmosphere, and Vignette.
- Normalize stored Celestial lab settings so `quality` and `clouds` survive while newly introduced layers default to visible. Obsolete saved keys are ignored.
- Update Celestial theme colors to match the package metadata.
- Add a regression test for the saved-settings migration and the installed package contract.

### Android delivery

- Build the current web app with the production Capacitor environment.
- Sync the native Android project and assemble a fresh debug APK.
- Install the APK over wireless ADB, cold-launch it, and verify the Celestial cloud scene on the connected phone.

## Release order

1. Test and commit the shared-package renderer, metadata, regression test, and changeset.
2. Push the package and version commits. If repository automation cannot publish, publish from a clean checkout pinned to the version commit.
3. Confirm the new package version, integrity, and tarball contents on npm.
4. Upgrade TKA and update its controls, migration, palette, and regression coverage.
5. Run focused tests, type checking, production build, native sync, and Android assembly.
6. Install and inspect the app on the connected phone.
7. Commit and push only the TKA files owned by this change.

## Verification

- The package unit test proves the initialized layer set is `clouds`, `sunGlow`, `atmosphere`, and `vignette`, with no legacy island layers.
- The published npm tarball contains cloud sprite generation and no legacy island drawing path.
- TKA tests prove old saved settings normalize to the current layer contract.
- The focused TKA contract suite and the production build pass. The repository-wide fast checker may remain red only for independently verified, unrelated in-flight work.
- The Android WebView loads without Celestial renderer errors.
- An on-device screenshot shows the bright cloud sky instead of the old dark island scene.

## Risks and controls

- SVG cloud sprites load asynchronously. Initialization completes sprite creation before the system starts rendering, and failures retain the existing explicit console error path.
- Old local storage can contain removed layer keys. Normalization copies only supported keys and supplies current defaults.
- Both repositories contain unrelated work. Commits and staging stay limited to the named files, including partial staging where a shared file has unrelated edits.
- Android WebView support can differ from desktop Chromium. The final APK is installed and checked on the connected device rather than relying on desktop output alone.

## Release evidence

- Shared package commits `320af7e` and `32795ef` are pushed to `main`.
- `@austencloud/backgrounds@0.7.12` is published with SHA-1 `f41f89b0638fdf1fc9225c4e253c71c7f8cdc8d6`.
- The package suite passed 108 tests across 20 files. The TKA regression suite passed all 4 focused tests.
- The production build passed, and the native release-surface guard verified 881 JavaScript assets with all 3 forbidden markers absent.
- The final Android bundle contains the cloud renderer and no `drawIslands` path. Gradle assembled the debug APK successfully.
- Wireless ADB installed the final APK on the connected Galaxy Z Fold 6. A cold-launch log contained no Celestial renderer, fatal, or uncaught errors.
- The on-device capture shows the bright blue layered cloud scene with no islands, pillars, or old god rays.
