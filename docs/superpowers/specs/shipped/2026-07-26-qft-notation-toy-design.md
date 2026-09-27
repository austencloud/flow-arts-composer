# QfT Notation Toy — design

**Date:** 2026-07-26
**Status:** design, awaiting review
**Sourcing archive:** `docs/reference/archive/qft-notation/README.md`

## What this is

An interactive, generative instrument for Charlie Cushing's QfT poi notation,
built as a test route. You turn three knobs — hand path radius, prop downbeat
ratio, spin direction — and the toy computes the resulting motion, names it
where a name is known, and writes its QfT notation live.

It is built to be shown to its author. Austen knows Charlie personally and
intends to send it to him. There is no commercial or promotional motive.

## Why it exists

Two goals, both real:

1. **A gift.** Charlie's notation is documented by 2011 animated GIFs on a blog
   and a ten-part video series with under 1,200 total views. Seeing it as a
   live instrument, computed rather than traced, should be a pleasure for the
   person who invented it.
2. **Expertise.** Austen is building a sourced catalog of flow-arts notation
   systems (`2026-07-26-notation-catalog-design.md`) and wants genuine
   command of the neighbouring systems, not a summary he half-trusts. Building
   a working model of a notation system is the most reliable way to actually
   understand it.

## Scope boundary — read this before extending

This is a **test route**, not a public page. It does not go on the notation
hub. The catalog decision stands: the public page is a sourced catalog and does
not explain other people's systems.

If this ever becomes public-facing, that requires Charlie's blessing first. His
contact details are published in the source article.
Showing him the private version *is* that conversation; do not skip ahead of it.

**QfT as published is single-plane.** A forum question about horizontal-plane
moves (corkscrew) has sat unanswered since 2014. The toy stays strictly
in-plane and says so on the page. Adding a third dimension would mean inventing
the answer to the exact question his own community asked and he never
published.

## The model

### Home base

Eight positions around a circle, numbered clockwise, 8 at top:

| n | direction |
|---|---|
| 1 | up/right |
| 2 | right |
| 3 | down/right |
| 4 | down |
| 5 | down/left |
| 6 | left |
| 7 | up/left |
| 8 | up |

The same eight-value compass is reused for *direction of travel*, which is what
separates otherwise-identical patterns.

### Inputs

| Knob | Range | Meaning |
|---|---|---|
| `radius` | 0 – 1.5, continuous | hand path radius in units of one prop length |
| `downbeats` | 1 – 8, integer | prop rotations per hand rotation |
| `direction` | inspin / antispin | prop rotation relative to hand |

Radius in prop-lengths is the source's own convention, chosen because it is
the only constant distance in spinning.

### Outputs

Eight increments, each carrying: prop position, prop direction at depart, hand
position, radius, hand position at arrive, prop direction at arrive, prop
position at arrive. These are the columns of the article's tables, which are
the formula `a,b(h(±x±y±z)h'){Class}a',b'` with the variables spelled out.

Prop orientation is measured **from the hand**, not from the body centre. This
is the detail that makes the 4-petal corner values read 5, 7, 1, 3 instead of
something intuitive, and it is the single most common misreading of the system.

### The convention fork

At odd positions (1, 3, 5, 7) the two authors disagree about the prop's
direction of travel:

- **Charlie (default):** direction is parallel to the instantaneous slope — the
  derivative. True only at 8, 2, 4, 6. Elsewhere the cell reads `n`, out of
  resolution.
- **Drex:** direction is always at a right angle to the tether, so nothing is
  ever out of resolution and every cell fills.

Charlie's is the default: it is his system, his gift, and the more distinctive
claim. The toggle carries a one-line statement of each man's position.

This is not a display preference. It changes the computed values, so it lives
in the model, not in the view.

## Naming

### The rule

With the hand making one circle and the prop making **n** circles:

- antispin → **n + 1** petals
- inspin → **n − 1** petals

### Validation against the source

| Move | What the article states | n | Predicted | Match |
|---|---|---|---|---|
| 4-petal inspin | prop travels 5× farther than the hand | 5 | 4 petals | ✓ |
| 4-petal antispin | — | 3 | 4 petals | ✓ |
| Triquetra | 2 prop downbeats per hand downbeat | 2 | 3 petals | ✓ |
| Cateye | direction advances by 1 per increment | 1 | 2 petals | ✓ |
| Extension | hand and prop in lockstep | 1 | circle | ✓ |

Five independent confirmations, two of them stated numerically by the author.

### Degenerate cases

Several documented moves share a radius and a downbeat ratio, so the lookup
needs all three knobs to separate them:

| Move | radius | n | direction |
|---|---|---|---|
| Extension | 1 | 1 | inspin |
| Isolation | 0.5 | 1 | inspin |
| Cateye | 0.5 | 1 | antispin |

Isolation and extension differ only by radius; isolation's table is the
extension's numbers with hand and prop orientations flipped, because the prop
sits opposite the hand on the compass when both trace the same circle.
Isolation and cateye differ only by direction, which is visible in the source
as cateye's orientation advancing by 1 per increment rather than tracking the
hand. Pendulum and static spin are not knob states at all — they are prop
motion with no hand path (radius 0) and are offered as presets rather than
inferred from the knobs.

### Provenance is displayed

Every name carries a visible flag:

- **sourced** — the move is named in the article (static spin, pendulum,
  extension, isolation, cateye, 4-petal inspin, 4-petal antispin, triquetra)
- **derived** — the name follows from the petal rule above, which the article's
  examples confirm but never states as a general rule

A legend explains the distinction in one sentence. This is deliberate: it shows
Charlie exactly where Austen extrapolated, and invites correction. It is the
most useful thing on the page for the conversation it is meant to start.

## Architecture

```
src/lib/shared/notation/qft/
  qft-model.ts        pure. knobs + convention → 8 increments
  qft-naming.ts       pure. knobs → { name, provenance }
  qft-model.test.ts   regenerates the article's tables

src/routes/test/qft-notation/
  +page.svelte                 layout, knobs, legend, plane note
  _components/
    QftStage.svelte            circle, hand path, tether, prop, trail
    QftTable.svelte            live rows, current row lit
    ConventionToggle.svelte    Charlie ⇄ Drex, with the one-liner
```

The model modules are pure functions with no Svelte imports, so the disputed
convention logic is unit-testable without a browser. Components read from the
model and render; they never compute notation values themselves.

### Reuse

Checked, and there is genuinely nothing to reuse. TKA's pictograph renderer is
grid-and-letter based and models a different domain; this is one circle, two
points and a radius. `SegmentedControl` covers the convention toggle and the
direction switch (single-select, exactly one active, per `chip-primitives.md`).
Existing design tokens and the `DURATION.*` scale cover styling and animation.

No checkboxes. No hand-rolled filter chips. Sizes in `rem` so the 4K root ramp
carries them.

## Rendering

- Home base drawn as eight numbered points; the current increment's origin and
  arrival highlighted.
- Hand path as a circle at the current radius.
- Tether as a line from hand to prop head, so the from-the-hand orientation is
  visible rather than asserted.
- A faint trail of the traced shape, which is what makes changing the knobs
  legible.
- Step controls and a play toggle. Reduced-motion collapses animation per the
  existing primitives.

Nothing is traced from the original GIFs. The motion is computed. This is both
better-looking at 4K and the reason no third-party assets are republished.

## Verification

**Model correctness (the real proof).** Unit tests assert that
`qft-model.ts` regenerates all eight of the article's published tables
cell-for-cell, under both conventions where the article prints both. If the
model reproduces the author's own tables exactly, the math is right. Archived
table data lives in the sourcing archive.

**Visual.** Screenshots at all seven required viewports before any completion
claim: 1920×1080, 2560×1440, 3840×2160, 1440×900, 820×1180, 960×412, 375×667.
Per `visual-verification-mandatory.md`, with `--force-device-scale-factor=1`
for the 3840 pass.

**Specific things to look for:** the stage must not stretch a short control row
across the viewport at 4K; the notation table must scroll inside its own
container rather than widening the page at 375; the trail must remain legible
against the animated background.

## Out of scope

- Any public route or notation-hub placement (requires Charlie first)
- Three-dimensional or off-plane motion (unpublished in the source)
- The `{Class}` / socket-syntax layer and the accurate `h(±x±y±z)h'` hand
  method — both exist only in Charlie's videos, neither is in the written
  guide, and neither is modelled here. If Charlie shares them, they become a
  follow-up.
- Transcription of the video series
- Any TKA comparison or "how this relates to the Kinetic Alphabet" framing.
  This is his system presented on its own terms.
