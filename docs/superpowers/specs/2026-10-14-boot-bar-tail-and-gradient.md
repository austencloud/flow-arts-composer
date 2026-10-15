# Boot bar, round 3: compositor tail and the original gradient

Date: 2026-10-14. Author: Fable. Implementer: Opus. Commit as
`docs/superpowers/specs/2026-10-14-boot-bar-tail-and-gradient.md`.
Builds on `2026-10-14-boot-bar-self-timing.md` (34fc93df79) and
`2026-10-14-boot-bar-compositor-fill.md` (aa17b1cda8). Everything there
stands except what changes here.

## Austen's decisions (2026-10-14)

1. "Yes, fix it": the last freeze. Round 2 moves the linear 85% of each
   segment on the compositor, but the asymptotic tail past 85% is still
   written by the 80 ms ticker, so a main-thread block there freezes the
   bar (5173 cold: 1359 ms still at 96.7%; task-server dev warm: 983 ms).
2. "Restore the old gradient": with `translateX` the visible slice shows
   the right end of a full-width gradient, so a short fill reads violet
   (left end 138,109,255 at 5% vs 124,125,255 before). He wants the old
   look, where the gradient always spans the visible fill blue to violet.

## Change 1: scaleX instead of translateX

The fill has no border-radius; `.boot-capsule` (`overflow: hidden`,
radius 999px) clips it. So `transform: scaleX(p)` with
`transform-origin: left center` on the full-width fill is pixel-identical
to the round-1 `width: p%` look: the gradient is compressed into the
visible fill and the right edge is straight, as before. It is still
compositor-only. Replace `translateX(-N%)` everywhere (initial CSS
`scaleX(0.05)`, every write, the position reader: matrix `a` is the scale,
the on-screen estimate and its cap, reduced motion, ready glide). Verify
at 8x: at 5% and ~50%, the left-end and right-end colours match round 1's
(124,125,255 / 139,108,255 at 5%, 112,138,255 at 50%) within ±3 per
channel, and the right edge position matches the target.

## Change 2: one compositor animation per segment, tail included

At each accepted milestone k, the move toward the next recorded milestone
becomes a single animation that needs no main-thread help after it starts:

- Keyframes: current on-screen position, then share(k) + 0.85·Δ at the time
  the linear part ends (0.85·d after start, linear), then share(k) + 0.98·Δ
  at the end of the tail, with an ease-out (decelerating) timing on that
  stretch. Tail length = max(3·d, 1500 ms).
- Use the Web Animations API (`fill.animate(keyframes, {duration, fill:
"forwards"})` with per-keyframe `offset` and `easing`), or one CSS
  animation driven by custom properties if that proves cleaner. Do NOT
  chain two transitions via `transitionend` or timers: the chaining would
  itself need the main thread, which is the failure being fixed.
- Keep round 2's frame-start discipline: the animation must not jump to its
  end before the first frame (WAAPI starts pending and resolves at the next
  frame; confirm on a cold boot), and the start position must be read from
  the screen estimate so nothing steps backwards. Cancel the previous
  segment's animation only after committing its current value
  (`commitStyles()` or writing the read value inline) in the same task.
- Past 0.98·Δ the bar holds until the milestone arrives. That hold is
  acceptable; it only occurs when a step runs past 4x its recorded length.
- The 80 ms ticker no longer writes the fill at all. It keeps
  `aria-valuenow`, "Almost there", probe samples (on-screen position), and
  hidden-tab pausing. Remove the ticker's tail writes.
- Ready: the 200 ms glide to scaleX(1) as a WAAPI animation from the
  current position, then the existing `loaded` dismissal.
- Reduced motion: no animations; write the position per milestone and per
  tick as round 2 does for that path.

## Tests

Update `tests/unit/boot-bar-self-timing.test.ts` so the compositor model
understands the new writes (record each `animate()` call's keyframes,
offsets, easings, duration and start time; evaluate on-screen position at
any t from that schedule; stub `Element.prototype.animate` in JSDOM). Add:

- **Blocked tail:** a segment whose milestone arrives at 3x its recorded
  length, with no timers or callbacks able to run from 0.8·d onward until
  the milestone. Assert the modelled position keeps changing (no 600 ms
  unchanged stretch) through the block, stays below share(k+1), never moves
  backwards.
- The round 2 blocked-main-thread replay and all existing cases still pass.
- scaleX mapping: the probe's position and `aria-valuenow` read the scale
  correctly; reduced motion starts at 5% (the identity-matrix bug from round
  2 must stay fixed).

Gates as before: focused Vitest files with `--config
tests/config/vitest.config.ts`, `verify:public-firebase`, `check:fast` (new
errors in touched files only), prettier via `git show` from the primary.

## Browser verification

Same rig as round 2 (DevTools MCP if it connects, otherwise the CDP-over-
WebSocket scratchpad scripts against agent Chrome on 9222; screencast
frames, fill measured as the width of the coloured run). Cases: dev warm
x2 and dev cold on a task-owned Vite server rooted in the worktree; prod
cold fresh context and prod warm on `wrangler pages dev`; then one
read-only cold and one warm run on `https://localhost:5173/create` after
the merge. Acceptance unchanged: no stall over 600 ms warm, 1 s cold, with
the cold dev tail case now required to pass. Report any stall with whether
the renderer itself produced no frames (machine starvation) versus the bar
not moving between produced frames. `getAnimations()` during a tail block
must show the segment animation running. Round 2/3 probes as before
(travel, `/` has no boot screen, reduced motion, direct `/create`, method
previews after dismissal). 8x crops at 5% and ~50% next to round 1's for
the colour check, saved in the scratchpad `handoff-shots/` folder.

Note: `npm run build:fast` on main fails on `/history/draft` (missing id
`#archive-record-home-of-poi`; `handleMissingId` in vite.config.ts only
exempts `/history`). Another task owns that fix. If it is not on main when
you build, patch it locally only to build, then revert; commit nothing
there.

## Worktree and hazards

`E:/worktrees/tka-platform/boot-bar-tail`, branch
`codex/boot-bar-tail-gradient` from main; node_modules by PowerShell
junction, never `pnpm install` inside; explicit-pathspec commits ending
with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; stop your
own Vite/wrangler/node before `npm run wt:finish --
codex/boot-bar-tail-gradient --route /create` from `E:/tka-platform` in
PowerShell; no push, no deploy, never touch 5173, do not touch
`tests/unit/scripts/svelte-compile-gate.test.ts`, no Playwright. Do not
change the capsule markup, copy, travel, or the milestone model.

## Report

Short: files; stall table per case from frames, with starvation noted;
`getAnimations()` evidence in a tail block; colour check numbers and crop
paths; gate lines; deviations; merge SHA.
