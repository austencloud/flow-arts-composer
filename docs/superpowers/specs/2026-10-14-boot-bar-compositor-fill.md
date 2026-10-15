# Boot bar, round 2: the fill keeps moving while the main thread is blocked

Date: 2026-10-14. Author: Fable. Implementer: Opus. Commit as
`docs/superpowers/specs/2026-10-14-boot-bar-compositor-fill.md`.
Builds on `docs/superpowers/specs/2026-10-14-boot-bar-self-timing.md`
(merged 34fc93df79). The milestone model, profile, probe, shim, tests and
acceptance numbers all stand. Only the way the fill is moved changes.

## Why

Round 1 measured a 1.3 to 2.3 s main-thread block at the end of every dev
boot (MainApplication's init) and 1.1 to 1.7 s stalls on 5173. The fill is
`#loading-bar-fill.style.width` written by an 80 ms `setInterval`, and width
is a layout property, so neither the interval nor the 500 ms width transition
can advance during a block. Austen chose to fix it.

## The change

1. **Compositor-driven fill.** `.boot-capsule-fill` becomes full width
   (`inset: 0; width: 100%`) and is positioned by `transform: translateX(-N%)`
   where N = 100 - percent, inside the capsule's `overflow: hidden` (confirm
   the track clips; add it if not). Add `will-change: transform` on the fill
   only while the boot screen is alive. Remove the width transition. The
   right end of the fill stays the pill's own rounded cap because the fill is
   never scaled. Verify at 8x that the first-frame look (5%) matches today.
2. **Segment transitions instead of ticks.** On `start` and on every
   accepted milestone k: read the fill's current computed position
   (`getComputedStyle(fill).transform` matrix e), set `transition: none` and
   that exact position, force one reflow, then set
   `transition: transform <0.85·d>ms linear` and the target share(k) + 0.85·Δ
   (Δ = share(next recorded) − share(k), d = the profile's expected segment
   length to the next recorded milestone). The browser runs that transition
   on the compositor, so it continues through a main-thread block. If the
   current position is already past the target, hold position (never
   backwards). If the milestone arrived early, the linear segment from the
   current position simply moves faster; do not add a separate catch-up jump.
3. **The ticker stays for the tail.** Keep the 80 ms interval for: the
   asymptotic creep past 0.85 of a segment (each tick sets a short
   `transition: transform 80ms linear` to the asymptote value), `aria-valuenow`,
   "Almost there", the probe samples, and `document.hidden` pausing. Samples
   record the computed matrix position, not the target, so the probe reports
   what was on screen (`{t, pct, target}`).
4. **Ready.** `transition: transform 200ms` to 0 (100%), then the existing
   `loaded` dismissal. Keep `after-boot-screen.ts`'s contract.
5. **Reduced motion.** `transition: none`; positions are written per tick as
   today.
6. **Monotonic guard** works on the computed position before every write.

## Tests

Extend `tests/unit/boot-bar-self-timing.test.ts`. JSDOM runs no transitions,
so the test models the compositor: for every inline write of
`transition` + `transform` record `(t, from, to, duration)` and compute the
on-screen position at any t from that schedule. Add:

- **Blocked main thread (the case round 1 failed):** replay dev warm 2
  (`start 284, scripts 2725, shell 3028, hydrated 3072, cloud 6196, session
  6260, ready 8378`) against its own profile, with no timers or milestone
  callbacks able to run between 6796 and 9082 ms (advance the fake clock
  without running timers). Assert the modelled position never sits
  unchanged for more than 600 ms before `ready`, never reaches the next
  share before its milestone, and never moves backwards.
- Early milestone: the segment restarts from the current position with a
  faster slope, no backwards write.
- The existing seven cases still pass with the schedule model.

Gates as round 1: the focused Vitest files with `--config
tests/config/vitest.config.ts`, `verify:public-firebase`, `check:fast` (new
errors in touched files only), prettier via `git show`.

## Browser verification

Same captures as round 1 (DevTools MCP, agent Chrome on 9222, initScript
observing `document`), but the stall measurement must not depend on the
main thread: record a performance trace with screenshots for each boot and
read the fill's right edge from the filmstrip frames, especially inside the
block window. Also log `document.getAnimations()` on the fill during the
block from a `setTimeout` placed before it, and read `__tkaBootBar.samples`
after boot.

Cases and acceptance (unchanged): dev warm ×2 on a task-owned Vite server
rooted in the worktree (not 5173; it serves main), no stall over 600 ms;
prod cold fresh context, no stall over 1 s; prod warm, no stall over 600 ms.
Then one read-only run on `https://localhost:5173/create` after the merge
for the record. Round 2/3 probes: capsule travel still frame-perfect from
the header button (trace frames in the first 300 ms), `/` has no boot
screen, reduced motion, direct `/create`, method previews start after
dismissal. 8x zoom of the capsule at 5% and ~50% to confirm the fill's cap
and gradient look identical to round 1.

## Worktree and hazards

`E:/worktrees/tka-platform/boot-bar-compositor`, branch
`codex/boot-bar-compositor-fill` from main; node_modules by PowerShell
junction, never `pnpm install` inside; explicit-pathspec commits ending with
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; kill your own
Vite/wrangler/node before `npm run wt:finish -- codex/boot-bar-compositor-fill
--route /create` from `E:/tka-platform` in PowerShell; no push, no deploy,
never touch 5173, do not touch `tests/unit/scripts/svelte-compile-gate.test.ts`.
Do not change the capsule's markup, copy, travel, or the milestone model.

## Report

Short: files; the stall table per case (longest stall from filmstrip frames,
and whether it fell inside a main-thread block); `getAnimations()` evidence
that the transition was running during the block; the 8x look check; gate
lines; deviations; merge SHA.
