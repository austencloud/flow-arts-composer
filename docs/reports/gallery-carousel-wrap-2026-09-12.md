# Gallery inline carousel wrap — progress report

Feedback: `uupNJxBpHcZa17cSvJwq` (duplicates `5tmLHHo7LchKwPniz9hI`,
`2zvtSQWeEIJbDSmHLbIY`).

- Branch: `claude/fix-gallery-carousel-wrap-snutx2` (cloud push policy requires a
  `claude/` branch; the requested `codex/opus-gallery-wrap` slug is recorded here
  instead of as a ref).
- Session: `session_015FHEuRbmPaYGWx9PxLgWBx`
- Environment: Claude Code cloud container (Linux). The Windows worktree
  lifecycle in `AGENTS.md` is adapted: this container is an isolated ephemeral
  clone with no dev server and no parallel agents, so the task branch is
  developed in the container checkout and pushed for the local coordinator to
  integrate. No `main` push, no deploy, no feedback/production mutation.

## Status

- [x] Reproduced by code inspection and traced the real carousel owner
- [x] Root cause identified
- [ ] Fix implemented (in progress)
- [ ] Focused tests written and run
- [ ] Browser inspection of the wrap (see "Unresolved risks")

## Where the carousel actually lives

The starting entry point, `InlineAnimationPlayer.svelte`, is **not** the owner of
the gallery card's inline playback. The Browse card play chip
(`ChoreoCardThumbnail/PreviewPlayChip.svelte`) requests
`cardHoverPreview`, which mounts
`src/lib/shared/browse/components/hover-preview/CardHoverPreviewLayer.svelte`.
That layer owns its own `requestAnimationFrame` clock and renders the carousel
rail with the shared
`src/lib/shared/timeline/StepStrip.svelte` ("focus-locked read-ahead carousel").

## Root cause

`CardHoverPreviewLayer` drove the strip with a raw modulo clock:

```js
const step = (currentStep % stepCount) + 1; // 1 .. stepCount+1, never < 1
```

and mounted `StepStrip` with `loop={false}` while leaving
`includeStartPosition` at its default `true`.

Two defects follow, and they are exactly the two reported symptoms:

1. **Instant pop at the boundary.** The strip's active index runs
   `1 … stepCount` and then jumps back to `1`. `StepStrip` treats a decreasing
   active index as "backward scrub or init" (`isBackOrInit`), which sets
   `animateTrack = false` (`.step-track.no-anim`) — the rail hard-cuts back to
   the beginning instead of sliding. With `loop={false}` the virtual render
   window is also clamped to the real cell range, so no wrapped neighbours exist
   to slide into.
2. **Start position dropped from the cycle.** The rail's cells are built by
   `buildNotationCells`, whose index 0 is the Start cell. Because the clock
   never produces a step below `1`, the Start cell renders in the rail but can
   never take focus, and every wrap lands on beat 1 — the start pose is skipped
   in the ordering on every repeat.

Naively flipping `loop={true}` does not fix it: `StepStrip` adds
`displayedCells.length` to its loop offset on each wrap, so a rail that carries
the Start cell (`N + 1` cells) against a clock that only cycles `N` beats drifts
by one cell per repeat — the focus frame would land on the wrong pictograph.

## Fix

See the final section of this file (updated at completion).
