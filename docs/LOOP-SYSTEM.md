# LOOP Detection System

**Repository status (2026-10-14):** Current execution composition is specified by `LOOPSpec` in `packages/sequence-engine/src/loop/loop-spec.ts` and [LOOP execution ownership](architecture/loop-execution.md). The older flat-detection taxonomy and composition future work below are historical design context; CAP is a separate term.

This document consolidates the LOOP (Linked Orbital Offset Pattern) detection algorithm, pattern types, and taxonomy.

---

## Overview

A **LOOP** is a sequence that:

1. Returns to its starting position (circular)
2. Follows a structured transformation pattern between its halves/quarters

**Important:** The LOOP type is determined by **step data** (positions, motion types, colors), not by the word or letters.

---

## LOOP Types

| Type              | Definition                                                |
| ----------------- | --------------------------------------------------------- |
| **Strict LOOP**   | Single transformation applies uniformly to ALL step pairs |
| **Compound LOOP** | Different transformations at different intervals          |
| **Modular LOOP**  | Multiple distinct patterns at the SAME interval           |
| **Freeform**      | Circular but no recognizable pattern                      |

---

## LOOP Components

| Component      | Icon        | Color   | Description                                        |
| -------------- | ----------- | ------- | -------------------------------------------------- |
| **Rotated**    | rotate      | #36c3ff | Positions rotate 180° (halved) or 90° (quartered)  |
| **Swapped**    | shuffle     | #2ecc71 | Blue and red hands swap roles                      |
| **Reflection** | left-right  | #6F2DA8 | Positions reflect across N-S, E-W, NE-SW, or NW-SE |
| **Mirrored**   | left-right  | #6F2DA8 | Familiar name for N-S reflection                   |
| **Flipped**    | up-down     | #14b8a6 | Familiar name for E-W reflection                   |
| **Inverted**   | yin-yang    | #eb7d00 | Pro ↔ Anti motion types flip                       |
| **Rewound**    | backward    | #ec4899 | Second half plays in reverse                       |
| **Repeated**   | repeat      | #f59e0b | Sequence repeats 2-4x for circularity              |
| **Modular**    | layer-group | #8b5cf6 | Multiple motifs transform independently            |

---

## Transformation Intervals

- **Halved (½)**: Transformation at 180° / midpoint
- **Quartered (¼)**: Transformation at 90° intervals

Components can combine:

- **rotated+swapped**: Positions rotate AND colors swap
- **mirrored+swapped+inverted**: All three transformations

---

## Position Transform Maps

### ROTATE_180

```
n ↔ s
e ↔ w
ne ↔ sw
nw ↔ se
```

### ROTATE_90_CCW

```
n → w → s → e → n
ne → nw → sw → se → ne
```

### REFLECTION_NORTH_SOUTH

```
e ↔ w
ne ↔ nw
se ↔ sw
```

### REFLECTION_EAST_WEST

```
n ↔ s
ne ↔ se
nw ↔ sw
```

### REFLECTION_NORTHEAST_SOUTHWEST

```
n ↔ e
s ↔ w
nw ↔ se
ne and sw stay fixed
```

### REFLECTION_NORTHWEST_SOUTHEAST

```
n ↔ w
s ↔ e
ne ↔ sw
nw and se stay fixed
```

Reflection axis and grid mode are independent. Diamond, Box, and Skewed
sequences can use any of the four axes. Every reflection is its own inverse.

---

## Detection Algorithm

### Step 1: Check Circularity

```
IF last step's end position ≠ start position:
    RETURN "Not circular, not a LOOP"
```

### Step 2: Check Step Count

```
IF step count is odd:
    Cannot be a structured LOOP (halved comparison impossible)

IF step count % 4 ≠ 0:
    Skip quartered detection (only check halved)
```

### Step 3: Halved Detection

For each step pair `(i, i + halfLength)`:

1. **ROTATED**: Are positions rotated 180°?
2. **SWAPPED**: Are colors exchanged (with same positions)?
3. **MIRRORED**: Are positions mirrored left/right?
4. **FLIPPED**: Are positions flipped top/bottom?
5. **INVERTED**: Are motion types inverted?
6. **REPEATED**: Are steps identical?
7. **Compound patterns**: Apply transforms in sequence

### Step 4: Quartered Detection

For sequences divisible by 4, check 90° rotation patterns at each quarter transition.

### Step 5: Mixed-Slice Detection

Components can operate at different slice granularities:

**Rotated(¼) + Swapped(½)** means:

- Rotation happens at 90° per quarter
- Swap happens only at the half boundary

---

## When is Swap "Meaningful"?

**Meaningful when:**

- Hands have DIFFERENT motion types (one pro, one anti)
- The swap exchanges distinct choreographic roles

**Not meaningful when:**

- Both hands have SAME motion type
- Swapping produces identical choreography

**Exception:** For mixed-slice patterns, swap IS meaningful even with same motion types.

---

## Detection Priority

1. Three-component compounds override individuals
2. Two-component compounds override single components
3. Mixed-slice patterns take precedence
4. Quartered patterns can override halved if more specific

---

## Rewound LOOPs

**Rewound is a temporal transformation**, unlike the geometric transformations (rotated, mirrored, swapped). It plays the sequence backwards to complete the circle.

### How Rewound Works

1. Take the original sequence: `[1, 2, 3, 4]`
2. Reverse the steps and swap their start/end positions
3. Reverse rotation directions (CW ↔ CCW)
4. Append to create: `[1, 2, 3, 4, 4', 3', 2', 1']`

### Key Properties

- **Works on ANY sequence** - no position validation needed (unlike rotation-based LOOPs)
- **Always halved** - no interval concept; it inherently doubles the sequence
- **Letters are DERIVED** - reversing E's motions produces K, not E (they are motion inverses)

### Example: CAKE → CAKEKEAC

```
Seed word: CAKE (4 steps)
Rewound:   Each step is reversed
Result:    CAKE + derived letters = CAKEKEAC (8 steps)
```

The derived letters come from analyzing the reversed motion parameters, not from reversing the letter order.

### Rewound Motion Transformation

For each reversed step:

- `startLocation` ← previous step's `endLocation`
- `endLocation` ← source step's `startLocation`
- `rotationDirection`: CW → CCW, CCW → CW
- `startOrientation` ← source's `endOrientation`
- `endOrientation` ← source's `startOrientation`

### Compound: Rewound + Inverted

`rewound_inverted` combines:

- Temporal reversal (play backwards)
- Motion type inversion (pro ↔ anti)

---

## Modular LOOPs

A **modular LOOP** has distinct motifs that transform independently at different intervals.

**Key characteristics:**

1. Multiple motifs (2+ distinct recurring phrases)
2. Independent transformations (each motif has its own rule)
3. Different intervals (one at quarters, another at halves)
4. Overall sequence remains circular

**Example - AAKE:**

- **AA motif**: Alternates rotation CCW/CW every quarter
- **KE motif**: Swaps destination at halfway point

---

## Decision Tree

```
Is it circular? (ends where it starts)
├─ NO → Not a LOOP
└─ YES
   │
   Does the entire sequence follow one transformation?
   ├─ YES → Strict LOOP (rotated, swapped, etc.)
   └─ NO
      │
      Do sections relate with the same transformation?
      ├─ YES → Section LOOP
      └─ NO
         │
         Do distinct motifs transform independently?
         ├─ YES → Modular
         └─ NO → Freeform or Unknown
```

---

## Summary Flowchart

```
┌─────────────────────────────────┐
│ Is sequence circular?           │
└─────────────┬───────────────────┘
              │ No → Not a LOOP
              │ Yes ↓
┌─────────────────────────────────┐
│ Check halved comparisons        │
│ (step i vs step i+half)         │
└─────────────┬───────────────────┘
              ↓
┌─────────────────────────────────┐
│ Step count divisible by 4?      │
└─────────────┬───────────────────┘
              │ No → Use halved results
              │ Yes ↓
┌─────────────────────────────────┐
│ Check quartered patterns        │
│ (90° rotation at quarters)      │
└─────────────┬───────────────────┘
              ↓
┌─────────────────────────────────┐
│ Map components to LOOP type     │
└─────────────────────────────────┘
```

---

## Compositional LOOP Theory

> **Added Feb 2026.** Discovered through analysis of an 8-step LFLFLFLFLFLFLFLFLFL sequence from alpha1.
> The current flat component detection ({MIRRORED, SWAPPED, INVERTED}) loses structural information.
> This section describes the ordered compositional algebra that captures HOW a LOOP is constructed.

### Turn Independence

The LOOP algebra operates on a reduced space of:

- **Grid positions** (where hands are)
- **Motion types** (pro / anti / static / dash / float)
- **Hand identity** (blue / red)

**Turn values and orientations do not affect LOOP classification.** You can set every turn to 0 and the LOOP type is unchanged. The detector already confirms this - none of its checks examine turn counts or orientations.

Every LOOP type has a "canonical zero-turn form" that represents its pure algebraic skeleton. The performed sequence is that skeleton dressed with turn values:

```
Performed Sequence = LOOP Skeleton + Turn Assignment
```

Turn assignment is a separate creative choice layered on top of the algebraic structure.

### Compositional Notation

Instead of flat component bags like `{MIRRORED, SWAPPED, INVERTED}`, express LOOPs as ordered compositions:

- `/` = applied **simultaneously** as one compound operation
- `+` = applied **sequentially** (this pattern, then that transformation on top)

Example: `SWAPPED + MIRRORED/INVERTED`

This reads as a construction recipe:

1. Take a SWAPPED inner pattern (seed doubled via hand-role swap)
2. Apply MIRRORED and INVERTED simultaneously to that block (mirror positions to opposite side + flip pro/anti)

The flat label `{MIRRORED, SWAPPED, INVERTED}` doesn't tell you which transformation came first or how the sequence was built. The compositional notation preserves the construction order.

### Direct Closure and Literal Outer Wrappers

A fixed-point test is not a universal LOOP feasibility test.

For direct reflection, the seed starts at `S` and ends at `R(S)`. Its reflected
copy starts at `R(S)` and ends at `R(R(S)) = S`. The sequence closes because
every reflection is an involution. `S` does not have to lie on the axis.

This supports all cross-grid cases, including:

- Box Gamma, Blue SE and Red SW, reflected across E-W to Blue NE and Red NW.
- Diamond Gamma, Blue E and Red S, reflected across NE-SW to Blue N and Red W.

A fixed point is required only for a literal wrapper: an already-closed block
at `S` is copied through an absolute transform without translating its hand
paths onto the live seam. That wrapper needs `T(S) = S`. It does not prove that
the same component combination is impossible under a direct or
path-transported construction.

### Key Results

1. **Grid mode and reflection axis are independent.** Never infer an axis from
   Diamond, Box, or Skewed mode.
2. **Mirrored and Flipped are axis nicknames.** Mirrored means N-S; Flipped
   means E-W. NE-SW and NW-SE are equally valid reflection axes.
3. **Direct reflection closes by involution.** `S→R(S)`, followed by the
   reflected copy, returns to `S`.
4. **Order and construction matter.** Direct, simultaneous, sequential, and
   literal wrapped-block constructions are not interchangeable.
5. **Flat detection loses information.** Store the reflection axis in the
   LOOPSpec. Do not relabel a diagonal reflection as a rotated legacy mirror.

### Future Work

- Allow users to specify LOOP composition order (e.g., "SWAPPED + MIRRORED/INVERTED") rather than flat type
- Investigate whether every multi-component LOOP has a unique decomposition or allows multiple valid orderings

---

## Version History

- **v2.1** (2026-07-25): Added four axis-independent reflections; corrected direct closure vs literal wrapped-block fixed points; standardized step terminology
- **v2.0** (2026-02-19): Added ordered compositional notation, turn independence, and the original fixed-point analysis later corrected in v2.1
- **v1.1** (2025-12-23): Added "modular" component for multi-motif independent transformations
- **v1.0** (2025-12-15): Initial taxonomy with 7 base components

---

_Consolidated from: LOOP-DETECTION-ALGORITHM.md, LOOP-PATTERN-TYPES.md, LOOP-TAXONOMY.md_
