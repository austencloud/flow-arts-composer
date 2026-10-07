---
status: backlog
value: 2
effort: L
remaining: Resolve the open dyad fusion questions with Austen, then plan the pictograph and encoding implementation.
depends_on: 'external: Austen decisions on dyad fusion open questions'
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: blocked
---

# Dyads — Fused Pictographs

**Date:** 2026-05-27
**Status:** Draft
**Related:** [Half-step midpoints spec](./2026-05-27-half-step-midpoints-design.md)

## Summary

Two consecutive beats compressed into one pictograph. An 8-step sequence displays as 4 dyads. Each dyad shows start, beat boundary, and end — the full two-beat journey in a single frame. This is a view-layer feature using the same granularity system as half-steps.

## Motivation

Long sequences are visually dense. An 8-step sequence is 8 pictographs to scan. For experienced practitioners, adjacent beats often form natural pairs — a movement and its resolution, an initiation and its completion. Dyads let the viewer see these pairs as single units, cutting display count in half and revealing the two-beat structure.

## Killed Approach

Mandala-path arrows (computed tip trajectories as arrow shapes spanning two beats) were prototyped and rejected. Dyads use purpose-designed arrow SVGs instead.

## Data Model

### Dyad Fusion

A dyad fuses two adjacent steps:

```typescript
interface DyadMotion {
  startPosition: GridPosition;
  midpoint: GridPosition;           // Beat boundary
  endPosition: GridPosition;
  motionA: MotionData;              // First beat
  motionB: MotionData;              // Second beat
  combinedTurns: number;
  combinedMotionType: string;       // Derived from the pair (see rules below)
}

interface DyadData {
  blue: DyadMotion;
  red: DyadMotion;
  stepIndexA: number;               // Original beat indices
  stepIndexB: number;
}
```

### Visual Encoding (per hand)

Three positions visible in one pictograph:
- **Large dot:** Start position
- **Dashed ring:** Beat boundary (midpoint)
- **Small dot:** End position

### Pairing Rules

- Pairs are sequential: beats (1,2), (3,4), (5,6), etc.
- Odd-length sequences: last beat renders as normal (unpaired singleton)
- Pairing is fixed — no sliding window or user-selected grouping (that's a future feature if needed)

### Combined Motion Type

When two beats fuse, their motion types combine:

| Beat 1 | Beat 2 | Dyad type |
|--------|--------|-----------|
| pro | pro | pro (turns summed) |
| anti | anti | anti (turns summed) |
| pro | anti | mixed (needs specific arrow) |
| anti | pro | mixed (needs specific arrow) |
| dash | dash | dash (positions chain) |
| static | static | static (turns summed) |
| Any other combination | — | mixed |

Mixed-type dyads (different motion types across beats) need their own arrow treatment. These are the cases where Austen's domain expertise and reference images are essential.

## Arrow System

### What Exists

Current arrows cover single-beat motions up to 3 turns. Dyads can produce up to 6 combined turns (3+3) and mixed motion type pairs.

### What's Needed

1. **Same-type dyad arrows:** Pro+Pro, Anti+Anti at combined turn counts (up to 6 turns). May be extensions of existing arrow shapes with additional loops.
2. **Mixed-type dyad arrows:** Pro+Anti, Anti+Pro, and other cross-type combinations. These are the novel cases requiring Austen's arrow designs.
3. **Dash dyad arrows:** Two consecutive dashes produce a three-point path (start → mid → end). Arrow shows the full traversal.

### Arrow Design Workflow

Architecture defines the arrow slot:
- Keyed by: `(startPos, midPos, endPos, motionTypeA, motionTypeB, turnsA, turnsB, directionA, directionB)`
- Renderer looks up the arrow by this compound key
- Fallback: render two separate single-beat arrows if no dyad arrow exists for the combination

Austen provides:
- SVG arrow designs for each dyad category
- Rules for how arrow shape varies across the key space
- Priority order for which dyad types to design first

### Incremental Delivery

Dyad view can ship with fallback rendering (two overlaid single-beat arrows) for any combination that lacks a designed dyad arrow. Designed arrows replace fallbacks as they're created.

## Viewer Integration

### Granularity Toggle (shared with half-steps)

```
Dyad (0.5x) ← Normal (1x) → Half-step (2x)
```

When dyad mode is active:
1. Adjacent beat pairs are fused into DyadData objects
2. One pictograph rendered per pair
3. Three positions shown per hand (start, mid, end)
4. Beat count display shows original count with "(dyad view)" indicator
5. Navigation operates at dyad granularity (each step = 2 original beats)

### Rendering Pipeline

```
SequenceData (unchanged)
  → GranularityAdapter (fuses beat pairs into dyads)
    → DyadPictographData[] (0.5x length)
      → DyadPictographRenderer (extended renderer)
```

DyadPictographRenderer extends the standard renderer to handle:
- Three-position display (start, mid, end markers)
- Dyad arrow lookup and rendering
- Fallback to overlaid single-beat arrows

### No New Sequence Objects

Dyad view is derived on the fly. Same sequence data underneath. Toggle off → back to normal instantly.

## Scope Boundaries

**In scope:**
- Dyad data model and fusion logic
- DyadPictographRenderer (three-position display)
- Arrow slot definition and lookup architecture
- Fallback rendering (overlaid single-beat arrows)
- Viewer granularity toggle (dyad mode)
- Odd-length sequence handling (trailing singleton)

**Out of scope:**
- Actual dyad arrow SVG designs (Austen provides these)
- Mandala-path arrows (killed)
- Half-step mode (separate spec)
- Custom pairing (sliding window, user-selected groups)
- Dyad export or persistence

## Dependencies

- **Arrow designs from Austen:** Dyad arrows are domain knowledge. Architecture can ship with fallback rendering; designed arrows are additive.
- **Shared granularity system:** The GranularityAdapter and viewer toggle are shared infrastructure with the half-step spec. Either spec can be implemented first; the shared pieces benefit both.

## Open Questions (for Austen)

1. When ready: share dyad arrow reference images and design rules
2. Which motion type combinations are most common and should be prioritized for arrow design?
3. Are there dyad combinations that should be prohibited (physically impossible pairings)?
