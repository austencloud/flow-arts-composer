# The 0:1 Ratio Problem: Naming Float-Float Motions

**Date:** 2026-03-26
**Status:** RESOLVED 2026-04-18 — see [ADR 003](../../../adr/003-level-1-base-float-classification.md)
**Author:** Austen Cloud + Claude (theory session)

---

> **Resolution (2026-04-18):** Approach 5 (Notional Direction Convention) was adopted after a bug-driven deliberation forced the question. The rule: every float carries its Level 1 base type (`prefloatMotionType`) and the letter is classified from base types, never from current display types. Double-float, single-float, and all edge cases are handled uniformly. The label never changes when a hand floats. PADS (Pro-Anti-Dash-Static priority order, defined in the Level 2 Guide *Glyphs / PADS* section) makes the prefloat state readable from the card: for pro/anti hybrids the pro motion occupies the high slot, so `R(fl, 0)` unambiguously means "float applied to the pro motion, zero turns on anti."
>
> This document is preserved as the deliberation record that led to the decision. For the canonical rule, invariants, and implementation sites, see **[ADR 003: Level-1-Base Float Classification](../../../adr/003-level-1-base-float-classification.md)**.

---

## Problem Statement

TKA letters within each hand-path group are determined by rotation direction:

| Letter role | Blue rotation | Red rotation |
|-------------|---------------|--------------|
| Pure-same (A, D, G, ...) | pro | pro |
| Pure-opposite (B, E, H, ...) | anti | anti |
| Hybrid (C, F, I, ...) | pro | anti |

When one hand floats (zero rotation) and the other rotates, the rotating hand's direction still determines the letter. A pro shift + a float shift is still "pro-based," so it falls under the A-like letter.

The problem: when BOTH hands float, there is no rotation direction to read. The property that distinguishes A from B from C has been removed from the system.

This is the **1:0 VTG hand:prop rotation ratio**: each hand completes one cycle while its prop makes zero rotations.

---

## Why This Matters

Float-float isn't just a theoretical curiosity. It represents a real physical movement: both props traveling through space (shifting, dashing) with no spin. A spinner holding two staves and moving them along the grid without rotating either one. The movement exists. The question is what to call it.

The issue is structural, not cosmetic. TKA's entire letter system rests on the thesis/antithesis/synthesis triad (pro-pro / anti-anti / pro-anti). Float-float sits outside that triad. It's not a degenerate form of any one member -- it's the absence of the axis that creates all three.

---

## Approach 1: Context-Dependent Naming

**Method:** Look at the surrounding beats in a sequence to determine continuity. If the beat before was pro-based (A-like) and the beat after is pro-based, classify the float-float beat as A-like with rotation removed.

**Precedent:** Music theory does something similar. An enharmonic note (C# vs Db) is named by its harmonic context, not its absolute pitch. The "same" sound gets a different name depending on the key.

**Pros:**
- Mathematically defensible. The float-float beat preserves the sequence's narrative thread.
- No new symbols needed. Existing letters absorb the edge case.
- Consistent with how musicians, not just theorists, think about degenerate cases.

**Cons:**
- Breaks self-containment. A single pictograph in isolation cannot be named. You need context.
- Ambiguous at sequence boundaries. What if the float-float beat is the first or last beat? There's no context to inherit from.
- Multiple valid interpretations. A float-float between a pro-based beat and an anti-based beat could go either way. Which neighbor wins?
- Complicates the data model. Every other letter is determined by its own properties. This one requires a sequence-level pass.

**Verdict:** Clean in theory, messy in practice. TKA pictographs are designed to be self-describing. Requiring context to name a beat is a deep architectural compromise.

---

## Approach 2: Assign Float-Float to C (the Hybrid Slot)

**Method:** Since A-float (pro+float) and B-float (anti+float) are spoken for, give float-float to the remaining slot: C (hybrid).

**Mapping:**
- A-variant: pro + float
- B-variant: anti + float
- C-variant: float + float

**Pros:**
- Every letter in the triad gets exactly one float variant. Clean partition.
- No context needed. The beat is self-describing.
- Simple rule: "if both float, it's the hybrid letter."

**Cons:**
- Semantic mismatch. C means "one pro, one anti" -- a mixture of two active directions. Float-float has zero active directions. Calling it a "hybrid" of nothing is a stretch.
- The STUV problem. Quarter-same has 4 letters (S, T, U, V) because of the leader/follower asymmetry at gamma positions. If both hands float in a gamma shift, which of U or V does it map to? The leader/follower distinction that justifies U vs V is defined by which motion type leads. With both floating, there is no leading motion type. The same ambiguity that exists at the triad level reappears inside the STUV group.
- Arbitrary assignment. There's no mathematical reason float-float belongs to C rather than A or B. The choice is conventional, not structural.

**Verdict:** Works for the simple triad groups (ABC, DEF, GHI, JKL, MNO) but breaks down at STUV, which is exactly where TKA's most subtle structural reasoning lives.

---

## Approach 3: A New Symbol

**Method:** Float-float gets its own letter or modifier that sits outside the A/B/C triad entirely.

**Possible notations:**
- A dedicated symbol (e.g., a new Greek letter, or a circle-like glyph representing "null rotation")
- A modifier on the hand-path letter: A with a ring (A&#x030A;), or A-null (A&#x2205;)
- A subscript or superscript indicator

**Pros:**
- Honest. Float-float IS different from A, B, and C. Giving it its own name acknowledges this rather than forcing it into a category it doesn't belong to.
- Eliminates the STUV problem entirely. You don't need to choose between U and V because float-float has its own home.
- Self-describing. No context needed.

**Cons:**
- Expands the alphabet. Every hand-path group now has 4 (or 5 for STUV) members instead of 3 (or 4). This is a real cost to learnability.
- The symbol needs to work in the word system. Can you spell words with it? Does it compose with bridges? Does the LOOP system handle it?
- Design debt. The pictograph renderer, the card system, the font, the MCP tools -- all need to accommodate a new symbol.
- Possibly premature. If float-float barely appears in real sequences, the engineering cost may not be justified.

**Verdict:** The cleanest theoretical answer. The practical question is whether the movement occurs often enough to earn its own symbol.

---

## Approach 4: Float-Float as a Type 6 Variant

**Method:** Recognize that float-float shares a key property with Type 6 (static) letters: no rotation. Static letters (alpha, beta, gamma, etc.) have no hand movement AND no rotation. Float-float has hand movement but no rotation. This could be modeled as a "kinetic static" -- a Type 6-adjacent concept.

**Possible framing:**
- Type 6 = static hands, static props (the true null)
- Float-float = moving hands, static props (kinetic null)

**Pros:**
- Groups directionless motions together. All "no rotation" states live in one conceptual neighborhood.
- Avoids expanding the A/B/C triad. The triad stays pure (rotation-direction-based), and directionless motions are handled separately.
- Consistent with the existing treatment of static. Static already breaks the direction axis (you can't have a pro or anti static). Float-float breaks it the same way.

**Cons:**
- Type 6 letters are defined by hand-path family (static = no hand movement), not rotation. Mixing rotation-based classification into the type system muddies a clean separation.
- Float-float has a hand path (shift, dash). Type 6 does not. They're structurally different on every axis except rotation.

**Verdict:** Interesting parallel but probably a false friend. The shared property (no rotation) is real, but the mechanisms are different enough that grouping them together creates more confusion than clarity.

---

## The Algebraic Perspective

The rotation-direction axis in TKA forms a structure that looks like this for each hand:

```
{ pro, anti, float }
```

Where float is the **absorbing element** for the direction property: direction(float) = undefined.

When combining two hands, the direction pair determines the letter:

```
(pro, pro)   -> A-like
(anti, anti) -> B-like
(pro, anti)  -> C-like
(pro, float) -> A-like  (float inherits from the active hand)
(anti, float)-> B-like  (float inherits from the active hand)
(float, float) -> ???
```

The single-float cases work because one hand still carries direction information. Float acts as a "transparent" element -- it lets the other hand's direction show through.

Float-float is the case where both hands are transparent. There's nothing to show through. In algebraic terms, it's like multiplying by zero on both sides. The operation that normally produces a value (A, B, or C) returns... nothing.

This is formally a **kernel element**. The direction-classification function maps (rotation_blue, rotation_red) -> {A, B, C}. Float-float lives in the kernel of this function -- it maps to nowhere.

Group theory offers a standard answer for kernel elements: they form their own equivalence class. In plain terms: float-float is not A, not B, not C. It's the identity of a different structure.

The question is whether TKA needs to name that identity or can leave it implicit.

---

## Relationship to Static

Static and float-float share the property of having no rotation direction. But they're structurally different:

| Property | Static (Type 6) | Float-float |
|----------|-----------------|-------------|
| Hand movement | None | Yes (shift or dash) |
| Prop rotation | None | None |
| Grid position change | No | Yes |
| Direction axis | Undefined | Undefined |
| Letter determination | By position only (alpha, beta, gamma, etc.) | Undetermined |

Static solved its naming problem by abandoning the direction axis entirely and using position as the classifier. Alpha, beta, gamma, etc. are named by WHERE the hands are, not by HOW the props rotate.

Float-float could potentially follow the same strategy: name by the hand-path geometry (which grid points, which motion family) rather than by rotation direction. But this would mean float-float letters don't live in the same namespace as A-V. They'd be a parallel system.

---

## Practical Frequency Question

Before choosing an approach, it's worth asking: how often does float-float actually appear?

Float is a Level 3 concept (0.5 turns equivalent, introduced alongside half-turns). At Level 1 (0 turns), all motions are effectively float anyway -- but they're classified by their "notional" direction (what direction they WOULD rotate if turns were added). This is why Level 1 has A, B, C letters despite having 0 turns.

The "notional direction" convention means that at Level 1, float-float technically doesn't exist as a distinct state. Every 0-turn motion is either notionally-pro or notionally-anti. Float as a DISTINCT state (as opposed to "0 turns of pro" or "0 turns of anti") only emerges at Level 3.

At Level 3, both hands independently choosing float from the pool is a valid combination. The TurnAllocator already allows it:

```
Level 3 pool: [0, 0.5, 1, 1.5, 2, 2.5, 3, "fl"]
```

Both hands drawing "fl" = float-float. With 8 values in the pool and independent selection, this happens 1/64 of the time (~1.6% of beats). Rare but not negligible in long sequences.

---

## Recommended Path Forward

### The Core Decision

There are really two questions, not one:

**Question 1: Does 0:1 belong in the deck system?**

Yes. It represents a real, physically executable movement. The TurnAllocator already generates it. Excluding it from the deck system would leave a gap between what the software can generate and what it can name.

**Question 2: How should it be named?**

This requires a design decision from Austen. The options, ranked by theoretical cleanliness:

1. **New symbol (Approach 3)** -- the algebraically honest answer. Float-float is not A, B, or C. Name it accordingly. Cost: alphabet expansion, engineering work across the stack.

2. **C-slot assignment (Approach 2)** -- the pragmatic answer. Works for 6 of 7 groups, breaks at STUV. Could work if the STUV case is handled by a special rule (e.g., "float-float at gamma = U by convention").

3. **Context-dependent (Approach 1)** -- the musical answer. Elegant for sequences, impossible for isolated pictographs. Could work if TKA accepts that some beats need context to name.

### Open Questions for Austen

1. **Is self-containment negotiable?** If a pictograph MUST be nameable in isolation, Approach 1 is out. If sequence context is acceptable, it's the most graceful option.

2. **How much does float-float actually appear in authored (not random) sequences?** If experienced spinners rarely use it, a simple convention ("float-float defaults to the hybrid slot") might suffice. If it's a real compositional tool, it deserves a real name.

3. **Is there precedent in VTG?** The VTG V1 document and Noel Yee's subsequent work may have addressed what happens when both props float. The VTG app (by Michael Pike and Noel Yee) implements animations for various ratio combinations -- checking whether it handles 0:1 could resolve this.

4. **Does the "notional direction" convention extend to float?** At Level 1, 0-turn motions carry notional direction. Could float-float carry a "notional" direction inherited from the motion family it belongs to? (e.g., "this is a float-float that lives in the pro-pro family, so it's notionally A.") This would be a formalization of Approach 1 without requiring sequence context.

### A Novel Idea: The Notional Direction Convention

There may be a fifth approach hiding in the Level 1 precedent.

At Level 1, every motion has 0 turns. There is no actual rotation. But TKA still assigns pro/anti/hybrid labels based on the NOTIONAL direction -- the direction the motion "would" rotate if turns were added. This is not arbitrary. It comes from the motion's geometric relationship to the hand path: pro = rotation aligned with hand travel, anti = rotation opposed.

Float, by definition, is "a shift with no active input." But the geometric relationship between the hand's travel direction and the prop's orientation is still defined. A float that would become pro if you added turns is geometrically different from a float that would become anti.

Under this reading, float-float isn't directionless. It's **bi-potential** -- it could become any of A, B, or C depending on how you add turns. But the geometric configuration at the moment of the float still has a structure.

If this structure is always readable (i.e., you can always determine whether a float "leans" pro or anti from the hand path geometry), then float-float IS classifiable without context. The classification comes from the geometry, not the rotation.

This needs investigation. The question is whether, given two hands both floating along specific grid paths, the geometric relationship between their travel directions and prop orientations uniquely determines a direction category. If yes, float-float dissolves as a problem. If no, we're back to the four approaches above.

---

## Summary Table

| Approach | Self-contained? | STUV-safe? | Algebraically clean? | Engineering cost |
|----------|----------------|------------|---------------------|-----------------|
| Context-dependent | No | N/A | Yes | Medium (sequence-level pass) |
| C-slot assignment | Yes | No | No | Low |
| New symbol | Yes | Yes | Yes | High |
| Type 6 variant | Yes | Yes | No | Medium |
| Notional direction | Yes (if geometry works) | Yes | Yes | Low (if geometry works) |

The notional direction approach is the most promising if it can be validated. It preserves self-containment, requires no new symbols, and is consistent with existing Level 1 conventions. The validation question: can you always read a direction from the geometry of a float?
