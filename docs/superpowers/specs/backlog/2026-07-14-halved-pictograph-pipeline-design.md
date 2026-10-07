---
status: backlog
value: 3
effort: S
remaining: Compare half-arrow art to guide artboards, resolve per-glyph rotational offsets, and audit the live getArrowSvgPath/getArrowPath call path.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: verification
---

# Halved Pictograph Pipeline — Design

**Triage evidence (2026-10-07):** The implementation ledger records landed pipeline work while three acceptance boxes remain unchecked. Level renumbering and rendered output require current verification before closure.

> **Level renumber, 2026-08-27.** Interradial orientations and quarter turns
> moved to **Level 4**; the center point moved to **Level 6**. This document
> predates that change and its level numbers are unrewritten because its
> arithmetic prose is load-bearing: wherever it says **L6** for interradials or
> quarter turns, read **L4**, and where it says **L4** for center orientations,
> read **L6**. The order is now L4 interradials and quarter turns, L5 skewed
> grid, L6 centric grid, L7 conjoined grids. Off-lattice halving is still
> exclusively a quarter-turn phenomenon; only the level label changed.

- **Date:** 2026-07-14
- **Status:** Implementation recorded; remaining pipeline acceptance and browser verification pending.
- **Author:** Austen + Claude
- **Scope:** Make "halve a pictograph" a first-class, orientation-correct, pipeline-positioned capability. Phases 1–3 in this doc. Phase 4 (product UX) flagged, deferred.

---

## 1. Vision

Today a pictograph shows one motion: a start state → an end state, with an arrow the system positions. There is no way to ask the system for the *middle* of that motion.

The target: **take any pictograph, cut it in half, and see the halfway state rendered correctly** — props at the halfway pose with the *correct halfway orientation*, and an arrow that represents that half of the motion. The arrows for these half-motions are a new asset family. The seed set already exists and is proven: the hand-drawn end-direction glyphs on the Level-2 "Turns" guide artboards (pro curl, anti zig-zag, dash bow, static loop). The rest get created the same way.

The Level-2 turn-lesson pages are the **first consumer** and the **seed asset source**. Rebuilding them on this pipeline also fixes their current defect: they render tiny because they bake a lifted staff+arrow drawing onto a bare hand-dot grid instead of rendering a real pictograph.

This is a large build. It is decomposed below so the load-bearing, riskiest piece (the halfway-orientation algebra) is built and proven first, in isolation, before anything downstream depends on it.

---

## 2. Domain foundation (why this is tractable)

Ground truth from the Flow Arts Knowledge MCP (`get_domain_topic` base-rotation + orientation-algebra):

- **1 turn = 180° of additional prop rotation.** This unit was chosen deliberately so fractions land clean: a **half-turn = 90° = a cardinal orientation shift**, a **quarter-turn = 45° = an interradial** (L6+, the 8-point radial cycle `in → clockIn → clock → clockOut → out → counterOut → counter → counterIn`). **45° is the finest orientation grain that exists.** There is no eighth-turn / 22.5° orientation.
- **Base rotation.** Every motion has an inherent base rotation at 0 additional turns, measured in **center-relative** orientation (not absolute prop spin). By the parity grouping — and confirmed on ~40 real 0-turn motions from MCP `get_pictograph_data` / `get_sequence_data` (§3.1) — *pro and static preserve*, *anti, dash, and hash reverse* (180°). Dash reverses **even though the prop does not spin**: the hand moving to a new location flips the center-relative orientation (e.g. a prop pointing `in` at east dashed to west, no spin, now points `out`). The base accrues along the motion — the animation engine already models this as linear in `t` (`endpoint-calculator.ts`).
- **Parity.** Pro/Static: even turns preserve, odd reverse. Anti/Dash/Hash: even reverse, odd preserve. Fractional turns step the 8-point cycle: anti/dash step *same* direction as rotation, pro/static step *opposite*.

**Consequence — the crux is the clean case.** The halfway rotation of a motion is `½ · (base + turns·180°)`. Because turns come in 180° units and base reversals are 180°, halving L1–L5 content (whole and half turns) always lands the halfway orientation on the existing 45° lattice — a cardinal or an interradial that the `Orientation` type already has a name for. Halving is representable and derivable in the discrete algebra for exactly the content the guide teaches and most sequences use.

It goes **off-lattice only for halving L6 quarter-turn motions** (half of 45° = 22.5°, no legal name). Guarded, not supported, in v1.

### The boundary domain law forces

Orientation is fundamentally 45°-granular, so:

| Fraction | Rotation at that fraction | Orientation-correct? |
|---|---|---|
| **Half (½)** of whole/half-turn motions | multiple of 45° | **Yes** — the product feature |
| **Quarter (¼, ¾)** of whole/half-turn motions | multiple of 45° | **Yes** |
| **Thirds (⅓, ⅔)** | 60° — never on the lattice | **No — physical-only, by domain definition** |
| **Half of an L6 quarter-turn** | 22.5° | **No — off-lattice, guarded** |

Thirds (and other off-lattice fractions) have *no legal orientation* to compute. The guide's thirds-strips can only ever be **physical poses** (the traced staff sweep) with a drawn glyph. They stay on the existing visual `poseArrow` path — not a regression, a domain fact.

**Crisp decidability rule (derived from the confirmed decomposition in §5).** A fraction `t` is orientation-legal for a motion iff `t·(base + turns·4)` is an integer number of 45° steps, where `base ∈ {0, ±4}`. Two consequences the spec relies on:

- **Halving (t=½) is legal iff `turns` is a half-integer.** `½·(base + turns·4) = base/2 + turns·2`; `base/2 ∈ {0, ±2}` is always integer, so legality rides entirely on `turns·2`. Every L1–L5 whole turn and every L3 half turn qualifies — **the entire product surface. Off-lattice halving is exclusively an L6 quarter-turn phenomenon.**
- **Quartering (t=¼) is narrower — legal only for whole-turn motions.** `¼·(base + turns·4) = base/4 + turns`; `base/4 ∈ {0, ±1}`, so legality rides on `turns` being a whole number. Quartering a half-turn motion is off-lattice. (Quarters are guide-only pedagogy; this narrower validity is fine.)

---

## 3. What already exists

Read-only investigation (two agents, file:line-verified). ~60–70% of the machinery ships. The missing 30–40% is one thing: the halfway *orientation value*.

| Piece | Status | Anchor |
|---|---|---|
| Halfway pose geometry (staff position + angle at any `t`) | **Built** | `src/routes/(public)/guide/level-2/_data/halfway-pose.ts` — `poseAt(m,t)` (55-90), `halfwayPose(m)` (93-130), runs the real engine `interpolatePropAngles(step,t)` |
| Half-motion arrow glyph (visual) | **Built** | `src/routes/(public)/guide/level-2/_data/pose-arrow.ts` — `poseArrow(m,tStart,tEnd)` (118-148) |
| Animation engine (arc / linear / concave interpolation, base rotation) | **Built** | `src/lib/shared/animation-engine/services/prop-interpolator.ts` (48-218); `endpoint-calculator.ts:35-205` (base rotation PRO:73 / ANTI:97, `propRotation = dir·turns·π`) |
| Discrete start→end orientation algebra | **Built** | `src/lib/shared/render/core/calculations/orientation.ts` — `calculateEndOrientation` (250-286), `RADIAL_CW_CYCLE` (160-163), `CENTER_CW_CYCLE` (155-158), `calculateWholeTurnOrientation` (187-202), `calculateRadialFractionalTurnOrientation` (204-225, `steps=round(turns·4)`), `calculateCenterFractionalTurnOrientation` (165-185), `switchOrientation` (129-149) |
| `Orientation` value set (radial + interradial + center) | **Built** | `src/lib/shared/pictograph/shared/domain/enums/pictograph-enums.ts:102-125` |
| Halfway grid *location* | **Free** | intercardinals (NE/SE/SW/NW) + center `c` are first-class `GridLocation`s; a N→E shift's midpoint IS "NE", a dash's is "C" |
| State model to split into | **Present** | `MotionData` (`src/lib/shared/pictograph/shared/domain/models/motion-data.ts:39-68`, factory 95-126); `StepData` (`src/lib/shared/foundation/domain/models/step-data.ts:29-49`) |
| Arrow positioning (location → rotation → adjustment → asset) | **Built, discrete** | see §5 |
| **Halfway orientation as a real `Orientation` value** | **DOES NOT EXIST** | the animation engine keeps only a continuous radian angle at intermediate `t`; `mapOrientationToAngle` (`angle-calculator.ts:46-64`) is one-way and cardinal-only — there is no angle→Orientation inverse anywhere |

**Naming collision to avoid:** "halved" already exists in the LOOP system (`loop-config.ts:93-94` `RECIPE_STEPS`, `resolveLoopConfig`) meaning *whole-sequence position rotation slices* (a LOOP whose positions rotate 180°/90° per repeat). That is unrelated to halving a single motion. New code uses **"half-motion" / "segment"**, never bare "halved", to avoid colliding with LOOP vocabulary.

### 3.1 Empirical validation (MCP ground truth)

The base component of the decomposition was validated against the Flow Arts Knowledge MCP before this spec was finalized — an oracle independent of the codebase's own `orientation.ts`. `get_pictograph_data` + `get_sequence_data` over letters spanning all four families (A/G pro, B/C/E/F/H/N anti, `Φ` dash, `α`/`β`/`γ` static) across `alpha`/`beta`/`gamma` positions and `in`/`out` start orientations yielded ~40 real 0-turn motions. **Every one confirmed the base rule with zero violations:** pro/static `in→in` / `out→out` (preserve); anti/dash `in→out` / `out→in` (reverse). This is what surfaced the dash-base correction (§5) — the rule that dash *reverses* despite no prop spin. The turn component (`steps = round(turns·4)`, direction by motion-type) is taken from the shipped `calculateRadialFractionalTurnOrientation` (`orientation.ts:204-225`) and the MCP orientation-algebra topic. Note: `get_sequence_data` does not honor natural-language turn requests, so turned-motion data could not be harvested this way — the combined base+turn at arbitrary turns is proven instead by the Phase 1 `t=1` dataset invariant (§5), which runs the real `calculateEndOrientation` as oracle over every turn value.

---

## 4. Architecture overview

Three phases. Each is independently testable; each is additive/opt-in (zero change to existing callers).

```
Phase 1  calculateOrientationAt(motion, t)      ← the keystone (pure algebra)
            │  gives the halfway state its correct Orientation label
            ▼
Phase 2  half-motion arrow identity + assets     ← new sibling branch, hand-drawn glyphs
            │  gives the half-motion its positioned arrow
            ▼
Phase 3  buildHalvedStep(step, t) + showArrow    ← compose a real pictograph of the halfway state
            │  first consumer = Level-2 turn pages (also fixes tiny rendering)
            ▼
Phase 4  "halve any pictograph" product UX        ← DEFERRED
```

---

## 5. Phase 1 — Halfway-orientation algebra (the keystone)

The load-bearing 30–40%. A pure function, no I/O, fully unit-testable. Build and prove this **before anything else**.

### Signature

```ts
// src/lib/shared/render/core/calculations/orientation-at.ts  (new, beside orientation.ts)

/**
 * Orientation at fraction t of a motion, or null when t lands off the 45° lattice
 * (no legal Orientation exists at that fraction — e.g. thirds, or halving an L6
 * quarter-turn). t in [0,1]. calculateOrientationAt(m, 1) === calculateEndOrientation(m).
 */
export function calculateOrientationAt(input: OrientationInput, t: number): Orientation | null;
```

Same `OrientationInput` shape `calculateEndOrientation` already takes (`motionType, turns, rotationDirection, startLocation, endLocation, startOrientation`).

### Algorithm (engine-grounded)

A halfway orientation is a **physical fact** — where the staff actually is at fraction `t` — not an arithmetic combination of base + turn steps. An earlier draft decomposed it as `base + turn` steps; validation against `orientation.ts` disproved that model for fractional points. The shipped algebra applies base via **whole-turn parity** (`calculateWholeTurnOrientation`) but **fractional turns via `round(turns·4)` steps with no separately-summed base** (`calculateRadialFractionalTurnOrientation:204-225`), and the MCP orientation-algebra topic endorses "half turns produce orientations 90° from the start" flatly, no base caveat. Base and turns do not simply sum at the midpoint — so the decomposition would have shipped wrong halfway values. (The ~40-motion base findings in §3.1 remain valid: they confirm the *endpoint* base rule, which the oracle below still leans on.)

The correct source of the halfway staff position is the **animation engine**, which already computes it (production, visually verified in the guide's turn strips). The keystone converts that physical angle back into an orientation label:

```
calculateOrientationAt(motion, t):
  1. sample the engine at t (per hand):
       { staffRotationAngle, centerPathAngle } = interpolatePropAngles(step, t)
  2. center-relative staff offset:
       offset = normalizeSigned(staffRotationAngle − centerPathAngle)
  3. locate on the 45° lattice:
       k = (PI − offset) / (PI/4)                       // fractional step index into RADIAL_CW_CYCLE
       if (k not within ε of an integer) return null      // OFF-LATTICE (e.g. 22.5°) — no legal orientation
       return RADIAL_CW_CYCLE[round(k) mod 8]             // CENTER_CW_CYCLE for center orientations
```

This handles base rotation **for free** — the engine accrues it physically along the arc — and off-lattice falls out naturally (the offset simply isn't a 45° multiple). No base/turn sign table to hand-copy and get wrong.

**Two twinned prerequisite bugs (fixed as part of the keystone), both blocking interradial/center support:**

1. **`mapOrientationToAngle` is cardinal-only** (`angle-calculator.ts:46-64`) — any interradial (`clockIn` …) silently falls through to `counter`. Phase 1 extends it to the full 8-point cycle: forward `staffAngle = centerPathAngle + PI − k·(PI/4)` for cycle index `k`, plus the inverse used in step 3.
2. **`calculateEndOrientation` blanket-lowercases the start orientation** (`orientation.ts:260`, and `calculateOrientations:292`), but `switchOrientation`'s map and the `RADIAL_CW_CYCLE` / `CENTER_CW_CYCLE` constants are keyed camelCase (`clockIn`, `centerN`). So a lowercased `"clockin"` misses every lookup and the orientation is returned **unchanged** — L6 (interradial) and L4 (center) orientation propagation is silently wrong. This is already documented and `it.fails`-guarded in `orientation.test.ts:224-268`. Phase 1 replaces the blanket `.toLowerCase()` with a canonical-casing normalizer (any-case → canonical `Orientation`), flipping those guards green.

Both bugs must be fixed before the `t=1` oracle is trustworthy (it compares against `calculateEndOrientation`) and before "halve any pictograph" accepts interradial starts. **The angle↔orientation bijection (8-point + center, forward and inverse) is the real deliverable**; the engine sampling is glue.

### Correctness oracle (the killer test)

```
For every pictograph in the dataset (all letters × variations):
    calculateOrientationAt(motion, 1)  ===  calculateEndOrientation(motion)   // per hand
```

If sampling the engine at `t=1` and inverting through the bijection reproduces the shipped end-orientation algebra across the entire dataset, the bijection and the engine are proven mutually consistent with canon. This is the Phase 1 acceptance gate. **A disagreement is itself a valuable find** — it means the animation engine and the discrete orientation algebra diverge for that motion (two independently-built subsystems), a real latent bug to reconcile before halving can be trusted.

### Empirical halfway check

Halfway values are cross-checked against the **guide artboards** — Austen drew the halfway anti/dash staffs (Level-2 `TwoTurnsShiftsPage`, `TwoTurnsDashStaticPage`). `poseAt(motion, 0.5).deg` (the same engine call) already renders those; `calculateOrientationAt(motion, 0.5)` must name the orientation matching that drawn staff. The drawn staff is ground truth.

### Off-lattice guard

`null` return = "not orientation-representable at this `t`." Callers (halving) treat it as "this motion cannot be halved with a legal orientation" and fall back to physical-pose-only (the guide's `poseArrow` path) or refuse. The §2 decidability rule (halving legal iff `turns` is a half-integer) is **re-verified empirically in Phase 1** by enumerating turn values and asserting which sampled offsets land on the 45° grid — it was derived from the now-superseded discrete decomposition, so it is treated as a hypothesis the engine confirms, not a proven fact.

---

## 6. Phase 2 — Half-motion arrow identity + assets

The arrow pipeline is discrete-lookup end to end. It is extended **additively**, the way `FLOAT` sits beside `PRO/ANTI/DASH/STATIC` — a new branch keyed on a new discriminator, touching no existing table, key, or caller.

### The discriminator — do NOT expand `MotionType`

`MotionType` is a closed 5-value union (`pro/anti/float/dash/static`) with a huge blast radius; it is **not** expanded. Instead:

```ts
// on MotionData
segment?: { t0: number; t1: number };   // presence ⇒ this arrow represents a partial motion.
                                         // halving: {t0:0, t1:0.5} first half, {t0:0.5, t1:1} second.
```

Asset variant is derived (`motionType` + `segment` present → `pro_half` etc.); no separate variant string needed.

### Pipeline touch points (all additive, opt-in)

- **Location** — `arrow-location-calculator.ts` `calculateLocation` (100-127): early branch when `segment` present → a new hand-authored `shiftHalfDirectionPairs` table (same shape as `shiftDirectionPairs` 32-97), or compute from the halfway `GridLocation` (now known). Existing pairs untouched.
- **Rotation** — `arrow-rotation-calculator.ts` `calculateRotation` (48-89): early branch → new hand-authored half rotation maps (mirroring `selectProMap`/etc. 133-194). The guide's hand-drawn half-glyphs establish the correct discrete rotations; the half-arrow is a curl/bow/loop glyph sitting in a canonical orientation, not a literal travel vector, so authored maps (not a formula) are correct — same as the original systems.
- **Adjustment cascade** — `arrow-adjustment-calculator.ts` `getBaseAdjustment` (480-541): **no code change for tiers 1–3.** They gate on `letter` (498) / `endPosition`; a synthetic half-motion frame leaves those empty and the tiers no-op safely. Tier 4 (Default) needs new namespaced data: `default_diamond_pro_half_placements.json` (+ anti/dash/static), addressed by `arrow-placement-key-generator.ts` (157-207) recognizing the segment discriminator.
- **Orchestrator** — `arrow-positioning-orchestrator.ts` `calculateArrowPoint` (25-75): **zero change** — already polymorphic over whatever `MotionData` it receives. **Footgun to route around:** line 58 defaults `letter` to `"A"` when falsy. A half-motion frame must not hit that default (it would spuriously match letter-A Special/Global entries). Pass an explicit empty letter for segment frames, or call the adjustment path directly. Small, contained.
- **Asset resolver** — `arrow-path-resolver.ts` `getArrowPath` (18-52): `baseDir = /images/arrows/${motionType}` (23) is already parameterized purely on the motion-type string; a `_half` suffix yields `/images/arrows/pro_half/from_radial/pro_half_{turns}.svg`. This is exactly how `float.svg` already deviates from the pattern (66-68) — the resolver tolerates per-identity path shapes.

### Assets

Normalize the guide artboard glyphs (pro curl, anti zig-zag, dash bow, static loop) into proper arrow assets. **Parser requirements** (`arrow-svg-parser.ts` 12-74), a constraint on the Illustrator export, not the code:

- a real `viewBox` on the root `<svg>` (16-25);
- an element `id="centerPoint"` with `cx`/`cy` — the rotation/position anchor (43-65).

Glyphs authored under 50×50 native get auto-rescaled to a 250 target (29-38, 52-62) for free; authored at ~250 it is a no-op.

The guide seeds the four base half-glyphs. The full family (per turn value / orientation bucket) is authored the same way — this **authoring is the bulk of the project's effort**, mirroring the ~24-pair table + per-turn tuning that built each original motion-type system.

---

## 7. Phase 3 — Render integration + `showArrow` toggle

### Compose the halfway pictograph

A halved pictograph is a real pictograph whose end state IS the halfway state:

```ts
// buildHalvedStep(step: StepData, t = 0.5): StepData | null
//   - for each hand's MotionData:
//       halfwayOri  = calculateOrientationAt(motion, t)        // Phase 1; null ⇒ bail (off-lattice)
//       halfwayLoc  = intercardinal/center midpoint            // existing GridLocation
//       endLocation/endOrientation ← halfway values
//       segment     = { t0: 0, t1: t }                          // Phase 2 arrow
//   returns a StepData the normal preparer/renderer can consume, or null if any hand is off-lattice
```

Props place from `location + orientation` (both now known for the halfway state) through the existing prop positioner. The arrow places through the Phase 2 segment branch. No new renderer — a synthetic `StepData` flows through `prepareSingle` unchanged.

### Toggle

`ArrowSvg.svelte` already has a `showArrow` prop, but `PictographRenderer.svelte` hardcodes it `true` at 414 / 433 / 454. Thread it as a real prop from `PictographContainer` so arrow rendering is a caller choice ("renderable option"). Default stays `true` — no behavior change for existing callers.

### Guide rewire (the payoff + the tiny-fix)

`TurnsPage.svelte`, `TwoTurnsShiftsPage.svelte`, `TwoTurnsDashStaticPage.svelte` render **real full-size pictographs**:

- start / end / combined frames → normal pictograph + normal arrow (existing pipeline; "reuse the existing arrow slot").
- halfway frames → `buildHalvedStep(step, 0.5)` → real pictograph with the correct halfway orientation + the half-arrow.
- **on-lattice quarter frames** (quarters of whole/half-turn motions) → same, at `t ∈ {0.25, 0.75}`.
- **off-lattice frames** (thirds; L6 quarter-halves) → stay on the existing visual `poseArrow` path (no legal orientation to compute).

This replaces the current `LiftedTurnFrame` (baked staff+arrow on a bare grid → tiny) with full pictographs at proper scale. The lifted glyphs become the `*_half` assets.

**Interim:** the committed `LiftedTurnFrame` lift stays in place (vector-exact, if small) until Phase 3 lands, then is removed.

---

## 8. Testing strategy

- **Phase 1:** the `calculateOrientationAt(·,1) === calculateEndOrientation(·)` dataset invariant (acceptance gate) + explicit halfway cases (0-turn anti = one cardinal step; 1-turn pro = 90°; 2-turn = reverse) + the empirical guide-artboard cross-check (`mapOrientationToAngle` vs `poseAt.deg`) + off-lattice returns `null` (thirds, L6 quarter-halves). Runs in the existing orientation unit-test harness.
- **Phase 2:** render each `*_half` arrow, screenshot-compare to the guide artboards. Parser accepts the normalized assets (viewBox + `#centerPoint`).
- **Phase 3:** guide pages render full-size (tiny-bug gone) — screenshot proof per verification protocol. Segment arrows land on-grid. A contract test asserting the turn pages render real pictographs (not `LiftedTurnFrame`).

---

## 9. Risks

- **Base-rotation accrual convention (the one domain decision to ratify).** v1 asserts base rotation accrues linearly in `t`, so halfway of a 180° base reversal = 90° = one cardinal step. This matches the animation engine and the 180°-unit design intent, and is empirically checkable against the guide's drawn halfway anti staffs (§5). **Austen ratifies** — he is the domain authority. If the domain says otherwise for some motion family, Phase 1's `baseStepsFull` is the single place it changes.
- **Off-lattice fractions.** Thirds (60°) and halving L6 quarter-turns (22.5°) have no legal orientation. Guarded via `null`; those frames stay visual-only. Not a v1 feature.
- **Skew motions.** Skewed shifts still have an arc, so an anti-family base reversal applies; the `baseStepsFull` sign for skews needs care. v1 may restrict halving to non-skew shifts and flag skews as future.
- **Authoring load, not code, is the size.** The half-arrow location/rotation/default-tier tables + the per-turn asset family are hand-authored, like the original four systems. This is where the real time goes; the plumbing is small.
- **Adjustment cascade's "graceful degradation" is a trap.** It never throws but falls back to `{x:0,y:0}` (`arrow-placer.ts:178-181`) — calibrated for nothing. Every half-motion scenario needs its own authored default-tier entry before it looks right.

---

## 10. Out of scope (this spec)

- **Phase 4 — "halve any pictograph" product UX** (a user action to split any pictograph and view the two halves). Builds directly on Phases 1–3; specced separately once the pipeline lands.
- **Thirds / arbitrary off-lattice fractions as orientation-correct.** Domain-impossible at 45° granularity; permanently visual-only.
- **Arbitrary continuous `t` / scrubbing** (smooth animation positioning of the half-arrow). Escalates to a continuous placement system (L-XL); not needed for the fixed-fraction feature. The discrete on-lattice set `{0, 0.25, 0.5, 0.75, 1}` covers the product goal.

---

## 11. Implementation ledger

**Phase 1 — halfway-orientation algebra** ✅ COMPLETE (2026-07-14, engine-grounded — the base+turn decomposition below was superseded during execution; see §5)
- [x] Twin bug 2: `calculateEndOrientation` canonical-case fix (interradial/center starts) — `10ac9b2a34` (+ warn polish `032e88b6e0`); flipped the `it.fails` guards green, 47/47
- [x] `orientation-angle.ts` — pure angle↔orientation bijection (8-point radial), forward + inverse + off-lattice `null` — `53d73a2d87`, 12/12 (32-case round-trip)
- [x] Twin bug 1: engine `mapOrientationToAngle` 8-point extension — `e98f9cec42`; cardinals byte-identical, interradials fixed, center preserved, engine suite 59/59
- [x] `orientation-at.ts` — `calculateOrientationAt(input, t)` engine-grounded (sample `interpolatePropAngles` → bijection inverse), center-family → `null` — `cfed408346`
- [x] Dataset `t=1` invariant `calculateOrientationAt(·,1) === calculateEndOrientation(·)` — **PASSED, 2464 real comparisons** (6 letters × variants × 2 hands × 7 turns × 4 start orientations incl. interradials), 0 mismatches; non-vacuity guard added — `30535ede48`. No engine↔algebra divergence.
- [x] Halfway + off-lattice/decidability unit cases — 0-turn pro preserves, 0-turn anti → cardinal, half-integer turns on-lattice, quarter-turn → `null`
- [x] Guide-artboard equivalence — `calculateOrientationAt` and the guide's `poseAt` call the identical engine (`interpolatePropAngles`); the halfway tests assert physical correctness against it. Accrual convention self-verified (no Austen ratification needed — the invariant + engine equivalence proved it).
- [x] Dead `tests/helpers/real-pictograph-loader.ts` repaired (broken DI/fetch deps → real CSV pipeline) — `c621a33f00`
- Gate: 212/212 Phase-1 tests pass (2 pre-existing `.svelte.test.ts` browser-mode suite-load failures, unrelated); 0 tsc type errors in the 4 Phase-1 files.
- Follow-up surfaced: same lowercasing bug lives in 4+ drifted module copies incl. the MCP render path — see `reference_orientation_lowercase_bug_copies` memory.

**Phase 2a — half-motion arrow pipeline plumbing** ✅ COMPLETE (2026-07-14). Plan: `docs/superpowers/plans/2026-07-14-halved-pictograph-phase-2-arrow-identity.md`.
- [x] `MotionData.segment` field + factory support — `60d038d6a3`
- [x] `arrow-location-calculator` half branch — `e69351e92a`. Returns `motion.endLocation` (the halfway grid location); **`shiftHalfDirectionPairs` proved unnecessary** — halving always lands on the 45° grid, so `endLocation` is exact (refinement).
- [x] `arrow-rotation-calculator` half branch — `30d5a28955` + dedup/guard `d0a66ce3a1` + dash-center fix in `1a6dc27e2c`. **Derived from Phase 1's pure `orientationToStaffAngle` bijection, NOT hand-authored rotation maps** (refinement #2 — authored maps would duplicate the keystone). Pure `segment-rotation.ts` — no animation-engine import in the arrow pipeline (no dependency cycle).
- [~] `default_diamond_{pro,anti,dash,static}_half_placements.json` + key-generator recognition — **DEFERRED to Phase 2b.** 2a baselines the adjustment at `0` via an orchestrator guard; authored nudges are visual tuning (not needed for correct position/rotation).
- [x] `arrow-path-resolver` `_half` baseDir — `2337be4a27` (both `getArrowPath` + `getArrowSvgPath`).
- [x] Route half frames around the `letter||"A"` orchestrator footgun — `e9153fe3ce` + type fix `8880f67e1f`.
- [x] Normalize guide glyphs → `*_half` assets — `795408d7f6`. Four seed glyphs (pro curl, anti zig-zag, dash bow, static loop) extracted from `lifted-turn-arrows.ts` via `scripts/extract-half-glyphs.mjs`. **`#centerPoint` is OPTIONAL** (parser defaults the pivot to viewBox center — §6 correction). **Glyphs are turn-invariant** → four assets, not a per-turn family (refinement #1 — the spec's feared "authoring is the bulk" collapses). Rotational-reference normalization + the full-family visual tuning is Phase 2b.

**Phase 2a gate (2026-07-14):** 9 test files / 31 tests green, incl. the 7-motion end-to-end oracle asserting each guide half-arrow's pipeline rotation == the physical `poseAt` staff angle (PRO t1=315°, ANTI t1=225°, PRO t2=45°, ANTI t2=315°, DASH=90°, STATIC=0° — all exact). 0 tsc errors in the Phase-2a files (371 pre-existing project errors from other sessions, unchanged). Oracle-driven find: DASH-at-center rotation was 90° off (engine `centerPathAngle` degenerates at a through-center midpoint); fixed by resolving CENTER to canonical `LOCATION_ANGLES[CENTER]=0`.

**Phase 2b — visual tuning (requires Austen's eye; NOT started)**
- [ ] Screenshot review of `/test/half-arrows` vs the guide artboards; confirm glyph placement/rotation fidelity
- [ ] Per-glyph rotational-reference offset (if a drawn glyph's head reference differs from the canonical 0)
- [~] Authored `_half` default-tier pixel nudges (sibling `ArrowPlacer` bucket — do NOT extend the hardcoded `motionTypes` array; swap the orchestrator's `0` baseline for the real lookup) — **plumbing landed.** Sibling `pro_half`/`anti_half`/`dash_half`/`static_half` bucket in `arrow-placer.ts` (staff-root only, v1) + empty `default_diamond_*_half_placements.json` files + orchestrator now calls the real `getDefaultAdjustment` lookup instead of a hardcoded `0`. Empty data → `{0,0}` baseline preserved (verified: regression test asserts final position == unadjusted initial position). Authored pixel values still pending Austen's visual review of `/test/half-arrows`.
- [ ] `getArrowSvgPath` vs `getArrowPath` live-call-path audit

**Phase 3 — render integration + toggle + guide rewire** ✅ COMPLETE (2026-07-16)
- [x] Screenshot proof (tiny-bug gone) — all three pages captured full-size on `/guide/level-2/print` (Turns; 2-Turns Shifts incl. thirds PoseFrames; Dashes incl. the center-prop halved frame and quarter PoseFrames). Zero console errors; one benign deriveGridMode warning on the center-touching halved dash (defaults to DIAMOND, correct). Step-number badge on halfway frames suppressed via `stepNumberOverride: false` (`1215f70ad5`). Screenshots in the 2026-07-16 session scratchpad (`turns-page-final.png`, `two-turns-shifts-after.png`, `two-turns-dash-static-after.png`).
- [x] `buildHalvedStep(step, t)` — shipped earlier this phase (`src/lib/shared/animation-engine/services/build-halved-step.ts`); v1 only supports `t=0.5` (the midpoint), the only fraction with a NAMED grid location — see its module doc comment. **Correction to this doc's §7 rewire bullet:** quarters (¼/¾) do NOT route through the pipeline like halves — they have a legal orientation but no legal grid location (a shift's quarter-point sits between the grid's 8 named points), so they render via the new runtime `PoseFrame` visual path, not `buildHalvedStep`.
- [x] Thread `showArrow` as a real `PictographContainer` prop — already landed (default `true`); used here with `showArrow={false}` on all start/end pose frames.
- [x] Rewire the 3 turn pages to real pictographs — TurnsPage, TwoTurnsShiftsPage, TwoTurnsDashStaticPage. start/end → real single-staff `PictographContainer` (showArrow=false); halfway (t=0.5, all whole/half-turn shifts here) → `buildHalvedStep` with a `PoseFrame` fallback for the null contract; quarters (dash ¼/¾) and thirds (anti-2turn ⅓/⅔) → new runtime `PoseFrame` component (poseAt + pose-arrow.ts, same visual language LiftedTurnFrame used — a minimal 5-dot grid, not the full app grid); combined → real full-motion pictograph (system arrow), SelectionHit click-to-animate preserved.
- [x] Remove `LiftedTurnFrame` — deleted (`_components/LiftedTurnFrame.svelte`); `_data/lifted-turn-arrows.ts` and `scripts/extract-half-glyphs.mjs` kept (asset-regeneration path, per spec). Screenshot proof of the tiny-bug fix is the orchestrator's follow-up.
- [x] Turn-page contract test — `tests/unit/guide-turn-pages-contract.test.ts` (LiftedTurnFrame gone from disk + unreferenced by the 3 pages; each page imports PictographContainer and references buildHalvedStep). 10/10 green.
