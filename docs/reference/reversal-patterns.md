# Reversal Patterns in TKA

## Overview

A TKA sequence describes one performer's two hands/props, canonically blue/left and red/right. Each prop rotates in a direction. A **reversal** is when a prop flips its rotation direction on a given beat while the hand continues along its path.

A **reversal pattern** defines which hand(s) reverse on which beats. The pattern is applied cyclically: once the pattern completes, it repeats from the beginning for the duration of the sequence.

There are 15 reversal patterns, organized into 4 families. All patterns beyond the Simple family are constructed from a single rule: take a seed pattern, swap R and B to produce its complement, then append the complement to the original. This doubles the period each time.

---

## Notation

Each beat in a reversal pattern uses one of four symbols:

| Symbol | Meaning                                                            |
| ------ | ------------------------------------------------------------------ |
| `-`    | No reversal. Both hands continue their current rotation direction. |
| `R`    | Red reverses. Blue continues.                                      |
| `B`    | Blue reverses. Red continues.                                      |
| `P`    | Pair. Both red and blue reverse simultaneously.                    |

A pattern like `P-P-` means: pair reversal on beat 1, nothing on beat 2, pair reversal on beat 3, nothing on beat 4, then repeat.

---

## The Complement Rule

This is the single construction rule that generates all tiered patterns.

Given a pattern, its **complement** is produced by swapping every `R` with `B` and every `B` with `R`. The symbols `P` and `-` stay unchanged.

To build the next tier: take the current pattern, compute its complement, and append the complement to the end. This doubles the period.

Example:

- Seed: `RBBR`
- Complement: `BRRB`
- Next tier: `RBBRBRRB`

Three families (Solo, Dense Weave, Sparse Weave) each have 3 tiers built this way.

---

## Simple Family (period 1-2)

These patterns have short periods and no tiered construction.

### Continuous

Pattern: `----` (period 1)

No reversals ever. Both hands maintain their rotation direction throughout the sequence.

```
Beat 1: - (no reversal)
... repeats
```

### Book

Pattern: `PPPP` (period 1)

Both hands reverse on every single beat. The name comes from flow arts: "opening and closing the book" describes following a continuous hand path while the prop reverses direction each beat.

```
Beat 1: P (both reverse)
... repeats
```

### Red Book

Pattern: `RRRR` (period 1)

Red reverses on every beat. Blue never reverses.

```
Beat 1: R (red reverses)
... repeats
```

### Blue Book

Pattern: `BBBB` (period 1)

Blue reverses on every beat. Red never reverses.

```
Beat 1: B (blue reverses)
... repeats
```

### Long Book

Pattern: `P-P-` (period 2)

Both hands reverse together, but only on every other beat. Pair reversals are spaced out compared to Book.

```
Beat 1: P (both reverse)
Beat 2: - (no reversal)
... repeats
```

### Alternating

Pattern: `RBRB` (period 2)

Red and blue take turns reversing. They never reverse at the same time, and there is never a beat with no reversal. Red on odd beats, blue on even beats.

```
Beat 1: R (red reverses)
Beat 2: B (blue reverses)
... repeats
```

---

## Solo Family (periods 8, 16, 32)

Solo patterns use only `R` and `B` — no pair beats, no empty beats. Exactly one hand reverses on every beat. Each tier doubles the period using the complement rule.

### Solo 1 (period 8)

The base seed.

Pattern: `RBBRBRRB`

```
Beat 1: R (red reverses)
Beat 2: B (blue reverses)
Beat 3: B (blue reverses)
Beat 4: R (red reverses)
Beat 5: B (blue reverses)
Beat 6: R (red reverses)
Beat 7: R (red reverses)
Beat 8: B (blue reverses)
```

Red reverses on beats 1, 4, 6, 7. Blue reverses on beats 2, 3, 5, 8. Each hand reverses exactly 4 times per cycle.

### Solo 2 (period 16)

Built from Solo 1 + its complement.

```
Solo 1:              R B B R B R R B
Complement (R<->B):  B R R B R B B R
Solo 2:              R B B R B R R B  B R R B R B B R
```

Beat-by-beat:

```
Beat  1: R (red reverses)
Beat  2: B (blue reverses)
Beat  3: B (blue reverses)
Beat  4: R (red reverses)
Beat  5: B (blue reverses)
Beat  6: R (red reverses)
Beat  7: R (red reverses)
Beat  8: B (blue reverses)
Beat  9: B (blue reverses)
Beat 10: R (red reverses)
Beat 11: R (red reverses)
Beat 12: B (blue reverses)
Beat 13: R (red reverses)
Beat 14: B (blue reverses)
Beat 15: B (blue reverses)
Beat 16: R (red reverses)
```

The first 8 beats are Solo 1. The second 8 beats are its mirror: every R becomes B and vice versa.

### Solo 3 (period 32)

Built from Solo 2 + its complement.

```
Solo 2:              R B B R B R R B  B R R B R B B R
Complement (R<->B):  B R R B R B B R  R B B R B R R B
Solo 3:              R B B R B R R B  B R R B R B B R  B R R B R B B R  R B B R B R R B
```

Beat-by-beat:

```
Beat  1: R    Beat  9: B    Beat 17: B    Beat 25: R
Beat  2: B    Beat 10: R    Beat 18: R    Beat 26: B
Beat  3: B    Beat 11: R    Beat 19: R    Beat 27: B
Beat  4: R    Beat 12: B    Beat 20: B    Beat 28: R
Beat  5: B    Beat 13: R    Beat 21: R    Beat 29: B
Beat  6: R    Beat 14: B    Beat 22: B    Beat 30: R
Beat  7: R    Beat 15: B    Beat 23: B    Beat 31: R
Beat  8: B    Beat 16: R    Beat 24: R    Beat 32: B
```

Beats 1-16 are Solo 2. Beats 17-32 are its complement.

---

## Dense Weave Family (periods 8, 16, 32)

Dense Weave patterns alternate between single-hand beats (`R` or `B`) and pair beats (`P`). Every even-numbered position within the seed is a pair beat. This creates a texture where both hands sync up every other beat while trading off solo reversals in between.

### Dense Weave 1 (period 8)

The base seed.

Pattern: `RPBPRPBP`

```
Beat 1: R (red reverses)
Beat 2: P (both reverse)
Beat 3: B (blue reverses)
Beat 4: P (both reverse)
Beat 5: R (red reverses)
Beat 6: P (both reverse)
Beat 7: B (blue reverses)
Beat 8: P (both reverse)
```

Pair beats land on every even position (2, 4, 6, 8). Solo beats alternate red and blue on odd positions.

### Dense Weave 2 (period 16)

Built from Dense Weave 1 + its complement. The complement swaps R and B but leaves P unchanged.

```
Dense Weave 1:       R P B P R P B P
Complement (R<->B):  B P R P B P R P
Dense Weave 2:       R P B P R P B P  B P R P B P R P
```

Beat-by-beat:

```
Beat  1: R (red reverses)       Beat  9: B (blue reverses)
Beat  2: P (both reverse)       Beat 10: P (both reverse)
Beat  3: B (blue reverses)      Beat 11: R (red reverses)
Beat  4: P (both reverse)       Beat 12: P (both reverse)
Beat  5: R (red reverses)       Beat 13: B (blue reverses)
Beat  6: P (both reverse)       Beat 14: P (both reverse)
Beat  7: B (blue reverses)      Beat 15: R (red reverses)
Beat  8: P (both reverse)       Beat 16: P (both reverse)
```

### Dense Weave 3 (period 32)

Built from Dense Weave 2 + its complement.

```
Dense Weave 2:       R P B P R P B P  B P R P B P R P
Complement (R<->B):  B P R P B P R P  R P B P R P B P
Dense Weave 3:       R P B P R P B P  B P R P B P R P  B P R P B P R P  R P B P R P B P
```

Beat-by-beat:

```
Beat  1: R    Beat  9: B    Beat 17: B    Beat 25: R
Beat  2: P    Beat 10: P    Beat 18: P    Beat 26: P
Beat  3: B    Beat 11: R    Beat 19: R    Beat 27: B
Beat  4: P    Beat 12: P    Beat 20: P    Beat 28: P
Beat  5: R    Beat 13: B    Beat 21: B    Beat 29: R
Beat  6: P    Beat 14: P    Beat 22: P    Beat 30: P
Beat  7: B    Beat 15: R    Beat 23: R    Beat 31: B
Beat  8: P    Beat 16: P    Beat 24: P    Beat 32: P
```

---

## Sparse Weave Family (periods 8, 16, 32)

Sparse Weave patterns have pair beats on every 4th position instead of every 2nd. The remaining positions are single-hand beats (`R` or `B`). Less frequent pair synchronization than Dense Weave, with more solo-hand stretches between pair beats.

### Sparse Weave 1 (period 8)

The base seed.

Pattern: `RBRPBRBP`

```
Beat 1: R (red reverses)
Beat 2: B (blue reverses)
Beat 3: R (red reverses)
Beat 4: P (both reverse)
Beat 5: B (blue reverses)
Beat 6: R (red reverses)
Beat 7: B (blue reverses)
Beat 8: P (both reverse)
```

Pair beats land on positions 4 and 8 only. The remaining 6 positions alternate between red and blue solo reversals.

### Sparse Weave 2 (period 16)

Built from Sparse Weave 1 + its complement.

```
Sparse Weave 1:      R B R P B R B P
Complement (R<->B):  B R B P R B R P
Sparse Weave 2:      R B R P B R B P  B R B P R B R P
```

Beat-by-beat:

```
Beat  1: R (red reverses)       Beat  9: B (blue reverses)
Beat  2: B (blue reverses)      Beat 10: R (red reverses)
Beat  3: R (red reverses)       Beat 11: B (blue reverses)
Beat  4: P (both reverse)       Beat 12: P (both reverse)
Beat  5: B (blue reverses)      Beat 13: R (red reverses)
Beat  6: R (red reverses)       Beat 14: B (blue reverses)
Beat  7: B (blue reverses)      Beat 15: R (red reverses)
Beat  8: P (both reverse)       Beat 16: P (both reverse)
```

### Sparse Weave 3 (period 32)

Built from Sparse Weave 2 + its complement.

```
Sparse Weave 2:      R B R P B R B P  B R B P R B R P
Complement (R<->B):  B R B P R B R P  R B R P B R B P
Sparse Weave 3:      R B R P B R B P  B R B P R B R P  B R B P R B R P  R B R P B R B P
```

Beat-by-beat:

```
Beat  1: R    Beat  9: B    Beat 17: B    Beat 25: R
Beat  2: B    Beat 10: R    Beat 18: R    Beat 26: B
Beat  3: R    Beat 11: B    Beat 19: B    Beat 27: R
Beat  4: P    Beat 12: P    Beat 20: P    Beat 28: P
Beat  5: B    Beat 13: R    Beat 21: R    Beat 29: B
Beat  6: R    Beat 14: B    Beat 22: B    Beat 30: R
Beat  7: B    Beat 15: R    Beat 23: R    Beat 31: B
Beat  8: P    Beat 16: P    Beat 24: P    Beat 32: P
```

---

## Compatibility

A reversal pattern works with a sequence when the pattern's period divides evenly into the sequence's beat count. If it doesn't divide evenly, the pattern would restart mid-cycle, which breaks the intended structure.

| Pattern                               | Period | Works with beat counts            |
| ------------------------------------- | ------ | --------------------------------- |
| Continuous                            | 1      | Any                               |
| Book                                  | 1      | Any                               |
| Red Book                              | 1      | Any                               |
| Blue Book                             | 1      | Any                               |
| Long Book                             | 2      | Any even number (2, 4, 6, 8, ...) |
| Alternating                           | 2      | Any even number (2, 4, 6, 8, ...) |
| Solo 1, Dense Weave 1, Sparse Weave 1 | 8      | 8, 16, 24, 32, ...                |
| Solo 2, Dense Weave 2, Sparse Weave 2 | 16     | 16, 32, 48, 64, ...               |
| Solo 3, Dense Weave 3, Sparse Weave 3 | 32     | 32, 64, 96, 128, ...              |

For deck enumeration, each deck specifies a beat count. Only patterns whose period divides that beat count are included in the deck's reversal pattern pool.

---

## LOOP Boundary Parity

A reversal pattern produces a **clean LOOP boundary** (prop returns to its starting rotation direction) if and only if each hand has an **even number of reversals** over the full sequence length. Each reversal toggles the prop's spin direction from its running state — even toggles return to start, odd toggles don't. This is the cumulative (physical) model, not a per-beat data model.

### At native period

All named patterns are LOOP-clean at their native period **except Sparse Weave 1** (5 reversals per hand = odd).

| Pattern            | Blue count     | Red count      | Boundary     |
| ------------------ | -------------- | -------------- | ------------ |
| Continuous         | 0 (even)       | 0 (even)       | Clean        |
| Book               | 4 (even)       | 4 (even)       | Clean        |
| Red/Blue Book      | 0/4 (even)     | 4/0 (even)     | Clean        |
| Long Book          | 2 (even)       | 2 (even)       | Clean        |
| Alternating        | 2 (even)       | 2 (even)       | Clean        |
| Solo 1/2/3         | 4/8/16 (even)  | 4/8/16 (even)  | Clean        |
| Dense Weave 1/2/3  | 6/12/24 (even) | 6/12/24 (even) | Clean        |
| **Sparse Weave 1** | **5 (odd)**    | **5 (odd)**    | **Mismatch** |
| Sparse Weave 2/3   | 10/20 (even)   | 10/20 (even)   | Clean        |

### When tiled to longer sequences

Period-2 patterns (Long Book, Alternating) are clean at even multiples of their period (4, 8, 12...) but dirty at odd multiples (6, 10, 14...). More generally: if a pattern has c reversals per hand over one period, and is tiled k times, the total is k×c. This is even when k is even OR c is even.

### Double application

Applying any reversal pattern twice (2 repetitions of the full cycle) always produces an even count: 2×c is even for any c. This means every reversal pattern, including boundary-dirty ones, becomes LOOP-clean when played in pairs. Triple application preserves original parity. Any even number of repetitions is always clean.

### The 25% invariant

At every step count, exactly 25% of all possible reversal combinations are LOOP-clean. Each hand independently has a 50% chance of even reversal count (half of all subsets of N positions have even cardinality). Two independent 50% events: 0.5 × 0.5 = 0.25.

---

## Summary Table

| #   | Name           | Pattern                            | Period | Family       |
| --- | -------------- | ---------------------------------- | ------ | ------------ |
| 1   | Continuous     | `----`                             | 1      | Simple       |
| 2   | Book           | `PPPP`                             | 1      | Simple       |
| 3   | Red Book       | `RRRR`                             | 1      | Simple       |
| 4   | Blue Book      | `BBBB`                             | 1      | Simple       |
| 5   | Long Book      | `P-P-`                             | 2      | Simple       |
| 6   | Alternating    | `RBRB`                             | 2      | Simple       |
| 7   | Solo 1         | `RBBRBRRB`                         | 8      | Solo         |
| 8   | Solo 2         | `RBBRBRRBBRRBRBBR`                 | 16     | Solo         |
| 9   | Solo 3         | `RBBRBRRBBRRBRBBRBRRBRBBRRBBRBRRB` | 32     | Solo         |
| 10  | Dense Weave 1  | `RPBPRPBP`                         | 8      | Dense Weave  |
| 11  | Dense Weave 2  | `RPBPRPBPBPRPBPRP`                 | 16     | Dense Weave  |
| 12  | Dense Weave 3  | `RPBPRPBPBPRPBPRPBPRPBPRPRPBPRPBP` | 32     | Dense Weave  |
| 13  | Sparse Weave 1 | `RBRPBRBP`                         | 8      | Sparse Weave |
| 14  | Sparse Weave 2 | `RBRPBRBPBRBPRBRP`                 | 16     | Sparse Weave |
| 15  | Sparse Weave 3 | `RBRPBRBPBRBPRBRPBRBPRBRPRBRPBRBP` | 32     | Sparse Weave |
