# Composer handoff, round 3: the travel must start on frame one

Date: 2026-10-13. Author: Fable. Implementer: Opus. Commit as
`docs/superpowers/specs/2026-10-13-composer-handoff-smooth.md`.
Builds on `docs/superpowers/specs/2026-10-13-composer-handoff-button-origin.md`
(merged 7b082ed521). Everything there stands unless changed here.

## Austen's report (on his dev server, port 5173, Chrome)

"The animation where the button that I click moves to the center of the
screen does not feel right, like there's a stuttering or a main thread taken
up at the beginning of it, making it so that I don't see the beginning of
that animation down to the center." He sees the pill appear part-way or at
the destination, not leaving the button.

## Hypotheses (confirm or refute with evidence before fixing)

H1, most likely. Chrome's auto-generated `::view-transition-group(composer-cta)`
keyframes animate `width` and `height` as well as `transform`. Width and
height cannot run on the compositor, so the group animation is main-thread
driven. In the first 100 to 250 ms after `pagereveal` the main thread
executes SvelteKit's start, the app's entry modules and layout hydration
(on Vite dev, far heavier than prod: round 2's trace showed a 58 ms module
evaluation task at +240 ms on a worktree server; the primary 5173 server
carries more). Those tasks starve the animation's first frames.
Evidence to gather: a DevTools performance trace with screenshots around a
1x click on `https://localhost:5173/` (read-only use of his server is fine;
never restart it). Report: main-thread tasks between `pagereveal` and
+300 ms with their sources; the frame times in that window; which frame
first shows the pill displaced from the button. Also, inside `pagereveal`
during verification, read `document.getAnimations()` and log the keyframe
property names of the `composer-cta` group animation to confirm
width/height are in the keyframes.

H2. The boot screen's own painting is expensive per frame: `#app-loading`
has layered radial gradients and `::before`/`::after` pseudo-elements. Check
whether any of them animate a non-compositable property (background
position, filter, box-shadow) and whether paint time per frame is
significant in the trace.

H3. Something in the arriving document's first paint delays the transition
start itself (the `blocking="render"` expect, fonts, the `#app-loading`
theme script). Compare `tka:handoff:ready` against `pagereveal` and against
the first screenshot frame.

## Fixes, in order of preference (apply what the evidence supports)

F1. Make the travel compositor-only. Override the group animation so only
`transform` (translate and scale) animates, with constant size, following
the documented view-transition performance guidance (research the current
Chrome docs for cross-document groups before writing it; the group's
`from` box is available on the old snapshot only through CSS, so compute it
in `pagereveal` from the recorded `source` rect and the capsule's own rect,
set CSS custom properties, and write the keyframes against them). Then make
the old and new images not distort: `::view-transition-old(composer-cta),
::view-transition-new(composer-cta) { height: 100%; width: auto; }` plus
`object-fit` as needed, checked at 8x in the strips. The pill must still
visibly leave the button's exact box.

F2. Keep the main thread clear during the travel. In `pagereveal`, when a
morph is in flight, expose `window.__tkaHandoffSettled` as the transition's
`finished` promise (resolving on both finish and skip). In the app's boot
path, where the heavy work starts after hydration (find the first
`__tkaLoadProgress` call in `src/routes/+layout.svelte` and what follows it:
DI container, Firebase, MainApplication import), await that promise with a
600 ms cap before starting the heavy phase. Network prefetch of chunks must
not wait; only main-thread execution we control. Confirm with the trace that
the long tasks move out of the travel window, and report the cost to boot
time (should be under 500 ms, and the chunks are in cache by then).
SvelteKit's own start and hydration cannot be delayed; if they alone still
starve the animation after F1, say so with numbers.

F3. If H2 holds, simplify or pre-rasterize the boot surface during the
transition (for example `will-change` on the capsule only, no pseudo-element
animation while `tka-handoff` is active).

Also, approved: the light-surface track. Change
`#app-loading[data-surface="light"] .boot-capsule` track to a darker brand
tint so white 14 px 600 text passes 4.5:1 on the unfilled part (for example
`rgba(63, 80, 190, 0.92)`; verify the ratio against the actual light
background and report it). The fill stays as is.

## Verification

- Trace before and after on `https://localhost:5173/` (read-only) at 1440,
  header `.cta`, 1x. Report frame times in the first 300 ms after
  `pagereveal`, the first frame where the pill has left the button, and the
  main-thread tasks in that window. The after state must show the pill
  displaced on the first or second frame after reveal, with no frame gap
  over 20 ms in the travel window, or report the residual honestly.
- The same once on a production build (`wrangler pages dev`, built on d1
  as round 2 did because the browser needs the output locally).
- 8x strips for header `.cta` 1440 and `.compact-cta` 390 after the fix, to
  the same scratchpad folder as round 2 (`handoff-shots/strip-<case>-r3.png`),
  so distortion from F1 can be judged.
- Round 2's probes: launchpad same-document morph still runs; no stale
  `composer-cta` name after arrival; direct `/create` load unchanged;
  `/` hides `#app-loading`; reduced motion paths; `__tkaHandoff` still
  populated.
- Gates as round 2: the Vitest files that read app.html and the landing
  tests with `--config tests/config/vitest.config.ts`; `verify:public-firebase`
  (on d2 via `pwsh scripts/d2-run.ps1` after committing); prettier on
  committed content via `git show`; then `npm run wt:finish --
codex/handoff-smooth --route /` from `E:/tka-platform` in PowerShell.

## Hazards

- Worktree `E:/worktrees/tka-platform/handoff-smooth`, branch
  `codex/handoff-smooth` from main; node_modules by PowerShell junction;
  never `pnpm install` inside; explicit-pathspec commits; no push, no deploy.
- Never start, stop or restart port 5173; tracing it is read-only.
- Before `wt:finish`, kill every process you started that holds files in the
  worktree (Vite, wrangler, node): round 2's remove failed with "Invalid
  argument" because stopping the shells left the servers alive. Use
  `Get-CimInstance Win32_Process` filtered on the worktree path and
  `Stop-Process` on your own PIDs only.
- Do not touch the dual-label crossfade or any other part of the design.

## Report

Short: what the trace showed (before), what you changed and why, the after
numbers, strip paths, contrast ratio, gate lines, deviations, merge result.
