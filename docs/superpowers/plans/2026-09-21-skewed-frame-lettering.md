# Skewed-Frame Lettering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Rotate 45° fuse derives a letter for every beat, builds a braced word like `{USUS}`, renders braces on its pictographs, and saves.

**Architecture:** A pure geometric classifier (`skewed-frame-letter.ts`) is the source of truth for the 38-letter skewed alphabet. The dataframe generator enumerates all 1152 skewed-frame beats through it and appends them as category 3 rows, so the existing CSV lookup letters them at runtime. A single word builder in `word-deriver.ts` wraps skewed spans in braces; index/sort/search sites strip them; the pictograph and word glyph draw them.

**Tech Stack:** SvelteKit 5 runes, TypeScript, vitest (`tests/config/vitest.config.ts`), tsx for the generator script, CSV dataframes under `static/data/pictographs/`.

**Spec:** `docs/superpowers/specs/2026-09-21-skewed-frame-lettering-design.md`

**Worktree:** `E:/worktrees/tka-platform/skewed-frame-lettering`, branch `codex/skewed-frame-lettering`. All paths below are relative to that root. Run every command from that directory (`cd E:/worktrees/tka-platform/skewed-frame-lettering && ...`). `node_modules` there is a junction into the primary checkout: never run `pnpm install` inside the worktree.

**Package resolution gotcha:** `node_modules/@tka/*` are junctions to the PRIMARY checkout's `packages/*`, so the worktree cannot see edits to `packages/`. This plan therefore puts all new code under `src/` and touches no package.

**Commit hygiene:** explicit pathspecs only (`git add <file> <file>`), never `git add -A` or `git add .`. Run `git status --short` before each commit and list only files this task created or modified. End every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

**Test commands:**
- One app test file: `npx vitest run --config tests/config/vitest.config.ts <path>`
- Svelte/type gate: `npm run check:fast`

---

## File map

| File | Change |
| --- | --- |
| `src/lib/shared/pictograph/skew/skewed-frame-letter.ts` | Create: the classifier and geometry helpers |
| `src/lib/shared/pictograph/skew/__tests__/skewed-frame-letter.test.ts` | Create: 38-letter table, exhaustive 1152 sweep, diamond CSV cross-checks |
| `src/lib/shared/foundation/services/skewed-frame.ts` | Create: `isSkewedFrameBeat`, `isSkewedFrameStep` |
| `src/lib/shared/foundation/services/__tests__/skewed-frame.test.ts` | Create |
| `src/lib/shared/foundation/utils/word-notation.ts` | Create: `parseWordNotation`, `renderWordNotation`, `stripWordNotation`, `WordUnit` |
| `src/lib/shared/foundation/utils/__tests__/word-notation.test.ts` | Create |
| `src/lib/shared/foundation/utils/word-simplifier.ts` | Modify: notation-aware `simplifyRepeatedWord` and `isTkaWord`; re-export notation helpers |
| `tests/unit/utils/word-simplifier.test.ts` | Modify: braced cases |
| `src/lib/shared/foundation/utils/__tests__/is-tka-word.test.ts` | Modify: braced cases |
| `src/lib/shared/foundation/services/word-deriver.ts` | Modify: render words through the notation |
| `src/lib/shared/foundation/services/__tests__/strict-word-derivation.test.ts` | Modify: braced expectations |
| `scripts/generate-skewed-dataframe.ts` | Modify: `generateSkewedFrameRows`, category 3 |
| `static/data/pictographs/SkewedPictographDataframe.csv` | Regenerate (5120 → 6272 rows) |
| `tests/unit/pictograph/skewed-frame-dataframe.test.ts` | Create: CSV ↔ classifier consistency |
| `src/lib/shared/navigation/services/letter-deriver.ts` | Modify: word via `deriveWordFromBeats` |
| `src/lib/features/fuse/state/fuse-state.svelte.ts` | Modify: word via `deriveWordFromBeats`, no uppercase |
| `src/lib/features/fuse/services/__tests__/fused-word-derivation.test.ts` | Modify: rotate-45 case |
| `tests/unit/fuse/fuse-state.test.ts` | Modify: Greek-letter word case |
| `src/lib/features/create/shared/services/sequence-extender.ts` | Modify: word via `deriveWordFromBeats` |
| `src/lib/features/create/shared/services/step-operations/step-data-helpers.ts` | Modify: same |
| `src/lib/features/create/shared/services/step-operations/rotation-direction-handler.ts` | Modify: same |
| `src/lib/features/browse/sequences/display/services/browse-filter.ts` | Modify: strip before indexing |
| `src/lib/features/browse/sequences/navigation/services/navigator.ts` | Modify: strip before indexing |
| `src/lib/shared/browse/utils/kinetic-alphabet-sort.ts` | Modify: strip in `extractBaseLetter` |
| `src/lib/shared/browse/utils/__tests__/kinetic-alphabet-sort.test.ts` | Create |
| `src/lib/features/create/construct/option-picker/services/placement-analyzer.ts` | Modify: zeta/eta/tau/terra groups |
| `src/lib/features/create/construct/option-picker/services/__tests__/placement-analyzer.test.ts` | Create |
| `src/lib/shared/pictograph/tka-glyph/utils/skew-brace-layout.ts` | Create: brace positions |
| `src/lib/shared/pictograph/tka-glyph/utils/__tests__/skew-brace-layout.test.ts` | Create |
| `src/lib/shared/pictograph/tka-glyph/components/SkewBraces.svelte` | Create |
| `src/lib/shared/pictograph/shared/components/PictographRenderer.svelte` | Modify: mount `SkewBraces` |
| `src/lib/shared/choreo-card/components/TKAWordGlyph.svelte` | Modify: strip for glyphs, whole-word braces |
| `docs/reference/skew-notation.md` | Modify: sections 4, 8, 9 |
| `docs/reference/letter-gap-families.md` | Modify: pointer in "The 45° case" |

---

### Task 0: Worktree setup

- [ ] **Step 1: Create the worktree from local main**

```bash
git -C E:/tka-platform worktree add E:/worktrees/tka-platform/skewed-frame-lettering -b codex/skewed-frame-lettering main
```

- [ ] **Step 2: Junction node_modules (root only; packages are not needed because nothing under `packages/` changes)**

```bash
cmd /c "mklink /J E:\worktrees\tka-platform\skewed-frame-lettering\node_modules E:\tka-platform\node_modules"
```

- [ ] **Step 3: Prove the toolchain runs there**

Run: `cd E:/worktrees/tka-platform/skewed-frame-lettering && npx vitest run --config tests/config/vitest.config.ts src/lib/features/fuse/services/__tests__/fused-word-derivation.test.ts`
Expected: 3 tests pass.

---

### Task 1: The skewed-frame classifier

**Files:**
- Create: `src/lib/shared/pictograph/skew/skewed-frame-letter.ts`
- Test: `src/lib/shared/pictograph/skew/__tests__/skewed-frame-letter.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/shared/pictograph/skew/__tests__/skewed-frame-letter.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  classifySkewedFrameLetter,
  crossedPosition,
  frameSpacing,
  isSkewedFramePair,
  leadingHand,
  SKEW_FRAME_LOCATIONS,
  SKEWED_FRAME_LETTERS,
  type SkewFrameHand,
  type SkewFrameLocation,
  type SkewFrameMotionType,
} from "../skewed-frame-letter";

const hand = (
  motionType: SkewFrameMotionType,
  startLocation: SkewFrameLocation,
  endLocation: SkewFrameLocation
): SkewFrameHand => ({ motionType, startLocation, endLocation });

describe("frame geometry", () => {
  it("tells mixed pairs from pure pairs", () => {
    expect(isSkewedFramePair("n", "ne")).toBe(true);
    expect(isSkewedFramePair("ne", "s")).toBe(true);
    expect(isSkewedFramePair("n", "s")).toBe(false);
    expect(isSkewedFramePair("ne", "sw")).toBe(false);
  });

  it("names the spacing", () => {
    expect(frameSpacing("n", "ne")).toBe("eta");
    expect(frameSpacing("nw", "n")).toBe("eta");
    expect(frameSpacing("n", "se")).toBe("zeta");
    expect(frameSpacing("sw", "n")).toBe("zeta");
    expect(frameSpacing("n", "e")).toBeNull();
  });

  it("finds the leader as the hand ahead by the smaller arc", () => {
    // Both travelling clockwise: red at ne is ahead of blue at n.
    expect(leadingHand("n", "ne", 90)).toBe("right");
    // Same hands travelling counter-clockwise: blue at n is ahead.
    expect(leadingHand("n", "ne", -90)).toBe("left");
    // Zeta spacing, clockwise: red at se (135° ahead) leads.
    expect(leadingHand("n", "se", 90)).toBe("right");
    expect(leadingHand("n", "se", -90)).toBe("left");
  });

  it("finds the crossed position for opposite travel", () => {
    // Blue n clockwise, red ne counter-clockwise: they converge through beta.
    expect(crossedPosition("n", "ne", 90)).toBe("beta");
    // Blue n counter-clockwise, red ne clockwise: they diverge through alpha.
    expect(crossedPosition("n", "ne", -90)).toBe("alpha");
    expect(crossedPosition("n", "se", 90)).toBe("beta");
    expect(crossedPosition("n", "se", -90)).toBe("alpha");
  });
});

describe("classifySkewedFrameLetter", () => {
  it("returns null outside the skewed frame or for inconsistent motions", () => {
    expect(
      classifySkewedFrameLetter({ left: hand("pro", "n", "e"), right: hand("pro", "s", "w") })
    ).toBeNull();
    // A pro hand cannot travel 45°.
    expect(
      classifySkewedFrameLetter({ left: hand("pro", "n", "ne"), right: hand("static", "se", "se") })
    ).toBeNull();
    // A static hand cannot move.
    expect(
      classifySkewedFrameLetter({ left: hand("static", "n", "e"), right: hand("static", "ne", "ne") })
    ).toBeNull();
  });

  it.each<[string, SkewFrameHand, SkewFrameHand]>([
    // Type 1 same direction (blue n → e clockwise, red ne → se clockwise: eta→eta)
    ["S", hand("pro", "n", "e"), hand("pro", "ne", "se")],
    ["T", hand("anti", "n", "e"), hand("anti", "ne", "se")],
    ["U", hand("anti", "n", "e"), hand("pro", "ne", "se")], // red leads and is pro
    ["V", hand("pro", "n", "e"), hand("anti", "ne", "se")], // red leads and is anti
    // Type 1 opposite direction from eta (blue n, red ne)
    ["D", hand("pro", "n", "w"), hand("pro", "ne", "se")], // diverge: cross alpha
    ["E", hand("anti", "n", "w"), hand("anti", "ne", "se")],
    ["F", hand("pro", "n", "w"), hand("anti", "ne", "se")],
    ["P", hand("pro", "n", "e"), hand("pro", "ne", "nw")], // converge: cross beta
    ["Q", hand("anti", "n", "e"), hand("anti", "ne", "nw")],
    ["R", hand("anti", "n", "e"), hand("pro", "ne", "nw")],
    // Type 1 opposite direction from zeta (blue n, red se)
    ["J", hand("pro", "n", "e"), hand("pro", "se", "ne")], // converge: cross beta
    ["K", hand("anti", "n", "e"), hand("anti", "se", "ne")],
    ["L", hand("pro", "n", "e"), hand("anti", "se", "ne")],
    ["M", hand("pro", "n", "w"), hand("pro", "se", "sw")], // diverge: cross alpha
    ["N", hand("anti", "n", "w"), hand("anti", "se", "sw")],
    ["O", hand("anti", "n", "w"), hand("pro", "se", "sw")],
    // Type 2 shift + static
    ["W", hand("pro", "n", "w"), hand("static", "se", "se")], // zeta→zeta
    ["X", hand("anti", "n", "w"), hand("static", "se", "se")],
    ["Y", hand("pro", "n", "e"), hand("static", "ne", "ne")], // eta→eta
    ["Z", hand("anti", "n", "e"), hand("static", "ne", "ne")],
    ["Σ", hand("pro", "n", "e"), hand("static", "se", "se")], // zeta→eta
    ["Δ", hand("anti", "n", "e"), hand("static", "se", "se")],
    ["Θ", hand("pro", "n", "w"), hand("static", "ne", "ne")], // eta→zeta
    ["Ω", hand("anti", "n", "w"), hand("static", "ne", "ne")],
    // Type 3 shift + dash
    ["W-", hand("pro", "n", "e"), hand("dash", "ne", "sw")], // eta→zeta
    ["X-", hand("anti", "n", "e"), hand("dash", "ne", "sw")],
    ["Y-", hand("pro", "n", "w"), hand("dash", "se", "nw")], // zeta→eta
    ["Z-", hand("anti", "n", "w"), hand("dash", "se", "nw")],
    ["Σ-", hand("pro", "n", "w"), hand("dash", "ne", "sw")], // eta→eta
    ["Δ-", hand("anti", "n", "w"), hand("dash", "ne", "sw")],
    ["Θ-", hand("pro", "n", "e"), hand("dash", "se", "nw")], // zeta→zeta
    ["Ω-", hand("anti", "n", "e"), hand("dash", "se", "nw")],
    // Type 4 dash + static
    ["Φ", hand("dash", "n", "s"), hand("static", "ne", "ne")], // eta→zeta
    ["Ψ", hand("dash", "n", "s"), hand("static", "se", "se")], // zeta→eta
    // Type 5 dual dash
    ["Φ-", hand("dash", "n", "s"), hand("dash", "se", "nw")], // zeta→zeta
    ["Ψ-", hand("dash", "n", "s"), hand("dash", "ne", "sw")], // eta→eta
    // Type 6 static
    ["ζ", hand("static", "n", "n"), hand("static", "se", "se")],
    ["η", hand("static", "n", "n"), hand("static", "ne", "ne")],
  ])("letters %s", (letter, left, right) => {
    expect(classifySkewedFrameLetter({ left, right })).toBe(letter);
  });

  it("letters every one of the 1152 skewed-frame beats with exactly the 38 letters", () => {
    const options: Array<{ motionType: SkewFrameMotionType; turn: number }> = [
      { motionType: "pro", turn: 2 },
      { motionType: "pro", turn: -2 },
      { motionType: "anti", turn: 2 },
      { motionType: "anti", turn: -2 },
      { motionType: "static", turn: 0 },
      { motionType: "dash", turn: 4 },
    ];
    const move = (loc: SkewFrameLocation, turn: number): SkewFrameLocation => {
      const index = SKEW_FRAME_LOCATIONS.indexOf(loc);
      return SKEW_FRAME_LOCATIONS[(index + turn + 8) % 8]!;
    };
    const counts = new Map<string, number>();
    let beats = 0;
    for (const blue of SKEW_FRAME_LOCATIONS) {
      for (const red of SKEW_FRAME_LOCATIONS) {
        if (!isSkewedFramePair(blue, red)) continue;
        for (const b of options) {
          for (const r of options) {
            beats++;
            const letter = classifySkewedFrameLetter({
              left: hand(b.motionType, blue, move(blue, b.turn)),
              right: hand(r.motionType, red, move(red, r.turn)),
            });
            expect(letter, `${blue}/${b.motionType}/${b.turn} ${red}/${r.motionType}/${r.turn}`).not.toBeNull();
            counts.set(letter!, (counts.get(letter!) ?? 0) + 1);
          }
        }
      }
    }
    expect(beats).toBe(1152);
    expect([...counts.keys()].sort()).toEqual([...SKEWED_FRAME_LETTERS].sort());
    const expectedCounts: Record<string, number> = {
      S: 64, T: 64, U: 64, V: 64,
      D: 16, E: 16, F: 32, J: 16, K: 16, L: 32, M: 16, N: 16, O: 32, P: 16, Q: 16, R: 32,
      W: 32, X: 32, Y: 32, Z: 32, "Σ": 32, "Δ": 32, "Θ": 32, "Ω": 32,
      "W-": 32, "X-": 32, "Y-": 32, "Z-": 32, "Σ-": 32, "Δ-": 32, "Θ-": 32, "Ω-": 32,
      "Φ": 32, "Ψ": 32, "Φ-": 16, "Ψ-": 16, "ζ": 16, "η": 16,
    };
    expect(Object.fromEntries(counts)).toEqual(expectedCounts);
  });
});

describe("standard-frame cross-checks against DiamondPictographDataframe.csv", () => {
  const csvPath = resolve(__dirname, "../../../../../../static/data/pictographs/DiamondPictographDataframe.csv");
  const lines = readFileSync(csvPath, "utf8").split("\n").filter((line) => line.trim());
  const header = lines[0]!.split(",");
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(header.map((key, index) => [key, values[index]!.trim()]));
  });
  const turnOf = (start: string, end: string): 90 | -90 => {
    const delta =
      (SKEW_FRAME_LOCATIONS.indexOf(end as SkewFrameLocation) -
        SKEW_FRAME_LOCATIONS.indexOf(start as SkewFrameLocation) +
        8) %
      8;
    return delta === 2 ? 90 : -90;
  };

  it("U rows are led by the pro hand and V rows by the anti hand", () => {
    for (const row of rows.filter((r) => r.letter === "U" || r.letter === "V")) {
      const leader = leadingHand(
        row.blueStartLocation as SkewFrameLocation,
        row.redStartLocation as SkewFrameLocation,
        turnOf(row.blueStartLocation!, row.blueEndLocation!)
      );
      const leaderType = leader === "left" ? row.blueMotionType : row.redMotionType;
      expect(leaderType, JSON.stringify(row)).toBe(row.letter === "U" ? "pro" : "anti");
    }
  });

  it("M rows cross alpha and P rows cross beta", () => {
    for (const row of rows.filter((r) => r.letter === "M" || r.letter === "P")) {
      const crossed = crossedPosition(
        row.blueStartLocation as SkewFrameLocation,
        row.redStartLocation as SkewFrameLocation,
        turnOf(row.blueStartLocation!, row.blueEndLocation!)
      );
      expect(crossed, JSON.stringify(row)).toBe(row.letter === "M" ? "alpha" : "beta");
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/pictograph/skew/__tests__/skewed-frame-letter.test.ts`
Expected: FAIL, cannot resolve `../skewed-frame-letter`.

- [ ] **Step 3: Write the classifier**

```ts
// src/lib/shared/pictograph/skew/skewed-frame-letter.ts
/**
 * Skewed-frame lettering.
 *
 * A beat is in the skewed frame when one hand sits on a cardinal point
 * (n e s w) and the other on an intercardinal point (ne se sw nw). The hands
 * are then 45° apart (eta) or 135° apart (zeta). Neither frame exists in the
 * Diamond/Box dataframes, so the letter is computed from geometry here and
 * baked into SkewedPictographDataframe.csv by scripts/generate-skewed-dataframe.ts.
 *
 * Rules: docs/superpowers/specs/2026-09-21-skewed-frame-lettering-design.md.
 * The letter is a pure function of the two hand motions. Blue = left, red =
 * right. Inputs are plain strings so the generator script can call this
 * without the app's enums.
 */
import { Letter } from "../../foundation/domain/models/letter";

export type SkewFrameLocation = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export type SkewFrameMotionType = "pro" | "anti" | "static" | "dash";
export type FrameSpacing = "eta" | "zeta";
export type CrossedPosition = "alpha" | "beta";
export type Travel = 90 | -90;

export interface SkewFrameHand {
  readonly motionType: SkewFrameMotionType;
  readonly startLocation: SkewFrameLocation;
  readonly endLocation: SkewFrameLocation;
}

export interface SkewFrameBeat {
  /** Blue hand. */
  readonly left: SkewFrameHand;
  /** Red hand. */
  readonly right: SkewFrameHand;
}

/** Perimeter points in clockwise order, 45° apart. */
export const SKEW_FRAME_LOCATIONS: readonly SkewFrameLocation[] = [
  "n", "ne", "e", "se", "s", "sw", "w", "nw",
];

const ANGLE: Record<SkewFrameLocation, number> = {
  n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315,
};

export function isCardinalLocation(location: SkewFrameLocation): boolean {
  return ANGLE[location] % 90 === 0;
}

/** True when exactly one hand is on a cardinal point. */
export function isSkewedFramePair(a: SkewFrameLocation, b: SkewFrameLocation): boolean {
  return isCardinalLocation(a) !== isCardinalLocation(b);
}

/** 45° apart = eta, 135° apart = zeta, anything else = not a skewed pair. */
export function frameSpacing(a: SkewFrameLocation, b: SkewFrameLocation): FrameSpacing | null {
  const difference = Math.abs(ANGLE[a] - ANGLE[b]);
  const apart = difference > 180 ? 360 - difference : difference;
  if (apart === 45) return "eta";
  if (apart === 135) return "zeta";
  return null;
}

/** Red measured clockwise from blue, in degrees 0–315. */
function redClockwiseFromBlue(blue: SkewFrameLocation, red: SkewFrameLocation): number {
  return (ANGLE[red] - ANGLE[blue] + 360) % 360;
}

/**
 * Which hand is ahead when both travel the same way: the one its partner
 * trails by the smaller arc. Clockwise travel puts red ahead when red sits
 * fewer than 180° clockwise from blue; counter-clockwise travel flips it.
 */
export function leadingHand(
  blue: SkewFrameLocation,
  red: SkewFrameLocation,
  travel: Travel
): "left" | "right" {
  const ahead = redClockwiseFromBlue(blue, red);
  if (travel === 90) return ahead < 180 ? "right" : "left";
  return ahead > 180 ? "right" : "left";
}

/**
 * The pure position the hands pass through when they travel opposite ways.
 * Converging hands meet (beta); diverging hands pass through opposite (alpha).
 * `blueTravel` is blue's direction; red travels the other way.
 */
export function crossedPosition(
  blue: SkewFrameLocation,
  red: SkewFrameLocation,
  blueTravel: Travel
): CrossedPosition {
  const ahead = redClockwiseFromBlue(blue, red);
  const converging = blueTravel === 90 ? ahead < 180 : ahead > 180;
  return converging ? "beta" : "alpha";
}

/** Signed hand-path turn, clockwise positive: 0, ±90, 180. Null for 45°/135° arcs. */
function handTurn(hand: SkewFrameHand): 0 | 90 | -90 | 180 | null {
  const delta = (ANGLE[hand.endLocation] - ANGLE[hand.startLocation] + 360) % 360;
  if (delta === 0) return 0;
  if (delta === 90) return 90;
  if (delta === 270) return -90;
  if (delta === 180) return 180;
  return null;
}

/** pro/anti shift a quarter, static holds, dash crosses. */
function motionAgreesWithPath(hand: SkewFrameHand, turn: 0 | 90 | -90 | 180): boolean {
  switch (hand.motionType) {
    case "pro":
    case "anti":
      return turn === 90 || turn === -90;
    case "static":
      return turn === 0;
    case "dash":
      return turn === 180;
  }
}

type SpinTriple = readonly [pro: Letter, anti: Letter, hybrid: Letter];
type SpinPair = readonly [pro: Letter, anti: Letter];

/** Opposite-direction families by start spacing and crossed position. */
const OPPOSITE_FAMILIES: Record<FrameSpacing, Record<CrossedPosition, SpinTriple>> = {
  eta: {
    alpha: [Letter.D, Letter.E, Letter.F],
    beta: [Letter.P, Letter.Q, Letter.R],
  },
  zeta: {
    beta: [Letter.J, Letter.K, Letter.L],
    alpha: [Letter.M, Letter.N, Letter.O],
  },
};

/** Shift + static by start→end spacing. */
const SHIFT_STATIC: Record<FrameSpacing, Record<FrameSpacing, SpinPair>> = {
  zeta: {
    zeta: [Letter.W, Letter.X],
    eta: [Letter.SIGMA, Letter.DELTA],
  },
  eta: {
    eta: [Letter.Y, Letter.Z],
    zeta: [Letter.THETA, Letter.OMEGA],
  },
};

/**
 * Shift + dash by start→end spacing. A Type 3 letter is the Type 2 pictograph
 * with a dash arrow on the formerly static hand, which in the standard alphabet
 * pairs W- with Y's pictograph and Σ- with Θ's; the same relation applied here.
 */
const SHIFT_DASH: Record<FrameSpacing, Record<FrameSpacing, SpinPair>> = {
  eta: {
    zeta: [Letter.W_DASH, Letter.X_DASH],
    eta: [Letter.SIGMA_DASH, Letter.DELTA_DASH],
  },
  zeta: {
    eta: [Letter.Y_DASH, Letter.Z_DASH],
    zeta: [Letter.THETA_DASH, Letter.OMEGA_DASH],
  },
};

function pickSpin(triple: SpinTriple, a: SkewFrameMotionType, b: SkewFrameMotionType): Letter {
  if (a === b) return a === "pro" ? triple[0] : triple[1];
  return triple[2];
}

/** The 38 letters that can describe a skewed-frame beat. */
export const SKEWED_FRAME_LETTERS: readonly Letter[] = [
  Letter.S, Letter.T, Letter.U, Letter.V,
  Letter.D, Letter.E, Letter.F, Letter.J, Letter.K, Letter.L,
  Letter.M, Letter.N, Letter.O, Letter.P, Letter.Q, Letter.R,
  Letter.W, Letter.X, Letter.Y, Letter.Z, Letter.SIGMA, Letter.DELTA, Letter.THETA, Letter.OMEGA,
  Letter.W_DASH, Letter.X_DASH, Letter.Y_DASH, Letter.Z_DASH,
  Letter.SIGMA_DASH, Letter.DELTA_DASH, Letter.THETA_DASH, Letter.OMEGA_DASH,
  Letter.PHI, Letter.PSI, Letter.PHI_DASH, Letter.PSI_DASH,
  Letter.ZETA, Letter.ETA,
];

/**
 * Letter for a beat that starts in the skewed frame. Null when the start pair
 * is not mixed, when a hand's arc is 45°/135° (a skew entry/exit, lettered by
 * the dataframe generator's skew columns instead), or when a motion type
 * disagrees with its path.
 */
export function classifySkewedFrameLetter(beat: SkewFrameBeat): Letter | null {
  const { left, right } = beat;
  if (!isSkewedFramePair(left.startLocation, right.startLocation)) return null;

  const leftTurn = handTurn(left);
  const rightTurn = handTurn(right);
  if (leftTurn === null || rightTurn === null) return null;
  if (!motionAgreesWithPath(left, leftTurn) || !motionAgreesWithPath(right, rightTurn)) return null;

  const start = frameSpacing(left.startLocation, right.startLocation);
  const end = frameSpacing(left.endLocation, right.endLocation);
  if (!start || !end) return null;

  const leftShifts = left.motionType === "pro" || left.motionType === "anti";
  const rightShifts = right.motionType === "pro" || right.motionType === "anti";

  if (leftShifts && rightShifts) {
    const blueTravel = leftTurn as Travel;
    if (leftTurn === rightTurn) {
      if (left.motionType === right.motionType) {
        return left.motionType === "pro" ? Letter.S : Letter.T;
      }
      const leader = leadingHand(left.startLocation, right.startLocation, blueTravel);
      const leaderType = leader === "left" ? left.motionType : right.motionType;
      return leaderType === "pro" ? Letter.U : Letter.V;
    }
    const crossed = crossedPosition(left.startLocation, right.startLocation, blueTravel);
    return pickSpin(OPPOSITE_FAMILIES[start][crossed], left.motionType, right.motionType);
  }

  if (leftShifts || rightShifts) {
    const shifting = leftShifts ? left : right;
    const partner = leftShifts ? right : left;
    const pair = partner.motionType === "static" ? SHIFT_STATIC[start][end] : SHIFT_DASH[start][end];
    return shifting.motionType === "pro" ? pair[0] : pair[1];
  }

  const dashes = Number(left.motionType === "dash") + Number(right.motionType === "dash");
  if (dashes === 2) return start === "zeta" ? Letter.PHI_DASH : Letter.PSI_DASH;
  if (dashes === 1) return start === "eta" ? Letter.PHI : Letter.PSI;
  return start === "zeta" ? Letter.ZETA : Letter.ETA;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/pictograph/skew/__tests__/skewed-frame-letter.test.ts`
Expected: PASS (all table rows, the 1152 sweep with the exact counts, both CSV cross-checks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/pictograph/skew/skewed-frame-letter.ts src/lib/shared/pictograph/skew/__tests__/skewed-frame-letter.test.ts
git commit -m "feat(skew): classify skewed-frame beats into the 38-letter skewed alphabet

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Skewed-frame predicate and word notation helpers

**Files:**
- Create: `src/lib/shared/foundation/services/skewed-frame.ts`
- Create: `src/lib/shared/foundation/services/__tests__/skewed-frame.test.ts`
- Create: `src/lib/shared/foundation/utils/word-notation.ts`
- Create: `src/lib/shared/foundation/utils/__tests__/word-notation.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/shared/foundation/services/__tests__/skewed-frame.test.ts
import { describe, expect, it } from "vitest";
import { isSkewedFrameBeat, isSkewedFrameStep } from "../skewed-frame";

const hand = (startLocation: string, endLocation: string) => ({ startLocation, endLocation });

describe("isSkewedFrameBeat", () => {
  it("is true when the start pair or the end pair mixes families", () => {
    expect(isSkewedFrameBeat(hand("n", "e"), hand("ne", "se"))).toBe(true); // stays skewed
    expect(isSkewedFrameBeat(hand("n", "e"), hand("s", "sw"))).toBe(true); // entry beat
    expect(isSkewedFrameBeat(hand("n", "ne"), hand("s", "sw"))).toBe(false); // both hands skew, pure ends
    expect(isSkewedFrameBeat(hand("n", "e"), hand("s", "w"))).toBe(false);
    expect(isSkewedFrameBeat(hand("ne", "se"), hand("sw", "nw"))).toBe(false);
  });

  it("ignores the center point", () => {
    expect(isSkewedFrameBeat(hand("n", "c"), hand("s", "s"))).toBe(false);
    expect(isSkewedFrameBeat(hand("c", "n"), hand("ne", "ne"))).toBe(true);
  });

  it("tolerates missing hands", () => {
    expect(isSkewedFrameBeat(null, hand("n", "e"))).toBe(false);
    expect(isSkewedFrameBeat(hand("n", "e"), undefined)).toBe(false);
  });
});

describe("isSkewedFrameStep", () => {
  it("prefers motions", () => {
    expect(isSkewedFrameStep({ motions: { left: hand("n", "e"), right: hand("ne", "se") } })).toBe(true);
    expect(isSkewedFrameStep({ motions: { left: hand("n", "e"), right: hand("s", "w") }, startPlacement: "zeta1" })).toBe(false);
  });

  it("falls back to zeta/eta placements", () => {
    expect(isSkewedFrameStep({ startPlacement: "zeta3", endPlacement: "zeta7" })).toBe(true);
    expect(isSkewedFrameStep({ startPlacement: "alpha1", endPlacement: "eta2" })).toBe(true);
    expect(isSkewedFrameStep({ startPlacement: "beta1", endPlacement: "gamma2" })).toBe(false);
    expect(isSkewedFrameStep({ startPlacement: null, endPlacement: null })).toBe(false);
    expect(isSkewedFrameStep({})).toBe(false);
  });
});
```

```ts
// src/lib/shared/foundation/utils/__tests__/word-notation.test.ts
import { describe, expect, it } from "vitest";
import {
  parseWordNotation,
  renderWordNotation,
  stripWordNotation,
} from "../word-notation";

describe("parseWordNotation", () => {
  it("reads plain words as unskewed units, keeping dash suffixes", () => {
    expect(parseWordNotation("AW-B")).toEqual([
      { letter: "A", skewed: false },
      { letter: "W-", skewed: false },
      { letter: "B", skewed: false },
    ]);
  });

  it("flags units inside braces", () => {
    expect(parseWordNotation("A{STΣ-}G")).toEqual([
      { letter: "A", skewed: false },
      { letter: "S", skewed: true },
      { letter: "T", skewed: true },
      { letter: "Σ-", skewed: true },
      { letter: "G", skewed: false },
    ]);
  });

  it("skips characters that are not letters", () => {
    expect(parseWordNotation("A B!")).toEqual([
      { letter: "A", skewed: false },
      { letter: "B", skewed: false },
    ]);
    expect(parseWordNotation("")).toEqual([]);
  });
});

describe("renderWordNotation", () => {
  it("wraps each maximal skewed run in one pair of braces", () => {
    expect(
      renderWordNotation([
        { letter: "A", skewed: false },
        { letter: "S", skewed: true },
        { letter: "T", skewed: true },
        { letter: "S", skewed: true },
        { letter: "B", skewed: false },
        { letter: "ζ", skewed: true },
      ])
    ).toBe("A{STS}B{ζ}");
  });

  it("renders a fully skewed word as one span", () => {
    expect(
      renderWordNotation([
        { letter: "U", skewed: true },
        { letter: "S", skewed: true },
      ])
    ).toBe("{US}");
  });

  it("round-trips through parse", () => {
    for (const word of ["", "A", "AW-B", "{US}", "A{STS}B{ζ}", "{Σ-Δ-}"]) {
      expect(renderWordNotation(parseWordNotation(word))).toBe(word);
    }
  });
});

describe("stripWordNotation", () => {
  it("removes braces and nothing else", () => {
    expect(stripWordNotation("A{STS}B{ζ}")).toBe("ASTSBζ");
    expect(stripWordNotation("{W-}")).toBe("W-");
    expect(stripWordNotation("plain")).toBe("plain");
    expect(stripWordNotation("")).toBe("");
  });
});
```

- [ ] **Step 2: Run both tests to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/foundation/services/__tests__/skewed-frame.test.ts src/lib/shared/foundation/utils/__tests__/word-notation.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the predicate**

```ts
// src/lib/shared/foundation/services/skewed-frame.ts
/**
 * Skewed-frame membership for a beat.
 *
 * A position is skewed (zeta or eta) when one hand is on a cardinal point and
 * the other on an intercardinal point. A beat belongs to a skewed span of the
 * word when its start or its end position is skewed: that covers the entry
 * beat, every beat that stays in the frame, and the exit beat. A beat whose
 * hands both cross the grid boundary but start and end pure is not in a span.
 *
 * Dependency-free on purpose: word-deriver (foundation) and the pictograph
 * renderer both use it.
 */

const CARDINAL = new Set(["n", "e", "s", "w"]);
const INTERCARDINAL = new Set(["ne", "se", "sw", "nw"]);

export interface FrameHand {
  readonly startLocation?: string | null;
  readonly endLocation?: string | null;
}

export interface FrameStepLike {
  readonly motions?: {
    readonly left?: FrameHand | null;
    readonly right?: FrameHand | null;
  } | null;
  readonly startPlacement?: string | null;
  readonly endPlacement?: string | null;
}

type Family = "cardinal" | "intercardinal";

function familyOf(location: string | null | undefined): Family | null {
  if (!location) return null;
  if (CARDINAL.has(location)) return "cardinal";
  if (INTERCARDINAL.has(location)) return "intercardinal";
  return null;
}

/** True when both points are on the perimeter and in different families. */
export function isMixedPair(a: string | null | undefined, b: string | null | undefined): boolean {
  const familyA = familyOf(a);
  const familyB = familyOf(b);
  return familyA !== null && familyB !== null && familyA !== familyB;
}

/** True when the beat starts or ends in a zeta/eta position. */
export function isSkewedFrameBeat(
  left: FrameHand | null | undefined,
  right: FrameHand | null | undefined
): boolean {
  if (!left || !right) return false;
  return (
    isMixedPair(left.startLocation, right.startLocation) ||
    isMixedPair(left.endLocation, right.endLocation)
  );
}

function isSkewedPlacement(placement: string | null | undefined): boolean {
  if (!placement) return false;
  const lower = placement.toLowerCase();
  return lower.startsWith("zeta") || lower.startsWith("eta");
}

/**
 * Skewed-span membership for a step or step pairing. Motions decide when they
 * exist; otherwise the stored start/end placement; otherwise not skewed.
 */
export function isSkewedFrameStep(step: FrameStepLike): boolean {
  const left = step.motions?.left;
  const right = step.motions?.right;
  if (left && right) return isSkewedFrameBeat(left, right);
  return isSkewedPlacement(step.startPlacement) || isSkewedPlacement(step.endPlacement);
}
```

- [ ] **Step 4: Write the notation helpers**

```ts
// src/lib/shared/foundation/utils/word-notation.ts
/**
 * Skewed-frame notation for TKA words.
 *
 * A beat whose hands sit on mixed grid points (one cardinal, one intercardinal)
 * is written inside braces, and consecutive skewed beats share one pair:
 * "A{STS}GA". The braces are part of the stored word. Anything that indexes,
 * sorts, or searches a word strips them with stripWordNotation; anything that
 * needs the beats parses them with parseWordNotation.
 */

export interface WordUnit {
  readonly letter: string;
  readonly skewed: boolean;
}

export const SKEW_SPAN_OPEN = "{";
export const SKEW_SPAN_CLOSE = "}";

/** Same character class the word tokenizers use: Latin, Greek, and ⊕. */
const LETTER_CHARACTER = /^[a-zA-Z\u0370-\u03FF\u1F00-\u1FFF\u2295]$/;

/** Letters with their skew flag. A trailing dash belongs to its letter. */
export function parseWordNotation(word: string): WordUnit[] {
  const units: WordUnit[] = [];
  const characters = [...(word ?? "")];
  let skewed = false;
  for (let index = 0; index < characters.length; index++) {
    const character = characters[index]!;
    if (character === SKEW_SPAN_OPEN) {
      skewed = true;
      continue;
    }
    if (character === SKEW_SPAN_CLOSE) {
      skewed = false;
      continue;
    }
    if (!LETTER_CHARACTER.test(character)) continue;
    if (characters[index + 1] === "-") {
      units.push({ letter: `${character}-`, skewed });
      index++;
    } else {
      units.push({ letter: character, skewed });
    }
  }
  return units;
}

/** Joins units, wrapping every maximal run of skewed units in one brace pair. */
export function renderWordNotation(units: readonly WordUnit[]): string {
  let word = "";
  let open = false;
  for (const unit of units) {
    if (unit.skewed && !open) {
      word += SKEW_SPAN_OPEN;
      open = true;
    } else if (!unit.skewed && open) {
      word += SKEW_SPAN_CLOSE;
      open = false;
    }
    word += unit.letter;
  }
  if (open) word += SKEW_SPAN_CLOSE;
  return word;
}

/** The word without its skew braces, for indexing, sorting, and searching. */
export function stripWordNotation(word: string): string {
  return (word ?? "").replace(/[{}]/g, "");
}
```

- [ ] **Step 5: Run both tests**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/foundation/services/__tests__/skewed-frame.test.ts src/lib/shared/foundation/utils/__tests__/word-notation.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/foundation/services/skewed-frame.ts src/lib/shared/foundation/services/__tests__/skewed-frame.test.ts src/lib/shared/foundation/utils/word-notation.ts src/lib/shared/foundation/utils/__tests__/word-notation.test.ts
git commit -m "feat(word): skewed-frame predicate and brace notation helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Notation-aware simplifier and TKA-word check

**Files:**
- Modify: `src/lib/shared/foundation/utils/word-simplifier.ts`
- Modify: `tests/unit/utils/word-simplifier.test.ts`
- Modify: `src/lib/shared/foundation/utils/__tests__/is-tka-word.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/unit/utils/word-simplifier.test.ts` (inside the file, as a new `describe` at the end; keep existing imports and add `import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";` only if the file does not already import it):

```ts
describe("simplifyRepeatedWord with skew notation", () => {
  it("simplifies a repeated span", () => {
    expect(simplifyRepeatedWord("{STS}{STS}")).toBe("{STS}");
  });

  it("simplifies a repeat inside one span", () => {
    expect(simplifyRepeatedWord("{STSSTS}")).toBe("{STS}");
    expect(simplifyRepeatedWord("{USUSUSUS}")).toBe("{US}");
  });

  it("keeps skewed and unskewed units apart", () => {
    expect(simplifyRepeatedWord("A{A}")).toBe("A{A}");
    expect(simplifyRepeatedWord("A{A}A{A}")).toBe("A{A}");
  });

  it("applies the mirror rule inside a span", () => {
    expect(simplifyRepeatedWord("{ABBA}")).toBe("{AB}");
  });

  it("leaves plain words exactly as before", () => {
    expect(simplifyRepeatedWord("ABCABCABC")).toBe("ABC");
    expect(simplifyRepeatedWord("W-W-")).toBe("W-");
    expect(simplifyRepeatedWord("HELLO")).toBe("HELLO");
    expect(simplifyRepeatedWord("__fused__")).toBe("__fused__");
  });
});
```

Append to `src/lib/shared/foundation/utils/__tests__/is-tka-word.test.ts` inside the existing `describe("isTkaWord", ...)` block:

```ts
  it("accepts well-formed skew notation", () => {
    expect(isTkaWord("{US}")).toBe(true);
    expect(isTkaWord("A{STS}B")).toBe(true);
    expect(isTkaWord("{Σ-Δ-}ζ")).toBe(true);
  });

  it("rejects malformed skew notation", () => {
    expect(isTkaWord("{}")).toBe(false);
    expect(isTkaWord("{A}{B}")).toBe(false);
    expect(isTkaWord("{A")).toBe(false);
    expect(isTkaWord("A}")).toBe(false);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/utils/word-simplifier.test.ts src/lib/shared/foundation/utils/__tests__/is-tka-word.test.ts`
Expected: FAIL on the braced cases (`{STSSTS}` stays as is; `{US}` is not a TKA word).

- [ ] **Step 3: Implement**

In `src/lib/shared/foundation/utils/word-simplifier.ts`:

Replace the import block at the top with:

```ts
import { Letter } from "../domain/models/letter";
import {
  compressWord as compressPortableWord,
  simplifyRepeatedWord as simplifyPortableWord,
  splitWordLetterUnits,
} from "@tka/render-composition";
import {
  parseWordNotation,
  renderWordNotation,
  stripWordNotation,
  type WordUnit,
} from "./word-notation";

export {
  parseWordNotation,
  renderWordNotation,
  stripWordNotation,
  type WordUnit,
} from "./word-notation";
```

Replace the body of `simplifyRepeatedWord` with:

```ts
export function simplifyRepeatedWord(word: string): string {
  if (!word) return word;
  const units = parseWordNotation(word);
  // Not a run of letters (a placeholder, a typed name): the portable simplifier
  // keeps its exact historical behaviour for those.
  if (units.length === 0 || renderWordNotation(units) !== word) {
    return simplifyPortableWord(word);
  }
  const simplified = simplifyRepeatedUnits(units);
  return simplified === units ? word : renderWordNotation(simplified);
}

/** A unit's identity for repeat detection: letter plus skew flag. */
function unitKey(unit: WordUnit): string {
  return unit.skewed ? `{${unit.letter}` : unit.letter;
}

/**
 * Unit-level port of the portable simplifier: a full repeat collapses to its
 * pattern ("ABCABC" → "ABC"); otherwise a mirrored group list keeps its first
 * half ("ABBA" → "AB"). Returns the same array when nothing applies.
 */
function simplifyRepeatedUnits(units: readonly WordUnit[]): readonly WordUnit[] {
  const keys = units.map(unitKey);
  for (let length = 1; length <= Math.floor(keys.length / 2); length++) {
    if (keys.length % length !== 0) continue;
    const pattern = keys.slice(0, length);
    const repeats = keys.every((key, index) => key === pattern[index % length]);
    if (repeats) return units.slice(0, length);
  }
  for (let groupSize = 1; groupSize <= Math.floor(keys.length / 2); groupSize++) {
    if (keys.length % groupSize !== 0) continue;
    const groups = Array.from({ length: keys.length / groupSize }, (_, index) =>
      keys.slice(index * groupSize, (index + 1) * groupSize).join("")
    );
    if (
      groups[0] !== groups[1] &&
      groups.every((group, index) => group === groups[groups.length - 1 - index])
    ) {
      return units.slice(0, Math.ceil(groups.length / 2) * groupSize);
    }
  }
  return units;
}
```

Replace the body of `isTkaWord` with:

```ts
export function isTkaWord(text: string): boolean {
  if (!text) return false;
  const units = parseWordNotation(text);
  // The parser skips characters it does not recognize; re-rendering proves that
  // nothing was dropped and that any braces are well formed, so "A B", "A!",
  // "{}" and "{A}{B}" fail here rather than passing as words.
  if (units.length === 0 || renderWordNotation(units) !== text) return false;
  return units.every((unit) => TKA_LETTER_UNITS.has(unit.letter));
}
```

Update the `isTkaWord` doc comment's first paragraph to add one sentence: "A word may carry skew braces around a span (`A{STS}B`); they must be well formed."

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/utils/word-simplifier.test.ts src/lib/shared/foundation/utils/__tests__/is-tka-word.test.ts tests/unit/sequence-modal-exporter-race.test.ts tests/unit/combination/walk-classifier.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/foundation/utils/word-simplifier.ts tests/unit/utils/word-simplifier.test.ts src/lib/shared/foundation/utils/__tests__/is-tka-word.test.ts
git commit -m "feat(word): simplify and validate words with skew braces

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: One word builder

**Files:**
- Modify: `src/lib/shared/foundation/services/word-deriver.ts`
- Modify: `src/lib/shared/foundation/services/__tests__/strict-word-derivation.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/lib/shared/foundation/services/__tests__/strict-word-derivation.test.ts` (uses the file's existing `step()` helper and `deriveWordFromBeats` import; add `deriveWordFromBeats` to the import list from `../word-deriver`):

```ts
describe("skewed spans in the derived word", () => {
  const skewedMotions = () => ({
    left: createMotionData({
      motionType: "pro" as const,
      rotationDirection: "cw" as const,
      startLocation: "n" as const,
      endLocation: "e" as const,
      turns: 0,
      startOrientation: "in" as const,
      endOrientation: "in" as const,
    }),
    right: createMotionData({
      motionType: "pro" as const,
      rotationDirection: "cw" as const,
      startLocation: "ne" as const,
      endLocation: "se" as const,
      turns: 0,
      startOrientation: "in" as const,
      endOrientation: "in" as const,
    }),
  });

  it("wraps consecutive skewed steps in one brace pair", () => {
    const steps = [
      step(1, "A"),
      step(2, "S", { motions: skewedMotions() }),
      step(3, "T", { motions: skewedMotions() }),
      step(4, "G"),
    ];
    expect(deriveWordFromBeats(steps)).toBe("A{ST}G");
    const status = deriveWordStatusFromSteps(steps);
    expect(status.word).toBe("A{ST}G");
    expect(status.complete).toBe(true);
    expect(status.tokenCount).toBe(4);
  });

  it("reads skewed pairings from their placements", () => {
    const pairings: StepPairingData[] = [
      { letter: "A", leftReversal: false, rightReversal: false, startPlacement: "alpha1", endPlacement: "alpha3" },
      { letter: "U", leftReversal: false, rightReversal: false, startPlacement: "eta2", endPlacement: "eta4" },
      { letter: "S", leftReversal: false, rightReversal: false, startPlacement: "eta4", endPlacement: "eta6" },
    ] as StepPairingData[];
    expect(deriveWordStatusFromStepPairings(pairings).word).toBe("A{US}");
    expect(deriveWord(createSequenceData({ steps: [], stepPairings: pairings }))).toBe("A{US}");
  });

  it("does not brace a beat whose hands both skew but start and end pure", () => {
    const bothSkew = {
      left: createMotionData({
        motionType: "pro" as const,
        rotationDirection: "cw" as const,
        startLocation: "n" as const,
        endLocation: "ne" as const,
        turns: 0,
        startOrientation: "in" as const,
        endOrientation: "in" as const,
      }),
      right: createMotionData({
        motionType: "pro" as const,
        rotationDirection: "cw" as const,
        startLocation: "s" as const,
        endLocation: "sw" as const,
        turns: 0,
        startOrientation: "in" as const,
        endOrientation: "in" as const,
      }),
    };
    expect(deriveWordFromBeats([step(1, "A", { motions: bothSkew })])).toBe("A");
  });
});
```

If `createSequenceData` in this test file requires more fields than `{ steps, stepPairings }`, pass the minimal extras its signature demands (check `src/lib/shared/foundation/domain/models/sequence-data.ts`).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/foundation/services/__tests__/strict-word-derivation.test.ts`
Expected: FAIL, words come back without braces.

- [ ] **Step 3: Implement in `word-deriver.ts`**

Add imports after the existing ones:

```ts
import { renderWordNotation, type WordUnit } from "../utils/word-notation";
import { isSkewedFrameStep } from "./skewed-frame";
```

Replace `deriveWordFromBeats`:

```ts
export function deriveWordFromBeats(steps: readonly Step[]): string {
  if (!steps || steps.length === 0) return "";
  const units: WordUnit[] = [];
  for (const step of steps) {
    const letter = step.letter ?? "";
    if (letter === "") continue;
    units.push({ letter, skewed: isSkewedFrameStep(step) });
  }
  return renderWordNotation(units);
}
```

In `deriveWord`, replace the stepPairings branch body:

```ts
  if (sequence.stepPairings && sequence.stepPairings.length > 0) {
    const derived = renderWordNotation(
      sequence.stepPairings
        .filter((pairing) => (pairing.letter ?? "") !== "")
        .map((pairing) => ({
          letter: pairing.letter as string,
          skewed: isSkewedFrameStep(pairing),
        }))
    );
    if (derived) return derived;
  }
```

In `deriveWordStatusFromSteps`, change `const tokens: string[] = [];` to `const tokens: WordUnit[] = [];`, change `tokens.push(token);` to `tokens.push({ letter: token, skewed: isSkewedFrameStep(step) });`, and change `word: tokens.join(""),` to `word: renderWordNotation(tokens),`.

In `deriveWordStatusFromStepPairings`, make the same three changes with `isSkewedFrameStep(pairing)`.

Update the `WordDerivationStatus.word` doc comment to: `/** Notation word in beat order, skewed spans in braces. Empty when nothing resolved. */`

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/foundation/services/__tests__/strict-word-derivation.test.ts tests/unit/combination/splice-builder.test.ts tests/unit/opus-persistence-audit/legacy-start-entry-composition.test.ts tests/unit/together-opposite-sequences.test.ts src/lib/shared/library/services/__tests__/sequence-persistence-normalizer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/foundation/services/word-deriver.ts src/lib/shared/foundation/services/__tests__/strict-word-derivation.test.ts
git commit -m "feat(word): derive words with skewed spans in braces

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Skewed-frame rows in the dataframe

**Files:**
- Modify: `scripts/generate-skewed-dataframe.ts`
- Regenerate: `static/data/pictographs/SkewedPictographDataframe.csv`
- Create: `tests/unit/pictograph/skewed-frame-dataframe.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/pictograph/skewed-frame-dataframe.test.ts
/**
 * SkewedPictographDataframe.csv must carry every skewed-frame beat (start
 * position zeta/eta) lettered exactly as the classifier letters it. The
 * generator writes the file; this pins the file to the code so neither drifts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  classifySkewedFrameLetter,
  SKEWED_FRAME_LETTERS,
  type SkewFrameLocation,
  type SkewFrameMotionType,
} from "$lib/shared/pictograph/skew/skewed-frame-letter";

const csvPath = resolve(__dirname, "../../../static/data/pictographs/SkewedPictographDataframe.csv");
const lines = readFileSync(csvPath, "utf8").split("\n").filter((line) => line.trim());
const header = lines[0]!.split(",");
const rows = lines.slice(1).map((line) => {
  const values = line.split(",");
  return Object.fromEntries(header.map((key, index) => [key, (values[index] ?? "").trim()]));
});
const frameRows = rows.filter((row) => /^(zeta|eta)\d+$/.test(row.startPlacement!));

const ORDER = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
function pathDirection(start: string, end: string): "cw" | "ccw" | "noRotation" {
  const delta = (ORDER.indexOf(end) - ORDER.indexOf(start) + 8) % 8;
  if (delta === 2) return "cw";
  if (delta === 6) return "ccw";
  return "noRotation";
}

describe("skewed-frame dataframe rows", () => {
  it("holds all 1152 skewed-frame beats plus the 5120 entry rows", () => {
    expect(frameRows.length).toBe(1152);
    expect(rows.length).toBe(6272);
  });

  it("letters each row exactly as the classifier does", () => {
    for (const row of frameRows) {
      const letter = classifySkewedFrameLetter({
        left: {
          motionType: row.blueMotionType as SkewFrameMotionType,
          startLocation: row.blueStartLocation as SkewFrameLocation,
          endLocation: row.blueEndLocation as SkewFrameLocation,
        },
        right: {
          motionType: row.redMotionType as SkewFrameMotionType,
          startLocation: row.redStartLocation as SkewFrameLocation,
          endLocation: row.redEndLocation as SkewFrameLocation,
        },
      });
      expect(letter, JSON.stringify(row)).toBe(row.letter);
    }
  });

  it("covers the 38-letter skewed alphabet and nothing else", () => {
    const letters = new Set(frameRows.map((row) => row.letter));
    expect([...letters].sort()).toEqual([...SKEWED_FRAME_LETTERS].sort());
  });

  it("is category 3 with no skew modifiers, ending in the frame", () => {
    for (const row of frameRows) {
      expect(row.category).toBe("3");
      expect(row.blueSkewDir).toBe("");
      expect(row.redSkewDir).toBe("");
      expect(row.blueSkewSteps).toBe("0");
      expect(row.redSkewSteps).toBe("0");
      expect(row.endPlacement).toMatch(/^(zeta|eta)\d+$/);
    }
  });

  it("uses the dataframe rotation convention: pro follows the hand path, anti opposes it", () => {
    const flip = { cw: "ccw", ccw: "cw", noRotation: "noRotation" } as const;
    for (const row of frameRows) {
      for (const hand of ["blue", "red"] as const) {
        const path = pathDirection(row[`${hand}StartLocation`]!, row[`${hand}EndLocation`]!);
        const type = row[`${hand}MotionType`];
        const expected = type === "pro" ? path : type === "anti" ? flip[path] : "noRotation";
        expect(row[`${hand}RotationDirection`], JSON.stringify(row)).toBe(expected);
        expect(row[`${hand}HandPath`]).toBe(
          type === "static" ? "static" : type === "dash" ? "dash" : path
        );
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/pictograph/skewed-frame-dataframe.test.ts`
Expected: FAIL, 0 frame rows.

- [ ] **Step 3: Extend the generator**

In `scripts/generate-skewed-dataframe.ts`:

First fix a pre-existing break: `parseRow` reads `row.leftMotionType`, `row.leftRotationDirection`, `row.leftStartLocation`, `row.leftEndLocation` and the four `right*` twins, but the hardcoded `header` array in `main()` names those columns `blueMotionType`, `blueRotationDirection`, `blueStartLocation`, `blueEndLocation`, `redMotionType`, `redRotationDirection`, `redStartLocation`, `redEndLocation`, so the script crashes on the first row (`Cannot read properties of undefined (reading 'toLowerCase')`). In `parseRow`, change the eight right-hand sides to read the `blue*`/`red*` keys while keeping the `left*`/`right*` property names on the returned object. With only that fix, the script reproduces the committed 5120-row CSV byte for byte (verified 2026-09-21), so the category 3 rows below are pure additions.

Add after the `fileURLToPath` import:

```ts
import {
  classifySkewedFrameLetter,
  type SkewFrameLocation,
  type SkewFrameMotionType,
} from "../src/lib/shared/pictograph/skew/skewed-frame-letter";
```

Change the `category` line in `SkewedRow` to:

```ts
  category: 1 | 2 | 3; // 1 = ends skewed (zeta/eta), 2 = both skew but ends normal, 3 = starts and ends in the skewed frame
```

Add before `// Convert row to CSV line`:

```ts
// ---------------------------------------------------------------------------
// Category 3: beats that start in the skewed frame (one hand cardinal, one
// intercardinal). Every hand option below is a legal move inside the frame,
// so 32 start pairs × 6 × 6 options = 1152 rows, lettered by the classifier.
// timing is "none" (the guide's split/tog/quarter vocabulary describes pure
// frames); direction is same/opp for two shifts and none otherwise.
// ---------------------------------------------------------------------------

interface FrameHandOption {
  motionType: SkewFrameMotionType;
  /** Steps of 45° around LOCATION_CYCLE, clockwise positive. */
  turn: 0 | 2 | -2 | 4;
}

const FRAME_HAND_OPTIONS: FrameHandOption[] = [
  { motionType: "pro", turn: 2 },
  { motionType: "pro", turn: -2 },
  { motionType: "anti", turn: 2 },
  { motionType: "anti", turn: -2 },
  { motionType: "static", turn: 0 },
  { motionType: "dash", turn: 4 },
];

function moveLocation(loc: Location, turn: number): Location {
  return LOCATION_CYCLE[(getLocationIndex(loc) + turn + 8) % 8];
}

function frameRotationDirection(option: FrameHandOption): string {
  if (option.motionType === "pro") return option.turn > 0 ? "cw" : "ccw";
  if (option.motionType === "anti") return option.turn > 0 ? "ccw" : "cw";
  return "noRotation";
}

function frameHandPath(option: FrameHandOption): HandPath {
  if (option.motionType === "static") return "static";
  if (option.motionType === "dash") return "dash";
  return option.turn > 0 ? "cw" : "ccw";
}

function frameDirection(blue: FrameHandOption, red: FrameHandOption): string {
  const blueShifts = blue.motionType === "pro" || blue.motionType === "anti";
  const redShifts = red.motionType === "pro" || red.motionType === "anti";
  if (!blueShifts || !redShifts) return "none";
  return blue.turn === red.turn ? "same" : "opp";
}

function generateSkewedFrameRows(): SkewedRow[] {
  const rows: SkewedRow[] = [];
  for (const blueStart of LOCATION_CYCLE) {
    for (const redStart of LOCATION_CYCLE) {
      if (isCardinal(blueStart) === isCardinal(redStart)) continue;
      for (const blue of FRAME_HAND_OPTIONS) {
        for (const red of FRAME_HAND_OPTIONS) {
          const blueEnd = moveLocation(blueStart, blue.turn);
          const redEnd = moveLocation(redStart, red.turn);
          const letter = classifySkewedFrameLetter({
            left: {
              motionType: blue.motionType,
              startLocation: blueStart as SkewFrameLocation,
              endLocation: blueEnd as SkewFrameLocation,
            },
            right: {
              motionType: red.motionType,
              startLocation: redStart as SkewFrameLocation,
              endLocation: redEnd as SkewFrameLocation,
            },
          });
          if (!letter) {
            throw new Error(
              `No skewed-frame letter for blue ${blue.motionType} ${blueStart}->${blueEnd}, red ${red.motionType} ${redStart}->${redEnd}`
            );
          }
          rows.push({
            letter,
            startPlacement: deriveEndPlacement(blueStart, redStart),
            endPlacement: deriveEndPlacement(blueEnd, redEnd),
            timing: "none",
            direction: frameDirection(blue, red),
            leftMotionType: blue.motionType,
            leftRotationDirection: frameRotationDirection(blue),
            leftStartLocation: blueStart,
            leftEndLocation: blueEnd,
            rightMotionType: red.motionType,
            rightRotationDirection: frameRotationDirection(red),
            rightStartLocation: redStart,
            rightEndLocation: redEnd,
            leftSkewDir: "",
            rightSkewDir: "",
            leftHandPath: frameHandPath(blue),
            rightHandPath: frameHandPath(red),
            leftSkewSteps: 0,
            rightSkewSteps: 0,
            category: 3,
          });
        }
      }
    }
  }
  return rows;
}
```

In `main()`, after `console.log(\`Generated ${allVariants.length} skewed variants\`);` add:

```ts
  const frameRows = generateSkewedFrameRows();
  allVariants.push(...frameRows);
  console.log(`Generated ${frameRows.length} skewed-frame rows (category 3)`);
```

In the category stats block add after the category 2 line:

```ts
  console.log(`  Category 3 (starts in frame): ${byCategory.get(3) || 0}`);
```

Update the file's header comment to mention: "Category 3 rows enumerate every beat that starts in the skewed frame (zeta/eta) and letter it with src/lib/shared/pictograph/skew/skewed-frame-letter.ts."

- [ ] **Step 4: Regenerate the CSV**

Run: `npx tsx scripts/generate-skewed-dataframe.ts`
Expected output includes `Generated 1152 skewed-frame rows (category 3)`, `Wrote 6272 rows`, `Category 3 (starts in frame): 1152`. If tsx cannot resolve the `../src/...` import of `Letter`, run with `npx tsx --tsconfig scripts/tsconfig.json scripts/generate-skewed-dataframe.ts` instead.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/pictograph/skewed-frame-dataframe.test.ts src/lib/features/fuse/services/__tests__/fused-word-derivation.test.ts tests/unit/pictograph-letter-lookup.test.ts`
Expected: PASS. Also run `git diff --stat static/data/pictographs/SkewedPictographDataframe.csv` and confirm only additions (5120 existing lines untouched, 1152 added).

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-skewed-dataframe.ts static/data/pictographs/SkewedPictographDataframe.csv tests/unit/pictograph/skewed-frame-dataframe.test.ts
git commit -m "feat(skew): emit the 1152 skewed-frame beats as category 3 dataframe rows

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Route every word assembly through the builder; rotate-45 fuse test

**Files:**
- Modify: `src/lib/shared/navigation/services/letter-deriver.ts`
- Modify: `src/lib/features/fuse/state/fuse-state.svelte.ts:2140-2146`
- Modify: `src/lib/features/create/shared/services/sequence-extender.ts:366`
- Modify: `src/lib/features/create/shared/services/step-operations/step-data-helpers.ts:35-45`
- Modify: `src/lib/features/create/shared/services/step-operations/rotation-direction-handler.ts:271-275`
- Modify: `src/lib/features/fuse/services/__tests__/fused-word-derivation.test.ts`
- Modify: `tests/unit/fuse/fuse-state.test.ts`

- [ ] **Step 1: Add the failing rotate-45 test**

In `src/lib/features/fuse/services/__tests__/fused-word-derivation.test.ts`:

Change the `makeSoloProp` signature to `function makeSoloProp(specs: StepSpec[], start: GridLocation, gridMode: GridMode = GridMode.DIAMOND): SoloPropData` and replace both `impliedGridMode: GridMode.DIAMOND,` lines inside it with `impliedGridMode: gridMode,`.

Add after the `W` constant:

```ts
const NE = "ne" as GridLocation;
const SE = "se" as GridLocation;
const SW = "sw" as GridLocation;
const NW = "nw" as GridLocation;
/** What the Rotate 45° rule does to a diamond hand: every point one step clockwise. */
const rotate45: Record<string, GridLocation> = { n: NE, e: SE, s: SW, w: NW };
```

Add after `rightSpecs`:

```ts
const rightSkewedSpecs: StepSpec[] = rightSpecs.map(([type, s, e, rot]) => [
  type,
  rotate45[s]!,
  rotate45[e]!,
  rot,
]);
```

Add a new test inside the existing `describe("fused sequence word derivation", ...)`:

```ts
  it("letters every beat of a rotate-45 fuse and writes the span in braces", async () => {
    injectRealCsvData();
    const fused = fuseSequences(
      makeSoloProp(leftSpecs, S),
      makeSoloProp(rightSkewedSpecs, SW, GridMode.BOX)
    );
    expect(fused.gridMode).toBe(GridMode.SKEWED);

    const derived = await deriveLettersForSequence(fused);
    const letters = derived.steps.map((step) => step.letter);
    expect(letters.every(Boolean), letters.join(",")).toBe(true);
    // Beat 1: blue pro s→e and red anti sw→se both travel counter-clockwise;
    // blue is ahead and is the pro hand, so the pro hand leads: U.
    expect(letters[0]).toBe("U");
    expect(derived.word).toBe(`{${letters.join("")}}`);
    expect(fusedDisplayName(derived.word)).toMatch(/^\{[^{}]+\}$/);
    // The start position is static/static in the frame and letters too.
    expect(derived.startPlacement?.letter).toMatch(/^[ζη]$/);
  });
```

If `fused.startPlacement` is not populated by `fuseSequences`, drop only the last assertion.

In `tests/unit/fuse/fuse-state.test.ts`, add next to the "blocks an incomplete derived result" test (reuse that test's `makeSequence`, `createState`, `createLoader` helpers and `StepData` import):

```ts
  it("keeps Greek letters intact in the built word", async () => {
    const source = makeSequence("source", 2);
    const state = createState(createLoader([source]), {
      deriveLetters: async (sequence) => ({
        ...sequence,
        steps: sequence.steps.map((step, index) => ({
          ...step,
          letter: (index === 0 ? "α" : "A") as StepData["letter"],
        })),
        word: "αA",
      }),
    });

    await state.initialize();
    const result = await state.buildFusedSequence();

    expect(result?.word).toBe("αA");
    expect(result?.name).toBe("αA");
  });
```

If `makeSequence("source", 2)` violates a minimum fuse length in that file's helpers, use the same length the neighbouring tests use.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/fuse/services/__tests__/fused-word-derivation.test.ts tests/unit/fuse/fuse-state.test.ts`
Expected: the rotate-45 test fails on `derived.word` (no braces yet); the Greek test fails with `"ΑA"`.

- [ ] **Step 3: Route the builders**

`src/lib/shared/navigation/services/letter-deriver.ts`: add `import { deriveWordFromBeats } from "$lib/shared/foundation/services/word-deriver";` and replace

```ts
  const word = letters.join("");
```

with

```ts
  const word = deriveWordFromBeats(stepsWithLetters);
```

and change the comment line above it from "Letter identity includes both alphabet and case…" to keep that sentence and add: "Skewed spans get their braces from the shared builder."

`src/lib/features/fuse/state/fuse-state.svelte.ts`: change the import on line 26 to `import { deriveWordFromBeats, getSequenceDisplayName } from "$lib/shared/foundation/services/word-deriver";` and replace

```ts
      const word = derived.steps
        .map((step) => step.letter)
        .join("")
        .toUpperCase();
```

with

```ts
      // The shared builder braces skewed spans. No case change: letter identity
      // includes alphabet and case (α is not Α).
      const word = deriveWordFromBeats(derived.steps);
```

`src/lib/features/create/shared/services/sequence-extender.ts`: add `import { deriveWordFromBeats } from "$lib/shared/foundation/services/word-deriver";` and replace `const word = newSteps.map((step) => step.letter ?? "").join("");` with `const word = deriveWordFromBeats(newSteps);`.

`src/lib/features/create/shared/services/step-operations/step-data-helpers.ts`: add the same import and replace

```ts
  const word = sequence.steps
    .map((step) => step.letter ?? "")
    .join("")
    .toUpperCase();
```

with `const word = deriveWordFromBeats(sequence.steps);`.

`src/lib/features/create/shared/services/step-operations/rotation-direction-handler.ts`: add the same import and replace

```ts
          const word = stepsWithLetter
            .map((step) => step.letter ?? "")
            .join("")
            .toUpperCase();
```

with `const word = deriveWordFromBeats(stepsWithLetter);`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/fuse tests/unit/fuse tests/unit/SequenceFuser.test.ts src/lib/features/create/shared`
Expected: PASS. If a create-side test asserted an uppercased word from lowercase fixture letters, update that fixture to canonical letters (the alphabet has no lowercase Latin letters) and note it in the commit body.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/navigation/services/letter-deriver.ts src/lib/features/fuse/state/fuse-state.svelte.ts src/lib/features/create/shared/services/sequence-extender.ts src/lib/features/create/shared/services/step-operations/step-data-helpers.ts src/lib/features/create/shared/services/step-operations/rotation-direction-handler.ts src/lib/features/fuse/services/__tests__/fused-word-derivation.test.ts tests/unit/fuse/fuse-state.test.ts
git commit -m "feat(fuse): build fused and edited words through the shared brace-aware builder

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Strip notation at index sites; placement groups for zeta/eta

**Files:**
- Modify: `src/lib/features/browse/sequences/display/services/browse-filter.ts:100-160`
- Modify: `src/lib/features/browse/sequences/navigation/services/navigator.ts:318-327`
- Modify: `src/lib/shared/browse/utils/kinetic-alphabet-sort.ts:88-113`
- Create: `src/lib/shared/browse/utils/__tests__/kinetic-alphabet-sort.test.ts`
- Modify: `src/lib/features/create/construct/option-picker/services/placement-analyzer.ts`
- Create: `src/lib/features/create/construct/option-picker/services/__tests__/placement-analyzer.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/shared/browse/utils/__tests__/kinetic-alphabet-sort.test.ts
import { describe, expect, it } from "vitest";
import { extractBaseLetter, sortSequencesByKineticAlphabet } from "../kinetic-alphabet-sort";

describe("extractBaseLetter", () => {
  it("reads the first letter, keeping dash variants and Type 6 case", () => {
    expect(extractBaseLetter("ABC")).toBe("A");
    expect(extractBaseLetter("W-AB")).toBe("W-");
    expect(extractBaseLetter("ζA")).toBe("ζ");
    expect(extractBaseLetter("")).toBe("");
  });

  it("looks through skew braces", () => {
    expect(extractBaseLetter("{USUS}")).toBe("U");
    expect(extractBaseLetter("{W-A}")).toBe("W-");
    expect(extractBaseLetter("{ζ}")).toBe("ζ");
  });
});

describe("sortSequencesByKineticAlphabet", () => {
  it("files a braced word under its first letter", () => {
    const sorted = sortSequencesByKineticAlphabet([
      { word: "{US}" },
      { word: "A" },
      { word: "T" },
    ]);
    expect(sorted.map((s) => s.word)).toEqual(["A", "T", "{US}"]);
  });
});
```

```ts
// src/lib/features/create/construct/option-picker/services/__tests__/placement-analyzer.test.ts
import { describe, expect, it } from "vitest";
import { GridPlacement, GridPlacementGroup } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PlacementAnalyzer } from "../placement-analyzer";

const analyzer = new PlacementAnalyzer();

describe("getEndPlacementGroup", () => {
  it("groups every placement family", () => {
    expect(analyzer.getEndPlacementGroup(GridPlacement.ALPHA1)).toBe(GridPlacementGroup.ALPHA);
    expect(analyzer.getEndPlacementGroup(GridPlacement.BETA3)).toBe(GridPlacementGroup.BETA);
    expect(analyzer.getEndPlacementGroup(GridPlacement.GAMMA9)).toBe(GridPlacementGroup.GAMMA);
    expect(analyzer.getEndPlacementGroup(GridPlacement.ZETA10)).toBe(GridPlacementGroup.ZETA);
    expect(analyzer.getEndPlacementGroup(GridPlacement.ETA2)).toBe(GridPlacementGroup.ETA);
    expect(analyzer.getEndPlacementGroup(null)).toBeNull();
  });
});

describe("getRotationRelation", () => {
  it("treats zeta and eta as 16-slot groups like gamma", () => {
    expect(analyzer.getRotationRelation(GridPlacement.ZETA1, GridPlacement.ZETA1)).toBe("exact");
    expect(analyzer.getRotationRelation(GridPlacement.ZETA1, GridPlacement.ZETA5)).toBe("quarter");
    expect(analyzer.getRotationRelation(GridPlacement.ZETA1, GridPlacement.ZETA9)).toBe("half");
    expect(analyzer.getRotationRelation(GridPlacement.ETA2, GridPlacement.ETA10)).toBe("half");
    expect(analyzer.getRotationRelation(GridPlacement.ZETA1, GridPlacement.ETA1)).toBeNull();
  });
});
```

Before writing the test, open `src/lib/shared/pictograph/grid/domain/enums/grid-enums.ts` and confirm `GridPlacementGroup` has `ZETA`, `ETA`, `TAU`, `TERRA` members and `GridPlacement` has `ZETA10` and `ETA2`; adjust the member names in the test only if they differ.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/browse/utils/__tests__/kinetic-alphabet-sort.test.ts src/lib/features/create/construct/option-picker/services/__tests__/placement-analyzer.test.ts`
Expected: FAIL (`{` returned as the base letter; zeta group null).

- [ ] **Step 3: Implement**

`src/lib/shared/browse/utils/kinetic-alphabet-sort.ts`: add `import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";` at the top and change the start of `extractBaseLetter` to:

```ts
export function extractBaseLetter(word: string): string {
  const bare = stripWordNotation(word ?? "");
  if (bare.length === 0) return "";

  const firstChar = bare[0]!;
```

and change `const secondChar = word[1];` to `const secondChar = bare[1];`.

`src/lib/features/browse/sequences/navigation/services/navigator.ts`: add `import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";` and replace the body of the `sequences.forEach((seq) => {` callback's first lines with:

```ts
    // Skip sequences without a valid word property
    if (!seq.word || typeof seq.word !== "string") {
      return;
    }
    // Skew braces mark a span, not a letter: index by the first letter inside.
    const bare = stripWordNotation(seq.word);
    if (bare.length === 0) {
      return;
    }

    // Handle letter types: "W" vs "W-" (type 3 letters)
    const firstChar = bare.charAt(0).toUpperCase();
    const secondChar = bare.charAt(1);
```

`src/lib/features/browse/sequences/display/services/browse-filter.ts`: add `import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";` and

- in the single-letter filter replace `seq.word[0]?.toUpperCase()` with `stripWordNotation(seq.word)[0]?.toUpperCase()`;
- in `filterByLetterRange` replace `const firstLetter = seq.word[0]?.toUpperCase();` with `const firstLetter = stripWordNotation(seq.word)[0]?.toUpperCase();`;
- in `filterByContainsLetters` replace `const word = seq.word.toLowerCase();` with `const word = stripWordNotation(seq.word).toLowerCase();` and in the sort replace both `a.word.toLowerCase().startsWith(searchTerm)` / `b.word.toLowerCase().startsWith(searchTerm)` with `stripWordNotation(a.word).toLowerCase().startsWith(searchTerm)` / `stripWordNotation(b.word).toLowerCase().startsWith(searchTerm)`.

`src/lib/features/create/construct/option-picker/services/placement-analyzer.ts`: replace `getEndPlacementGroup`'s three `if` lines with:

```ts
    if (placementStr.startsWith("alpha")) return GridPlacementGroup.ALPHA;
    if (placementStr.startsWith("beta")) return GridPlacementGroup.BETA;
    if (placementStr.startsWith("gamma")) return GridPlacementGroup.GAMMA;
    if (placementStr.startsWith("zeta")) return GridPlacementGroup.ZETA;
    if (placementStr.startsWith("eta")) return GridPlacementGroup.ETA;
    if (placementStr.startsWith("tau")) return GridPlacementGroup.TAU;
    if (placementStr.startsWith("terra")) return GridPlacementGroup.TERRA;
```

and update its doc comment to "Get the placement group (alpha, beta, gamma, zeta, eta, tau, terra) from a GridPlacement". In `getRotationRelation` replace

```ts
    const isGamma = startGroup === GridPlacementGroup.GAMMA;
    const totalPlacements = isGamma ? 16 : 8;
    const quarterStep = isGamma ? 4 : 2;
    const halfStep = isGamma ? 8 : 4;
```

with

```ts
    // Gamma, zeta, and eta have 16 numbered placements; alpha and beta have 8.
    const sixteenSlots =
      startGroup === GridPlacementGroup.GAMMA ||
      startGroup === GridPlacementGroup.ZETA ||
      startGroup === GridPlacementGroup.ETA;
    const totalPlacements = sixteenSlots ? 16 : 8;
    const quarterStep = sixteenSlots ? 4 : 2;
    const halfStep = sixteenSlots ? 8 : 4;
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/browse src/lib/features/browse tests/unit/browse src/lib/features/create/construct`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/browse/utils/kinetic-alphabet-sort.ts src/lib/shared/browse/utils/__tests__/kinetic-alphabet-sort.test.ts src/lib/features/browse/sequences/navigation/services/navigator.ts src/lib/features/browse/sequences/display/services/browse-filter.ts src/lib/features/create/construct/option-picker/services/placement-analyzer.ts src/lib/features/create/construct/option-picker/services/__tests__/placement-analyzer.test.ts
git commit -m "feat(browse): index braced words by their letters; zeta/eta placement groups

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Braces on the pictograph and the word glyph

**Files:**
- Create: `src/lib/shared/pictograph/tka-glyph/utils/skew-brace-layout.ts`
- Create: `src/lib/shared/pictograph/tka-glyph/utils/__tests__/skew-brace-layout.test.ts`
- Create: `src/lib/shared/pictograph/tka-glyph/components/SkewBraces.svelte`
- Modify: `src/lib/shared/pictograph/shared/components/PictographRenderer.svelte`
- Modify: `src/lib/shared/choreo-card/components/TKAWordGlyph.svelte`

- [ ] **Step 1: Write the failing layout test**

```ts
// src/lib/shared/pictograph/tka-glyph/utils/__tests__/skew-brace-layout.test.ts
import { describe, expect, it } from "vitest";
import { getSkewBraceLayout, SKEW_BRACE_GAP } from "../skew-brace-layout";

describe("getSkewBraceLayout", () => {
  it("puts the braces just outside the letter, centred on its height", () => {
    const layout = getSkewBraceLayout("S", { width: 100, height: 120 });
    expect(layout.openX).toBe(-SKEW_BRACE_GAP);
    expect(layout.closeX).toBe(100 + SKEW_BRACE_GAP);
    expect(layout.y).toBe(60);
    expect(layout.fontSize).toBeCloseTo(120 * 1.15);
  });

  it("clears the dash of a dash letter", () => {
    const plain = getSkewBraceLayout("W", { width: 100, height: 100 });
    const dashed = getSkewBraceLayout("W-", { width: 100, height: 100 });
    expect(dashed.closeX - plain.closeX).toBe(80);
    expect(dashed.openX).toBe(plain.openX);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/pictograph/tka-glyph/utils/__tests__/skew-brace-layout.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the layout helper and the component**

```ts
// src/lib/shared/pictograph/tka-glyph/utils/skew-brace-layout.ts
import { isDashLetter } from "./letter-image-getter";

/** Same numbers Dash.svelte uses so the closing brace clears a dash letter. */
const DASH_WIDTH = 70;
const DASH_GAP = 10;

/** Space between the letter image (or its dash) and a brace, in glyph units. */
export const SKEW_BRACE_GAP = 14;

/** Brace glyph height relative to the letter image height. */
export const SKEW_BRACE_FONT_SCALE = 1.15;

export interface SkewBraceLayout {
  /** x of the opening brace (text-anchor end). */
  readonly openX: number;
  /** x of the closing brace (text-anchor start). */
  readonly closeX: number;
  /** Vertical centre of the letter image. */
  readonly y: number;
  readonly fontSize: number;
}

export function getSkewBraceLayout(
  letter: string,
  letterDimensions: { width: number; height: number }
): SkewBraceLayout {
  const dashExtent = isDashLetter(letter) ? DASH_GAP + DASH_WIDTH : 0;
  return {
    openX: -SKEW_BRACE_GAP,
    closeX: letterDimensions.width + dashExtent + SKEW_BRACE_GAP,
    y: letterDimensions.height / 2,
    fontSize: letterDimensions.height * SKEW_BRACE_FONT_SCALE,
  };
}
```

```svelte
<!-- src/lib/shared/pictograph/tka-glyph/components/SkewBraces.svelte -->
<script lang="ts">
  // Braces around the TKA letter of a skewed-frame beat (one hand on a
  // cardinal point, the other on an intercardinal point). The word writes the
  // span as "{STS}"; the pictograph shows the same mark per beat. Same
  // positioning frame as TKAGlyph (translate 50,800), same visibility rules,
  // and the colour is carried on the element so exports keep it.
  import { getSkewBraceLayout } from "../utils/skew-brace-layout";

  const FILL_LIGHT = "#231f20";
  const FILL_DARK = "#d9d9d9";

  let {
    letter,
    letterDimensions,
    x = 50,
    y = 800,
    scale = 1,
    visible = true,
    previewMode = false,
    animateVisibility = false,
    darkMode = false,
  } = $props<{
    letter: string;
    letterDimensions: { width: number; height: number };
    x?: number;
    y?: number;
    scale?: number;
    visible?: boolean;
    previewMode?: boolean;
    animateVisibility?: boolean;
    darkMode?: boolean;
  }>();

  const layout = $derived(getSkewBraceLayout(letter, letterDimensions));
  const fill = $derived(darkMode ? FILL_DARK : FILL_LIGHT);
</script>

{#if visible || previewMode || animateVisibility}
  <g
    class="skew-braces"
    class:visible
    class:preview-mode={previewMode}
    data-skew-braces="true"
    transform="translate({x}, {y}) scale({scale})"
    font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"
    font-size={layout.fontSize}
    font-weight="500"
    {fill}
  >
    <text x={layout.openX} y={layout.y} text-anchor="end" dominant-baseline="central">&#123;</text>
    <text x={layout.closeX} y={layout.y} text-anchor="start" dominant-baseline="central">&#125;</text>
  </g>
{/if}

<style>
  .skew-braces {
    opacity: 0;
    transition: opacity var(--duration-fast) ease-out;
    pointer-events: none;
  }

  .skew-braces.visible {
    opacity: 1;
  }

  .skew-braces.preview-mode:not(.visible) {
    opacity: 0.4;
  }
</style>
```

- [ ] **Step 4: Mount it in `PictographRenderer.svelte`**

Add imports next to the `DirectionDot` import:

```ts
  import SkewBraces from "../../tka-glyph/components/SkewBraces.svelte";
  import { isSkewedFrameBeat } from "$lib/shared/foundation/services/skewed-frame";
```

Add a derived value next to `renderedGlyphs`:

```ts
  // A beat that starts or ends in a zeta/eta position wears braces around its
  // letter, matching the "{…}" span in the word.
  const skewedFrame = $derived(
    isVisibleMotion(pictograph.motions?.left) &&
      isVisibleMotion(pictograph.motions?.right) &&
      isSkewedFrameBeat(pictograph.motions.left, pictograph.motions.right)
  );
```

After the `{/each}` that closes the `renderedGlyphs` block (before `<!-- Turns Column (part of TKA) -->`), add:

```svelte
    {#if pictograph.letter && skewedFrame}
      <g opacity={glyphOpacity} transform="translate({tkaOffset}, 0)">
        <SkewBraces
          letter={pictograph.letter}
          {letterDimensions}
          visible={showTKA && !poseOnly}
          {previewMode}
          {animateVisibility}
          {darkMode}
        />
      </g>
    {/if}
```

`letterDimensions` is the existing `$derived(loadedLetterDimensions)` in that file.

- [ ] **Step 5: Word glyph**

In `src/lib/shared/choreo-card/components/TKAWordGlyph.svelte`:

Change the word-simplifier import to `import { compressWord, parseWordNotation, stripWordNotation, type CompressedSegment } from "$lib/shared/foundation/utils/word-simplifier";`.

Replace `const segments = $derived(word ? compressWord(word) : []);` with:

```ts
  // Glyph images exist for letters only; braces are drawn as text. A word
  // that is one whole skewed span (every rotate-45 fuse) gets a pair around
  // the row. Partial spans render their letters without braces here.
  const segments = $derived(word ? compressWord(stripWordNotation(word)) : []);
  const wholeWordSkewed = $derived.by(() => {
    const units = parseWordNotation(word ?? "");
    return units.length > 0 && units.every((unit) => unit.skewed);
  });
```

Inside the `.glyph-row` div, before `{#each segments as segment, segIdx}` add:

```svelte
    {#if wholeWordSkewed}
      <span class="skew-brace" style="font-size: {height * 0.95}px; margin-right: {height * LETTER_GAP_RATIO}px;">&#123;</span>
    {/if}
```

and after the matching `{/each}` add:

```svelte
    {#if wholeWordSkewed}
      <span class="skew-brace" style="font-size: {height * 0.95}px; margin-left: {height * LETTER_GAP_RATIO}px;">&#125;</span>
    {/if}
```

Add to the style block next to `.dash-bar`:

```css
  .skew-brace {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-weight: 500;
    line-height: 1;
    color: currentColor;
    flex-shrink: 0;
  }
```

- [ ] **Step 6: Run the unit test and the Svelte gate**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/pictograph/tka-glyph/utils/__tests__/skew-brace-layout.test.ts src/lib/shared/choreo-card/components/TKAWordGlyph.svelte.test.ts`
Expected: PASS (the second file runs only if it is in the default project; if vitest reports it excluded, that is expected).

Run: `npm run check:fast`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/pictograph/tka-glyph/utils/skew-brace-layout.ts src/lib/shared/pictograph/tka-glyph/utils/__tests__/skew-brace-layout.test.ts src/lib/shared/pictograph/tka-glyph/components/SkewBraces.svelte src/lib/shared/pictograph/shared/components/PictographRenderer.svelte src/lib/shared/choreo-card/components/TKAWordGlyph.svelte
git commit -m "feat(pictograph): draw skew braces on skewed-frame beats and whole-span words

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Reference docs

**Files:**
- Modify: `docs/reference/skew-notation.md` (sections 4, 8, 9)
- Modify: `docs/reference/letter-gap-families.md` ("The 45° case (skew)")

- [ ] **Step 1: Rewrite section 4's "The ambiguity in the frame" subsection**

Replace the subsection body (keep the heading) with a short statement that the ambiguity is resolved, then the six tables from the spec (`docs/superpowers/specs/2026-09-21-skewed-frame-lettering-design.md`, "The skewed alphabet"), copied verbatim, and one closing sentence: "The classifier is `src/lib/shared/pictograph/skew/skewed-frame-letter.ts`; the dataframe rows are category 3 in `SkewedPictographDataframe.csv`."

- [ ] **Step 2: Rewrite section 8**

Replace the three-route discussion with what shipped: the classifier as source of truth, category 3 rows, braces in the stored word (`A{STS}GA`), the strip helper at index sites, braces on pictographs and whole-span word glyphs, and the out-of-scope list from the spec.

- [ ] **Step 3: Rewrite section 9**

Replace the open questions with their answers as decided on 2026-09-21 (S T U V only for same-direction; D/J/M/P by start spacing plus crossed position; Type 2 by spacing pair; Type 3 as the Type 2 partner plus dash; Φ/Ψ only; ζ/η; braces in the word; no `$`; modifiers deferred).

- [ ] **Step 4: Point the gap-families doc at the alphabet**

In `docs/reference/letter-gap-families.md`, at the end of "## The 45° case (skew) — real but undescribed", add one paragraph: "Described as of 2026-09-21: the skewed alphabet in `docs/superpowers/specs/2026-09-21-skewed-frame-lettering-design.md` letters all 1152 skewed-frame beats with 38 letters, and the dataframe now carries them as category 3 rows." Change the heading to "## The 45° case (skew)".

- [ ] **Step 5: Commit**

```bash
git add docs/reference/skew-notation.md docs/reference/letter-gap-families.md docs/superpowers/specs/2026-09-21-skewed-frame-lettering-design.md docs/superpowers/plans/2026-09-21-skewed-frame-lettering.md
git commit -m "docs(skew): record the skewed alphabet and notation decisions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(The spec and plan files are created in the primary checkout first; copy them into the worktree before this commit if they are not already there.)

---

### Task 10: Full verification and finish

- [ ] **Step 1: Full unit run and gate in the worktree**

Run: `npx vitest run --config tests/config/vitest.config.ts`
Expected: all green. Fix any failure caused by this branch before continuing; report pre-existing failures separately with file names.

Run: `npm run check:fast`
Expected: 0 errors.

- [ ] **Step 2: Bring the branch current and finish from the primary checkout**

```powershell
Set-Location E:/tka-platform
git -C E:/worktrees/tka-platform/skewed-frame-lettering merge main
npm run wt:finish -- codex/skewed-frame-lettering --route /create/fuse
```

If `wt:finish` refuses because of a remaining link, run `cmd /c rmdir E:\worktrees\tka-platform\skewed-frame-lettering\node_modules` and retry. Never `git worktree remove` while the junction exists.

- [ ] **Step 3: Browser proof on the integrated main**

Start the `verify` preview from `E:/tka-platform/.claude/launch.json`, open `/create/fuse`, choose the Rotate 45° rule, let the preview derive, and capture: every beat lettered, the word/name in braces, braces on the pictographs. Read the console for `[letter-deriver]` warnings (there must be none) and for `derive-fused-word` errors (none).
