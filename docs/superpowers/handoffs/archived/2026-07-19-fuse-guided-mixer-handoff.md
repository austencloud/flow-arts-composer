> Archived 2026-10-14: Matching scope is recorded in `docs/superpowers/specs/shipped/2026-07-19-fuse-guided-mixer-design.md`.

# Fuse Guided Mixer: Handoff

- **Date:** 2026-07-19
- **From:** Codex
- **To:** Fable
- **Branch:** `main`
- **Design spec:** [2026-07-19-fuse-guided-mixer-design.md](./2026-07-19-fuse-guided-mixer-design.md)
- **Design commit:** `78e7bcbae570e1df752aebce1a00d2b5e2611c7e`

## Mission

Implement the Fuse tab as the guided two-input mixer in the linked design. The target experience has visible Blue and Red source cards, one large combined preview before navigation, persistent instructions, explicit readiness or error status, and a `Fuse and open` action. The implementation also needs to remove the current async races, exact-length fallback, global Space interception, white-on-orange contrast failure, and heavy source-canvas remounting without changing the pure fusion algorithm or the shared sequence viewer.

## Done: verified

- Audited the current Fuse source from root through layout, panel, animation preview, state, shuffle pool, fusion service, viewer navigation, and Create shell ownership.
- Audited existing shared options before specifying new components: `TransportControls`, `BpmQuickPopover`, `HelpButton`, `Drawer`, `CreatePanelDrawer`, `ChoreoCard`, `PanelButton`, `ActionButton`, `getSequenceDisplayName`, and `simplifyRepeatedWord`.
- Wrote the implementation-ready design at commit `78e7bcbae570e1df752aebce1a00d2b5e2611c7e`.
- Verified the current fusion baseline on 2026-07-19:
  - `pnpm exec vitest run --config tests/config/vitest.config.ts src/lib/features/fuse/services/__tests__/fused-word-derivation.test.ts tests/unit/SequenceFuser.test.ts`
  - Result: 2 test files passed, 9 tests passed, duration 1.33 seconds.
- Verified current Fuse lint on 2026-07-19:
  - `pnpm exec eslint src/lib/features/fuse`
  - Result: exit 0, no findings.
- Verified current Fuse component styles on 2026-07-19:
  - `pnpm exec stylelint "src/lib/features/fuse/**/*.svelte"`
  - Result: exit 0, no findings.
- Checked the new design document with `git diff --check` and a targeted AI-writing pattern scan. No findings.
- Confirmed the checkout was on `main` before the design commit. Only the two handoff artifacts are Codex-owned work from this task.

## Believed done: unverified

- The layout model is based on direct source inspection and current accessibility or browser guidance, but it has not been rendered as a Fable implementation yet.
- The wide, medium, narrow, short-landscape, 320 CSS pixel, 400 percent zoom, light-theme, dark-theme, and reduced-motion states still need browser proof after implementation.
- The combined-preview text alternative may need small wording changes after inspecting the real accessible tree and final display names.
- Extending `ActionButton` is the best fit found in the repository, but Fable must confirm all existing consumers remain visually unchanged after the new preset and props land.
- The design calls for blocking incomplete letter derivation. This is intentional because the current source documents partial derived words reaching the save path, but the completed flow still needs an end-to-end viewer assertion.

## In flight

- No Fuse implementation code is in flight from Codex.
- The checkout remains on `main`.
- The shared worktree already contains many modified and untracked files from other sessions, including auth, landing, launcher, hook, Android, and static asset work. Do not clean, reset, stage, or commit those files.
- Port 5173 belongs to Austen's HTTPS development server. Do not start, stop, restart, or kill it. Reuse `https://localhost:5173` for read-only checks or run a separate server on 5174 when implementation isolation requires it.
- Interactive Chrome DevTools actions require Austen's explicit permission in the current conversation. Read-only snapshots are allowed only when the user asks to evaluate the page.

## Loose ends, ranked

### 1. Pair state and async correctness

Start with the unit tests in the design, then centralize requested or applied length, both hydrated sources, preview identity, request generations, history, readiness, and Fuse re-entry in `createFuseState`. Remove the silent all-length fallback. Commit a length change atomically and reject stale completions.

### 2. Stable combined preview

Harden `FuseAnimationPreview` with generation and destruction guards. Render one combined output canvas, keep it mounted across ordinary changes, and remove the two live source animations and heavy keyed Crossfades.

### 3. Guided responsive shell

Build the persistent header, source cards, output stage, and shared detail drawer from the listed primitives. Use the mobile-first container grid and native Length select. Preserve DOM order across every layout.

### 4. Action and error contract

Add the scoped Fuse preset and accessibility props to `ActionButton`. Keep the main action focusable with `aria-disabled`, connect its visible reason with `aria-describedby`, lock re-entry, and block viewer navigation when derivation throws or remains partial.

### 5. Proof

Add Fuse to the screenshot device configuration, run the scoped automated checks, then obtain permission for interactive Chrome verification. Capture evidence for keyboard flow, focus return, reflow, zoom, contrast, reduced motion, async races, one live canvas, and viewer input identity.

## Decisions

- Austen asked for the deepest possible layout, Chrome, accessibility, and guidance review, then requested an implementation spec to pass to Fable.
- The final page model is two inputs feeding one visible output. Equal live source panels were rejected because they hide the result and dilute the interaction hierarchy.
- Wide layout uses stacked inputs on the left and the combined output on the right. Medium uses two sources above the output. Narrow uses one column and defers full notation to a shared bottom drawer.
- Length is a native select. Seven custom radio or segmented choices do not reflow well and require keyboard behavior the current control does not supply.
- No numeric progress stepper. Blue and Red can be chosen in either order.
- No automatic tour. Persistent copy and an always-available Help drawer teach the workflow without blocking it.
- One combined animation is enough. Source identity comes from text, notation, and pool position.
- The final action says `Fuse and open`, uses dark text on orange, remains focusable while unavailable, and explains why through visible status.
- Exact-length empty data remains empty. It never falls back to another length.
- Final fusion does not open when letter derivation throws or leaves any step unlettered.
- Global Space handling is removed. Playback uses native controls.
- New files are limited to Fuse composition components. Shared control behavior stays in shared primitives.

## Gotchas

- `FuseLayout.svelte` currently owns both source snapshots and viewer navigation. Moving only the visuals without moving pair readiness will preserve the race conditions.
- `fuse-shuffle-pool.svelte.ts` starts full-data hydration without awaiting it and does not invalidate earlier requests. Metadata identity can therefore get ahead of fusable data.
- Both pools currently react to length independently, so a rapid change can show mixed lengths.
- The existing empty fallback masks a missing exact-length pool as valid data.
- The current global Space listener calls `preventDefault()` for the whole window whenever no drawer is open. It can hijack native controls and must be deleted, not narrowed.
- `FuseAnimationPreview.svelte` can receive a newer sequence before an older initialization finishes. Generation checks are required even if the loader cache is fast locally.
- The current breakpoint is measured in JavaScript and mounts different action branches. CSS container queries must replace that branch so focus and popover state survive resizing.
- Do not use `Crossfade` around animation or notation canvases. It duplicates heavy children during transitions.
- The current Fuse gradient fails normal-text contrast with white. Use the spec's dark foreground and verify every computed stop.
- `StandardWorkspaceLayout.svelte` already hides the separate workspace pane for Fuse. Do not add another shell or change other Create tabs to make room.
- Do not wire the dormant full-screen Fuse tab intro back into the page.
- The repo is shared with live sessions. Use exact pathspecs for every commit and never stage broad directories.
- Fable should read the project `orient`, `code-style`, `styling`, `state-management`, `testing`, `error-boundaries`, and `monolith` skills before implementation, plus the relevant `.claude/rules` named in `AGENTS.md`.
