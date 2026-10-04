# ADR: Crossfade Primitive and the Crossfade Boundary

**Date:** 2026-06-30
**Status:** Accepted
**Context loaded:** on demand (not every session)

## Decision

There are two sanctioned crossfade primitives. Every _true crossfade_ of cheap
content uses `src/lib/shared/components/Crossfade.svelte`. Heavy/stateful
content uses `src/lib/shared/components/DualSourceCrossfade.svelte`, the
dual-source no-remount path.
Single enter/exit fades stay plain `transition:fade`. The boundary between these
three is recorded here so future work doesn't re-litigate it.

Enforced routing summary lives in `.claude/rules/crossfade-primitive.md`; this
doc is the rationale.

## Why

Crossfades were repeatedly hand-rolled as two in-flow siblings each with
`transition:fade`. Both stay in normal flow during the transition, so they stack,
take each other's space, and shove neighbors — layout shift across the whole
transition. The grid-stack fix (both layers pinned to one cell) was known and
copied around in feature code, but with no primitive to reach for, each new
crossfade re-derived it and often got it wrong. Austen (2026-06-30): _"this has
already been solved time and time again in our code base."_

## The boundary (the load-bearing decision)

Two independent axes decide where a fading thing belongs. Conflating them is the
mistake that produced both the bug and the over-correction.

### Axis 1 — Is it even a crossfade?

A **true crossfade** has two mutually-exclusive states that swap in the same box
(`{#if a}…{:else}…{/if}` or `{#key}`-driven). A **single enter/exit** fade has no
second state — a modal appears, a toast dismisses, a panel mounts. Single fades
are NOT crossfades. Wrapping one in `<Crossfade>` means inventing a meaningless
`key` and makes the code lie about its intent. They stay plain `transition:fade`.

### Axis 2 — Remount cost (only for true crossfades)

`<Crossfade>` is `{#key}`-based, so it REMOUNTS children on every change.

- **Cheap content** (labels, icons, status words, light panels): remount is free.
  → `<Crossfade>`.
- **Heavy/stateful content** (canvas, large pictograph render, a panel holding
  scroll position / focus / in-progress export): remount drops that state and
  costs a paint. → `<DualSourceCrossfade>`, which keeps two host-prepared
  sources mounted and animates opacity only after the replacement is ready.
  Never `{#key}` the visible source. Hosts retire the outgoing source from the
  primitive's `onsettled` event, not from a timer, so teardown follows the
  compositor's real endpoint even when a frame arrives late.

### Sizing is a primitive option, not a boundary

Similarly sized content (default grid mode), materially different natural
heights (`animateHeight`), and parent-filled layers (`fill` → `absolute; inset:0`)
are primitive options. They do NOT decide the boundary — remount cost does.
`animateHeight` measures the incoming layer and eases the wrapper to it on the
same clock as the fade, in either direction. A parent-filled crossfade of cheap
content is fine on the primitive (`fill`); a parent-filled crossfade of heavy
content is not (regardless of `fill`).

Sequential decision screens use `mode="swap" motion="step"` with `direction={1}`
for forward and `direction={-1}` for back. The primitive sequences the outgoing
and incoming layers so their copy is never readable at the same time, carries a
short directional drift through the shared motion helper, and animates a changed
natural height on the same clock when `animateHeight` is enabled. This is the
canonical wizard-step transition; feature code does not reproduce it.

### Focus follows the swap

A key change often comes from a control inside the leaving layer, such as Play
trading places with the playing controls. The primitive moves focus to the
replacing layer's first control, or to that layer when it has none, on the same
commit that makes the leaving layer inert and before it is `aria-hidden`.
Otherwise the browser drops focus to `<body>` and a keyboard or screen-reader
user starts again from the top of the page. A layer with no controls is an
unnamed box to a screen reader, so a consumer passes `label` for that key and
the layer becomes a named group, as the Construct demo's action slot is during
the start pick ("Choose your start placement"). Consumers that want a specific
target still move focus after `tick()`; that runs later and wins. Controls a
consumer renders outside the keyed region are its own to focus. When such a
control goes away with the key change, as the Construct demo's phone-width play
actions do, the consumer binds the Crossfade and calls `focusShown()` after
`tick()`. It makes the same handoff and returns the element that took focus,
so the consumer can scroll it into view. It looks the shown layer up rather
than trusting a `bind:this` inside the content, because a key that returns to
a layer still fading out resumes that layer instead of remounting it.

## What is on the primitive (migrated 2026-06-30)

| File                                             | Mode              | Note                                                                |
| ------------------------------------------------ | ----------------- | ------------------------------------------------------------------- |
| `landing/SpinnerStatsBar`                        | grid, crossfade   | flex stat sets, real shift bug fixed                                |
| `tool-panel/ToolPanel` sub-tab                   | `fill`, crossfade | heavy but already keyed; gained reduced-motion                      |
| `mandala/MandalaLoader`                          | `fill`            | parent-filled stage, already cycles                                 |
| `generate/GenerateEmptyState`                    | grid, `delay=120` | tuned stagger preserved via `delay`                                 |
| `navigation/profile-settings/PasswordChangeForm` | `animateHeight`   | compact trigger ↔ credential form; symmetric expansion and collapse |

Consolidation tax accepted: bespoke asymmetric in/out durations (e.g. in 260 /
out 180) collapse to one `DURATION.*` token. Differences are imperceptible;
removing micro-timings is the point. The one perceptible tuning (the 120ms
delayed-in stagger) is preserved via the `delay` prop.

## Deliberate carve-outs (NOT migrated)

- `CellRenderer` + `crossfader-state` — specialized bitmap/URL dual-source
  path; it retains its focused image lifecycle and dark-mode coordination.
- `FuseTab`, `CreationWorkspaceArea` — heavy non-keyed view/workspace swaps;
  `{#key}` remount too costly.
- `ButtonPanel` center-zone — absolutely centered against the whole panel (a
  third sizing the primitive does not model) with load-bearing container-query
  CSS on the faded element; migrating shifts the button's center.
- ~30 single enter/exit fades — not crossfades.

## Enforcement

Rule + memory, deliberately NOT an automated lint/grep. A regex cannot reliably
distinguish a true two-sibling crossfade from a single enter/exit fade without
heavy false positives, and a noisy gate is worse than none (cross-ref
`component-test-discipline.md`). The signal is carried by:
`.claude/rules/crossfade-primitive.md`, the `Crossfade.svelte` header doc, and
memory `feedback_crossfade_no_layout_shift`.

## Consequences

- One place to evolve crossfade behavior; new crossfades have an obvious home.
- A future agent reading any `transition:fade` has a rule that tells it whether a
  crossfade is owed.
- The carve-outs are explicit, so "why isn't X on the primitive" is answered here
  rather than re-discovered.
