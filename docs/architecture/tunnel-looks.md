# Tunnel Primitives — the kaleidoscope symmetry engine

Status: accepted (2026-07-06). Supersedes the named-look catalog (same date,
morning) and, before it, the `fold` + `mirror` config. Spec:
`docs/superpowers/specs/shipped/2026-07-06-tunnel-primitives-design.md`.

## Context

The tunnel art view overlays transformed copies of the open sequence to form a
kaleidoscope. It has been modeled three ways:

1. **`fold` + `mirror`** — a rotational count plus a boolean that DOUBLED the
   whole stack into the dihedral group. Mirror was a multiplier, not a peer, so
   `fold 2 + mirror` silently drew 8 props when 4 were expected.
2. **Named looks** — a curated catalog (Radial, Mirror, Flip, Counter, Echo,
   Cross, Mandala) plus two Radial-only sub-knobs. This fixed the prop-count
   legibility but was redundant (`Radial + mirror + 4` == Mandala; Cross ==
   `fold 2 + reflect`) and re-introduced a hidden sub-toggle. It also ceilinged
   the real goal.
3. **Primitives (this ADR)** — the tunnel is a _study rig_: run any sequence
   through the gamut, see its mandala every representative way. That wants an open
   combination space, not a fixed list.

Austen (2026-07-06): _"reduce all of the variables and parameters down to their
most reasonably sized minimum primitive so that you can construct them through the
combination of multiple without much domain knowledge."_

## Decision

Model the tunnel as a **closed primitive vocabulary**. The always-drawn base plus
a set of copies _generated_ from an orthogonal `TunnelConfig`. No named looks.

```ts
// tunnel-config.ts
interface TunnelConfig {
  fold: 1 | 2 | 4 | 8; // rotational arms (cyclic order)
  mirror: boolean; // reflect across vertical axis
  flip: boolean; // reflect across horizontal axis (N↔S)
  invert: boolean; // alternate arms motion-invert (PRO↔ANTI)
  echo: boolean; // alternate arms time-reverse
  staggerSteps: number; // arm k shows the sequence offset by k×this (0 = off)
  speed: boolean; // alternate arms traverse at ½× / 2×
}
```

### Two kinds of primitive

**Symmetry generators** — `fold`, `mirror`, `flip` — grow the copy SET by group
closure. Spatial; baked once at build via `sequence-transforms.ts`. Image count =
`fold × (mirror?2:1) × (flip?2:1)`. Grid = 8 points (45° steps), so 2/4/8-fold are
representable; 3/6-fold are not.

**Per-copy modulators** — `invert`, `echo`, `stagger`, `speed` — add NO copies;
they make arms differ from each other (a uniform modulator is a no-op — invert the
whole ring and it's the same ring). Distributed so adjacent arms contrast:

- `invert` / `echo` are **baked** — they append `invert` / `rewind` to alternate
  arms (odd arm index).
- `stagger` / `speed` are **sample-time** — a per-copy playhead shift
  (`beat' = beat × speed + offset`, wrapped) so a staggered arm shows a different
  moment (a canon) and a sped arm overlays a second tempo. Tweaking them never
  re-bakes the transforms.

`generateCopyOps(cfg)` returns the baked op-chains (depends on the generators +
baked modulators only). `copyModulators(cfg)` returns the sample-time
`{ staggerSteps, speed }` per copy, aligned index-for-index. `buildTunnelLayers`
bakes the former; the sampler (`sampleTunnelProps(seq, step, ease?, offset?,
speed?)`) applies the latter. **No new transform math** — pure composition over
the transforms that already exist.

## Prop-count budget

Modulators are free (no new copies); only `fold`/`mirror`/`flip` grow the count.

- **Live dock:** hard ceiling `MAX_IMAGES = 16` (32 props). Enabling a generator
  that would exceed it walks `fold` down (`clampConfig`); the live prop-count
  readout makes the clamp visible — no silent lie. Reduced motion drops the
  ceiling to `MAX_IMAGES_RM = 4`. `heavyLoad` warns at ≥16 props.
- **Playground (`/test/tunnel-looks`):** NO cap — it studies the full gamut
  (incl. 64-prop monsters). The separation is deliberate.

## UI

The Tunnel section is the primitive controls, all top-level peers (no named
looks): a **Fold** `SegmentedControl` `[1·2·4·8]`, a wrapping row of
**Mirror / Flip / Invert / Echo / Speed** `FilterChipBase` toggle chips (per
[chip-primitives.md](../../.claude/rules/chip-primitives.md)), a compact **Stagger** − N + stepper, the **Grid** icon
toggle, and a live prop-count readout. No checkboxes; 44px touch floor.

## Consequences

- **Prop count is legible + open.** Every mandala is a config point; the count is
  `imageCount × 2`, shown live. No hidden doubling.
- **Fine-grained rebuild.** The controller holds `fold`/`mirror`/`flip`/`invert`/
  `echo` as individual `$state`, so the bake effect reads only those — Stagger and
  Speed changes recompute at sample time without re-running transforms.
- **Persistence + migration.** `tunnel-view-state.ts` stores the config and
  migrates every legacy shape (named looks, split radial looks, pre-looks
  `fold`/`mirror`) → `TunnelConfig`.
- **Second consumer updated.** `PropUnlockCelebration.svelte` builds a pure
  rotational config (`{ fold, mirror: false }`) for the prop-collection reveal.

## Rejected

- **Named looks as presets.** Austen wants _away_ from the named vocabulary; the
  playground covers discoverability.
- **Modulators that add copies.** Would explode the count and double-count the
  symmetry. They transform existing arms instead.
- **A figure Spin / Phase tuner** (earlier iteration) — it offset each prop's
  `centerPathAngle` (its angle on the 8-point grid), teleporting props off their
  grid points. Any "spin the whole thing" must rotate the rendered output (CSS
  transform), never per-prop grid angles. Stagger is the sanctioned per-arm
  temporal offset; it lives purely in the step domain.

## Files

- `tunnel-config.ts` — `TunnelConfig`, `CopyOp`, `generateCopyOps`,
  `copyModulators`, `generateCopies`, `imageCount`/`propCount`, `clampConfig`,
  `configKey`, RM budgets.
- `tunnel-layer-builder.ts` — `buildTunnelLayers(base, cfg)` + op dispatch.
- `tunnel-prop-sampling.ts` — shared sampler with `offset` + `speed`.
- `tunnel-view-controller.svelte.ts` — config `$state`, setters, clamp, `configKey`.
- `tunnel-view-state.ts` — persistence + legacy migration.
- `ArtSettingsPanel.svelte` — the primitive controls.
- `routes/test/tunnel-looks/` — the primitive sweep gallery.

## Related

- [never-hand-roll.md](../../.claude/rules/never-hand-roll.md) (reuses `sequence-transforms.ts`), [chip-primitives.md](../../.claude/rules/chip-primitives.md),
  [no-checkboxes.md](../../.claude/rules/no-checkboxes.md), [no-layout-shift.md](../../.claude/rules/no-layout-shift.md), [effects-earn-their-slot.md](../../.claude/rules/effects-earn-their-slot.md),
  [visualization-routing.md](../../.claude/rules/visualization-routing.md), `crossfade-primitive.md`, `sequence-viewer-shell.md`.
