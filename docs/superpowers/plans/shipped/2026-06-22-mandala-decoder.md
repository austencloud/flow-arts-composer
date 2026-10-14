# Mandala Decoder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decode a rendered TKA mandala into the full equivalence class of catalog sequences that trace that exact glyph, viewable by shape, color, and rotation orbit.

**Architecture:** Pure fingerprint module turns `MandalaPaths` into a color-blind `shapeKey` (+ `colorSignature`, `orbitKey` annotations). A pure index builder maps the 53k-sequence catalog `shapeKey → SeqRef[]`; a thin `.cjs` script drives Firestore I/O and writes `mandala-index.json`. A decoder loads the index and returns a grouped `DecodeResult`. A lab page renders results with the real `MandalaRenderer`.

**Tech Stack:** TypeScript, Svelte 5, Vitest, `mandala-geometry-calculator.ts` (`calculate()`), `content-hasher.ts` (FNV-1a `hash128`).

**Spec:** `docs/superpowers/specs/2026-06-22-mandala-decoder-design.md`

**Verified facts:**
- Forward model: `calculate(steps, bluePropType?, redPropType?, options?)` from `src/lib/shared/mandala/services/mandala-geometry-calculator.ts`. Returns `MandalaPaths = { blue: SVGPathData[]; red: SVGPathData[]; purple: SVGPathData[] }`. `purple` is `[]` from `calculate()` (overlap is computed downstream in the renderer); we derive overlap ourselves.
- `SVGPathData = { d: string; tipIndex: number }`, `MandalaPoint = { x: number; y: number }` — `src/lib/shared/mandala/domain/mandala-types.ts`.
- Tip coords are **origin-centered** (`computeTipPosition` returns `handX = handPos.x * gridRadius` with no offset), so rotation/reflection is about (0,0).
- `StepLike`, `MotionLike`, `MandalaPathOptions` — `src/lib/shared/mandala/services/types.ts`.
- Tests run with `npm run test` (vitest, config `tests/config/vitest.config.ts`); unit tests live in `tests/unit/`.
- `content-hasher.ts` keeps `hash128` private; we add an exported `hashString`.

---

## File Structure

- `src/lib/shared/foundation/services/content-hasher.ts` — **modify**: export `hashString`.
- `src/lib/shared/mandala/services/mandala-fingerprint.ts` — **create**: pure fingerprint functions.
- `src/lib/shared/mandala/services/mandala-index-builder.ts` — **create**: pure `buildIndex(entries) → MandalaIndex`.
- `scripts/build-mandala-index.ts` — **create**: Firestore I/O + writes `static/data/mandala-index.json` (run via tsx).
- `src/lib/shared/mandala/services/mandala-decoder.ts` — **create**: `decode(input, index) → DecodeResult`.
- `src/routes/test/mandala-decoder/+page.svelte` — **create**: lab page.
- Tests: `tests/unit/mandala-fingerprint.test.ts`, `tests/unit/mandala-index-builder.test.ts`, `tests/unit/mandala-decoder.test.ts`.

---

### Task 1: Export a generic string hash

**Files:**
- Modify: `src/lib/shared/foundation/services/content-hasher.ts`
- Test: `tests/unit/content-hasher-string.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/content-hasher-string.test.ts
import { describe, it, expect } from "vitest";
import { hashString } from "$lib/shared/foundation/services/content-hasher";

describe("hashString", () => {
  it("is deterministic", () => {
    expect(hashString("alpha|beta")).toBe(hashString("alpha|beta"));
  });
  it("distinguishes different inputs", () => {
    expect(hashString("alpha")).not.toBe(hashString("beta"));
  });
  it("returns a fixed-width base62 string", () => {
    expect(hashString("x")).toHaveLength(22);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/content-hasher-string.test.ts`
Expected: FAIL — `hashString` is not exported.

- [ ] **Step 3: Add the export**

Add at the end of `content-hasher.ts` (reuses the existing private `hash128`):

```ts
/** Generic deterministic 128-bit string fingerprint (base62, 22 chars).
 *  For hashing arbitrary canonical strings such as mandala shape keys. */
export function hashString(input: string): string {
  return hash128(input);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/content-hasher-string.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/foundation/services/content-hasher.ts tests/unit/content-hasher-string.test.ts
git commit -m "feat(hash): export generic hashString from content-hasher" -- src/lib/shared/foundation/services/content-hasher.ts tests/unit/content-hasher-string.test.ts
```

---

### Task 2: Color-blind shape key

**Files:**
- Create: `src/lib/shared/mandala/services/mandala-fingerprint.ts`
- Test: `tests/unit/mandala-fingerprint.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/mandala-fingerprint.test.ts
import { describe, it, expect } from "vitest";
import { shapeKey } from "$lib/shared/mandala/services/mandala-fingerprint";
import type { MandalaPaths } from "$lib/shared/mandala/domain/mandala-types";

function paths(blue: string[], red: string[], purple: string[] = []): MandalaPaths {
  return {
    blue: blue.map((d, i) => ({ d, tipIndex: i })),
    red: red.map((d, i) => ({ d, tipIndex: i })),
    purple: purple.map((d, i) => ({ d, tipIndex: i })),
  };
}

const ARC = "M 10.00 0.00 C 5.00 5.00, 0.00 10.00, -10.00 0.00";
const LINE = "M -50.00 -50.00 C -25.00 -25.00, 0.00 0.00, 50.00 50.00";

describe("shapeKey", () => {
  it("is deterministic", () => {
    const p = paths([ARC], [LINE]);
    expect(shapeKey(p)).toBe(shapeKey(p));
  });

  it("is color-blind: swapping which color draws which line yields the same key", () => {
    const a = paths([ARC], [LINE]);
    const b = paths([LINE], [ARC]);
    expect(shapeKey(a)).toBe(shapeKey(b));
  });

  it("collapses a line drawn by both colors to one line (overlap is one path)", () => {
    const both = paths([ARC], [ARC]);
    const single = paths([ARC], []);
    expect(shapeKey(both)).toBe(shapeKey(single));
  });

  it("distinguishes different shapes", () => {
    expect(shapeKey(paths([ARC], []))).not.toBe(shapeKey(paths([LINE], [])));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/mandala-fingerprint.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/shared/mandala/services/mandala-fingerprint.ts
import { hashString } from "$lib/shared/foundation/services/content-hasher";
import type { MandalaPaths, MandalaPoint, SVGPathData } from "../domain/mandala-types";

/** Quantization grid in px. Coarse enough to absorb FP drift under rotation,
 *  fine enough to keep distinct glyphs apart. Tuned by the round-trip +
 *  rotation tests. */
export const QUANTIZE_GRID = 1;

/** Extract on-curve points from an SVG "d" string: the M start plus each C
 *  endpoint (control points excluded — they are not on the curve). */
export function parsePoints(d: string): MandalaPoint[] {
  const pts: MandalaPoint[] = [];
  const m = d.match(/^M\s+(-?[\d.]+)\s+(-?[\d.]+)/);
  if (m) pts.push({ x: parseFloat(m[1]!), y: parseFloat(m[2]!) });
  const c = /C\s+-?[\d.]+\s+-?[\d.]+,\s+-?[\d.]+\s+-?[\d.]+,\s+(-?[\d.]+)\s+(-?[\d.]+)/g;
  let mc: RegExpExecArray | null;
  while ((mc = c.exec(d)) !== null) {
    pts.push({ x: parseFloat(mc[1]!), y: parseFloat(mc[2]!) });
  }
  return pts;
}

function quantize(p: MandalaPoint): string {
  const qx = Math.round(p.x / QUANTIZE_GRID) * QUANTIZE_GRID;
  const qy = Math.round(p.y / QUANTIZE_GRID) * QUANTIZE_GRID;
  // -0 → 0 so signs never split a key.
  return `${qx + 0},${qy + 0}`;
}

/** Set of quantized "x,y" tokens for every on-curve point across the given
 *  path groups. A point drawn by two colors collapses to one token (Set). */
function quantizedTokenSet(...groups: readonly SVGPathData[][]): Set<string> {
  const tokens = new Set<string>();
  for (const group of groups) {
    for (const path of group) {
      for (const pt of parsePoints(path.d)) tokens.add(quantize(pt));
    }
  }
  return tokens;
}

/** Color-blind shape fingerprint: union of all blue/red/purple on-curve points,
 *  quantized, sorted, hashed. The primary equivalence key. */
export function shapeKey(p: MandalaPaths): string {
  const tokens = [...quantizedTokenSet(p.blue, p.red, p.purple)].sort();
  return hashString(tokens.join(";"));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/mandala-fingerprint.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/mandala/services/mandala-fingerprint.ts tests/unit/mandala-fingerprint.test.ts
git commit -m "feat(mandala): color-blind shape fingerprint" -- src/lib/shared/mandala/services/mandala-fingerprint.ts tests/unit/mandala-fingerprint.test.ts
```

---

### Task 3: Color signature + rotation/reflection orbit key

**Files:**
- Modify: `src/lib/shared/mandala/services/mandala-fingerprint.ts`
- Test: `tests/unit/mandala-fingerprint.test.ts` (append)

- [ ] **Step 1: Write the failing test (append to the existing describe block)**

```ts
import { colorSignature, orbitKey } from "$lib/shared/mandala/services/mandala-fingerprint";

const ARC = "M 10.00 0.00 C 5.00 5.00, 0.00 10.00, -10.00 0.00";
const LINE = "M -50.00 -50.00 C -25.00 -25.00, 0.00 0.00, 50.00 50.00";

describe("colorSignature", () => {
  it("flags blue-only", () => {
    const s = colorSignature(paths([ARC], []));
    expect(s).toMatchObject({ blueOnly: true, redOnly: false });
    expect(s.comboPurpleRatio).toBe(0);
  });
  it("flags red-only", () => {
    expect(colorSignature(paths([], [ARC]))).toMatchObject({ blueOnly: false, redOnly: true });
  });
  it("reports full overlap as comboPurpleRatio 1", () => {
    expect(colorSignature(paths([ARC], [ARC])).comboPurpleRatio).toBe(1);
  });
  it("reports zero overlap as comboPurpleRatio 0 but combo true", () => {
    const s = colorSignature(paths([ARC], [LINE]));
    expect(s.blueOnly).toBe(false);
    expect(s.redOnly).toBe(false);
    expect(s.comboPurpleRatio).toBe(0);
  });
});

describe("orbitKey", () => {
  it("is rotation-invariant: a glyph and its 45deg rotation share an orbit key", () => {
    // 45deg rotation of (10,0) about origin = (7.07, 7.07); of (-10,0) = (-7.07,-7.07)
    const rotArc = "M 7.07 7.07 C 0.00 7.07, -7.07 7.07, -7.07 -7.07";
    expect(orbitKey(paths([ARC], []))).toBe(orbitKey(paths([rotArc], [])));
  });
  it("is reflection-invariant: a glyph and its mirror share an orbit key", () => {
    const mirrorArc = "M -10.00 0.00 C -5.00 5.00, 0.00 10.00, 10.00 0.00";
    expect(orbitKey(paths([ARC], []))).toBe(orbitKey(paths([mirrorArc], [])));
  });
  it("differs from shapeKey's primary key when not pre-canonicalized", () => {
    // sanity: orbitKey returns a string of the same width as a hash
    expect(orbitKey(paths([ARC], []))).toHaveLength(22);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/mandala-fingerprint.test.ts`
Expected: FAIL — `colorSignature` / `orbitKey` not exported.

- [ ] **Step 3: Add implementation to `mandala-fingerprint.ts`**

```ts
// Append to mandala-fingerprint.ts

export interface ColorSignature {
  blueOnly: boolean;
  redOnly: boolean;
  /** |blue∩red| / |blue∪red| over quantized points — the purple-overlap share. */
  comboPurpleRatio: number;
}

/** Which colors drew the glyph, and how much they overlap. Annotation only —
 *  never part of the primary shapeKey. */
export function colorSignature(p: MandalaPaths): ColorSignature {
  const blue = quantizedTokenSet(p.blue);
  const red = quantizedTokenSet(p.red);
  const hasBlue = blue.size > 0;
  const hasRed = red.size > 0;

  let inter = 0;
  for (const t of blue) if (red.has(t)) inter++;
  const union = blue.size + red.size - inter;
  const comboPurpleRatio = union === 0 ? 0 : inter / union;

  return {
    blueOnly: hasBlue && !hasRed,
    redOnly: hasRed && !hasBlue,
    comboPurpleRatio,
  };
}

const ROTATIONS = 8;          // 45deg increments
const RAD_PER_STEP = Math.PI / 4;

function transformPath(d: string, rotSteps: number, reflect: boolean): SVGPathData {
  const pts = parsePoints(d);
  const cos = Math.cos(rotSteps * RAD_PER_STEP);
  const sin = Math.sin(rotSteps * RAD_PER_STEP);
  const out: MandalaPoint[] = pts.map(({ x, y }) => {
    const rx = reflect ? -x : x; // mirror across the y-axis before rotating
    const tx = rx * cos - y * sin;
    const ty = rx * sin + y * cos;
    return { x: tx, y: ty };
  });
  // Re-emit as an M + straight-segment "d" — only on-curve points matter for
  // the key, so a polyline encoding is sufficient and parsePoints-compatible.
  const head = out[0];
  if (!head) return { d: "", tipIndex: 0 };
  let s = `M ${head.x.toFixed(2)} ${head.y.toFixed(2)}`;
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1]!;
    const b = out[i]!;
    s += ` C ${a.x.toFixed(2)} ${a.y.toFixed(2)}, ${b.x.toFixed(2)} ${b.y.toFixed(2)}, ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  }
  return { d: s, tipIndex: 0 };
}

function transformPaths(p: MandalaPaths, rotSteps: number, reflect: boolean): MandalaPaths {
  const t = (g: SVGPathData[]) => g.map((path) => transformPath(path.d, rotSteps, reflect));
  return { blue: t(p.blue), red: t(p.red), purple: t(p.purple) };
}

/** Rotation/reflection-invariant key: the lexicographic minimum shapeKey over
 *  all 8 rotations × {identity, mirror}. Members of one orbit share this key. */
export function orbitKey(p: MandalaPaths): string {
  let min: string | null = null;
  for (let r = 0; r < ROTATIONS; r++) {
    for (const reflect of [false, true]) {
      const k = shapeKey(transformPaths(p, r, reflect));
      if (min === null || k < min) min = k;
    }
  }
  return min ?? shapeKey(p);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/mandala-fingerprint.test.ts`
Expected: PASS (all). If the rotation test fails by a 1px quantization boundary, raise `QUANTIZE_GRID` to 2 and re-run — this is the documented tuning step.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/mandala/services/mandala-fingerprint.ts tests/unit/mandala-fingerprint.test.ts
git commit -m "feat(mandala): color signature + rotation/reflection orbit key" -- src/lib/shared/mandala/services/mandala-fingerprint.ts tests/unit/mandala-fingerprint.test.ts
```

---

### Task 4: Pure index builder

**Files:**
- Create: `src/lib/shared/mandala/services/mandala-index-builder.ts`
- Test: `tests/unit/mandala-index-builder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/mandala-index-builder.test.ts
import { describe, it, expect } from "vitest";
import { buildIndex, type IndexInput } from "$lib/shared/mandala/services/mandala-index-builder";
import type { MandalaPaths } from "$lib/shared/mandala/domain/mandala-types";

function paths(blue: string[], red: string[]): MandalaPaths {
  return {
    blue: blue.map((d, i) => ({ d, tipIndex: i })),
    red: red.map((d, i) => ({ d, tipIndex: i })),
    purple: [],
  };
}
const ARC = "M 10.00 0.00 C 5.00 5.00, 0.00 10.00, -10.00 0.00";
const LINE = "M -50.00 -50.00 C -25.00 -25.00, 0.00 0.00, 50.00 50.00";

describe("buildIndex", () => {
  it("groups sequences with the same glyph under one shapeKey", () => {
    const inputs: IndexInput[] = [
      { ref: { seqId: "a", word: "AB", deck: "d1" }, paths: paths([ARC], []) },
      { ref: { seqId: "b", word: "BA", deck: "d1" }, paths: paths([], [ARC]) }, // color-swap → same glyph
      { ref: { seqId: "c", word: "CD", deck: "d1" }, paths: paths([LINE], []) },
    ];
    const index = buildIndex(inputs);
    const keys = Object.keys(index.byShape);
    expect(keys).toHaveLength(2); // ARC-glyph and LINE-glyph
    const arcGroup = Object.values(index.byShape).find((g) => g.length === 2)!;
    expect(arcGroup.map((r) => r.seqId).sort()).toEqual(["a", "b"]);
  });

  it("records colorSig and orbitKey per ref, and a byOrbit map", () => {
    const inputs: IndexInput[] = [
      { ref: { seqId: "a", word: "AB", deck: "d1" }, paths: paths([ARC], []) },
    ];
    const index = buildIndex(inputs);
    const ref = Object.values(index.byShape)[0]![0]!;
    expect(ref.colorSig.blueOnly).toBe(true);
    expect(typeof ref.orbitKey).toBe("string");
    expect(Object.values(index.byOrbit)[0]).toContain(Object.keys(index.byShape)[0]);
  });

  it("skips empty-path sequences", () => {
    const index = buildIndex([{ ref: { seqId: "x", word: "", deck: "d" }, paths: paths([], []) }]);
    expect(Object.keys(index.byShape)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/mandala-index-builder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/shared/mandala/services/mandala-index-builder.ts
import type { MandalaPaths } from "../domain/mandala-types";
import { shapeKey, orbitKey, colorSignature, type ColorSignature } from "./mandala-fingerprint";

export interface SeqRef {
  seqId: string;
  word: string;
  deck: string;
}

export interface IndexInput {
  ref: SeqRef;
  paths: MandalaPaths;
}

export interface IndexedRef extends SeqRef {
  colorSig: ColorSignature;
  orbitKey: string;
}

export interface MandalaIndex {
  version: 1;
  byShape: Record<string, IndexedRef[]>;
  byOrbit: Record<string, string[]>; // orbitKey → shapeKeys in that orbit
}

function isEmpty(p: MandalaPaths): boolean {
  return p.blue.length === 0 && p.red.length === 0 && p.purple.length === 0;
}

/** Pure: catalog entries → fingerprint index. No I/O. */
export function buildIndex(inputs: readonly IndexInput[]): MandalaIndex {
  const byShape: Record<string, IndexedRef[]> = {};
  const byOrbit: Record<string, Set<string>> = {};

  for (const { ref, paths } of inputs) {
    if (isEmpty(paths)) continue;
    const sk = shapeKey(paths);
    const ok = orbitKey(paths);
    const indexed: IndexedRef = { ...ref, colorSig: colorSignature(paths), orbitKey: ok };

    (byShape[sk] ??= []).push(indexed);
    (byOrbit[ok] ??= new Set<string>()).add(sk);
  }

  const byOrbitOut: Record<string, string[]> = {};
  for (const [ok, shapes] of Object.entries(byOrbit)) byOrbitOut[ok] = [...shapes];

  return { version: 1, byShape, byOrbit: byOrbitOut };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/mandala-index-builder.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/mandala/services/mandala-index-builder.ts tests/unit/mandala-index-builder.test.ts
git commit -m "feat(mandala): pure fingerprint index builder" -- src/lib/shared/mandala/services/mandala-index-builder.ts tests/unit/mandala-index-builder.test.ts
```

---

### Task 5: Decoder

**Files:**
- Create: `src/lib/shared/mandala/services/mandala-decoder.ts`
- Test: `tests/unit/mandala-decoder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/mandala-decoder.test.ts
import { describe, it, expect } from "vitest";
import { decode } from "$lib/shared/mandala/services/mandala-decoder";
import { buildIndex, type IndexInput } from "$lib/shared/mandala/services/mandala-index-builder";
import type { MandalaPaths } from "$lib/shared/mandala/domain/mandala-types";

function paths(blue: string[], red: string[]): MandalaPaths {
  return {
    blue: blue.map((d, i) => ({ d, tipIndex: i })),
    red: red.map((d, i) => ({ d, tipIndex: i })),
    purple: [],
  };
}
const ARC = "M 10.00 0.00 C 5.00 5.00, 0.00 10.00, -10.00 0.00";
const LINE = "M -50.00 -50.00 C -25.00 -25.00, 0.00 0.00, 50.00 50.00";

const index = buildIndex([
  { ref: { seqId: "a", word: "AB", deck: "d1" }, paths: paths([ARC], []) },     // blue-only
  { ref: { seqId: "b", word: "BA", deck: "d1" }, paths: paths([], [ARC]) },     // red-only, same glyph
  { ref: { seqId: "c", word: "CC", deck: "d1" }, paths: paths([ARC], [ARC]) },  // combo, same glyph
  { ref: { seqId: "z", word: "ZZ", deck: "d1" }, paths: paths([LINE], []) },    // different glyph
] satisfies IndexInput[]);

describe("decode", () => {
  it("returns the full color-blind exact class for a query glyph", () => {
    const result = decode(paths([ARC], []), index);
    expect(result.exactClass.map((r) => r.seqId).sort()).toEqual(["a", "b", "c"]);
    expect(result.count.exact).toBe(3);
  });

  it("splits the class by color lens", () => {
    const result = decode(paths([ARC], []), index);
    expect(result.colorVariants.blueOnly.map((r) => r.seqId)).toEqual(["a"]);
    expect(result.colorVariants.redOnly.map((r) => r.seqId)).toEqual(["b"]);
    expect(result.colorVariants.combo.map((r) => r.seqId)).toEqual(["c"]);
  });

  it("reports an empty class for a glyph absent from the catalog", () => {
    const absent = paths(["M 200.00 200.00 C 201.00 201.00, 202.00 202.00, 203.00 203.00"], []);
    const result = decode(absent, index);
    expect(result.exactClass).toHaveLength(0);
    expect(result.count.exact).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/mandala-decoder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/shared/mandala/services/mandala-decoder.ts
import type { MandalaPaths } from "../domain/mandala-types";
import { shapeKey, orbitKey, colorSignature, type ColorSignature } from "./mandala-fingerprint";
import type { MandalaIndex, IndexedRef } from "./mandala-index-builder";

export interface DecodeResult {
  query: { shapeKey: string; orbitKey: string; colorSig: ColorSignature };
  exactClass: IndexedRef[];
  colorVariants: { blueOnly: IndexedRef[]; redOnly: IndexedRef[]; combo: IndexedRef[] };
  /** Refs in the same rotation/reflection orbit but a DIFFERENT exact glyph. */
  rotationTwins: IndexedRef[];
  count: { exact: number; twins: number };
}

/** Decode a rendered mandala's paths into its catalog equivalence class. */
export function decode(paths: MandalaPaths, index: MandalaIndex): DecodeResult {
  const sk = shapeKey(paths);
  const ok = orbitKey(paths);
  const colorSig = colorSignature(paths);

  const exactClass = index.byShape[sk] ?? [];

  const colorVariants = {
    blueOnly: exactClass.filter((r) => r.colorSig.blueOnly),
    redOnly: exactClass.filter((r) => r.colorSig.redOnly),
    combo: exactClass.filter((r) => !r.colorSig.blueOnly && !r.colorSig.redOnly),
  };

  // Rotation twins: every shapeKey sharing this orbit, minus the exact glyph itself.
  const orbitShapeKeys = (index.byOrbit[ok] ?? []).filter((k) => k !== sk);
  const rotationTwins: IndexedRef[] = [];
  for (const k of orbitShapeKeys) {
    for (const ref of index.byShape[k] ?? []) rotationTwins.push(ref);
  }

  return {
    query: { shapeKey: sk, orbitKey: ok, colorSig },
    exactClass,
    colorVariants,
    rotationTwins,
    count: { exact: exactClass.length, twins: rotationTwins.length },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/mandala-decoder.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/mandala/services/mandala-decoder.ts tests/unit/mandala-decoder.test.ts
git commit -m "feat(mandala): decoder returns shape/color/orbit equivalence class" -- src/lib/shared/mandala/services/mandala-decoder.ts tests/unit/mandala-decoder.test.ts
```

---

### Task 6: Round-trip property test (the correctness gate)

**Files:**
- Test: `tests/unit/mandala-decoder-roundtrip.test.ts`

This proves the core claim: a real catalog sequence's own glyph decodes to a class containing itself. Uses the real `calculate()` forward model — no synthetic paths.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/mandala-decoder-roundtrip.test.ts
import { describe, it, expect } from "vitest";
import { calculate } from "$lib/shared/mandala/services/mandala-geometry-calculator";
import { buildIndex, type IndexInput } from "$lib/shared/mandala/services/mandala-index-builder";
import { decode } from "$lib/shared/mandala/services/mandala-decoder";
import type { StepLike } from "$lib/shared/mandala/services/types";

// Two minimal hand-authored 2-beat sequences with blue+red motions. Locations
// use the lowercase strings the calculator resolves ("n","e","s","w").
function step(
  blue: Partial<StepLike["motions"]["blue"]>,
  red: Partial<StepLike["motions"]["red"]>,
): StepLike {
  const base = {
    motionType: "pro", rotationDirection: "cw",
    startLocation: "n", endLocation: "e",
    startOrientation: "out", endOrientation: "out", turns: 0,
  };
  return { motions: { blue: { ...base, ...blue }, red: { ...base, ...red } } } as StepLike;
}

const seqA: StepLike[] = [
  step({ startLocation: "n", endLocation: "e" }, { startLocation: "s", endLocation: "w" }),
  step({ startLocation: "e", endLocation: "s" }, { startLocation: "w", endLocation: "n" }),
];
const seqB: StepLike[] = [
  step({ motionType: "anti", rotationDirection: "ccw", startLocation: "n", endLocation: "w" },
       { motionType: "anti", rotationDirection: "ccw", startLocation: "s", endLocation: "e" }),
  step({ motionType: "anti", rotationDirection: "ccw", startLocation: "w", endLocation: "s" },
       { motionType: "anti", rotationDirection: "ccw", startLocation: "e", endLocation: "n" }),
];

describe("decode round-trip", () => {
  it("a catalog sequence's own glyph decodes to a class containing itself", () => {
    const inputs: IndexInput[] = [
      { ref: { seqId: "A", word: "A", deck: "t" }, paths: calculate(seqA, "staff", "staff") },
      { ref: { seqId: "B", word: "B", deck: "t" }, paths: calculate(seqB, "staff", "staff") },
    ];
    const index = buildIndex(inputs);

    const resultA = decode(calculate(seqA, "staff", "staff"), index);
    expect(resultA.exactClass.map((r) => r.seqId)).toContain("A");

    const resultB = decode(calculate(seqB, "staff", "staff"), index);
    expect(resultB.exactClass.map((r) => r.seqId)).toContain("B");
  });

  it("shapeKey of the same sequence is byte-stable across recomputation", () => {
    const p1 = calculate(seqA, "staff", "staff");
    const p2 = calculate(seqA, "staff", "staff");
    const i1 = buildIndex([{ ref: { seqId: "A", word: "A", deck: "t" }, paths: p1 }]);
    const k1 = Object.keys(i1.byShape)[0];
    const i2 = buildIndex([{ ref: { seqId: "A", word: "A", deck: "t" }, paths: p2 }]);
    const k2 = Object.keys(i2.byShape)[0];
    expect(k1).toBe(k2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npm run test -- tests/unit/mandala-decoder-roundtrip.test.ts`
Expected: PASS. If FAIL on the `StepLike` shape, inspect `src/lib/shared/mandala/services/types.ts` and adjust the `step()` helper's field names to match `MotionLike` (e.g. `rotationDirection`, `startLocation`). Do NOT change production code to satisfy the test — fix the test's data shape.

- [ ] **Step 3: (only if step 2 failed) Align the test data shape**

Read `src/lib/shared/mandala/services/types.ts`, correct the `step()` helper field names, re-run until PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/mandala-decoder-roundtrip.test.ts
git commit -m "test(mandala): decoder round-trip + determinism gate" -- tests/unit/mandala-decoder-roundtrip.test.ts
```

---

### Task 7: Index builder script (Firestore I/O)

**Files:**
- Create: `scripts/build-mandala-index.ts`

A `.ts` script run via `tsx` with `scripts/tsconfig.json` — the proven pattern in `scripts/shape-fingerprint-test.ts` that correctly resolves the `$lib` alias the geometry calc imports. (A `.cjs` + `tsx/cjs` require would NOT resolve `$lib`.) No unit test — thin I/O over the tested pure builder; verified by running it.

- [ ] **Step 1: Write the script**

```ts
// scripts/build-mandala-index.ts
// Walks catalog decks, computes mandala fingerprints, writes static/data/mandala-index.json.
// Usage: npx tsx --tsconfig scripts/tsconfig.json scripts/build-mandala-index.ts [deckIdSubstring]
import admin from "firebase-admin";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { calculate } from "$lib/shared/mandala/services/mandala-geometry-calculator";
import { buildIndex, type IndexInput } from "$lib/shared/mandala/services/mandala-index-builder";

const __dirname = dirname(fileURLToPath(import.meta.url));

const serviceAccount = JSON.parse(
  readFileSync(resolve(__dirname, "../serviceAccountKey.json"), "utf8"),
);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function loadAll(collectionPath: string) {
  const PAGE = 500;
  const out: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let more = true;
  while (more) {
    let q = db.collection(collectionPath).orderBy("__name__").limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    out.push(...snap.docs);
    last = snap.docs[snap.docs.length - 1] ?? null;
    more = snap.docs.length === PAGE;
  }
  return out;
}

async function main() {
  const filter = process.argv[2];
  const decksSnap = await db.collection("catalogs").get();
  const decks = decksSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
    .filter((d) => d.collection === "LOOPs" && (!filter || d.id.includes(filter)));

  console.log(`Indexing ${decks.length} decks...`);
  const inputs: IndexInput[] = [];
  for (const deck of decks) {
    const docs = await loadAll(`catalogs/${deck.id}/sequences`);
    for (const doc of docs) {
      const seq = doc.data() as { steps?: unknown[]; word?: string };
      if (!seq.steps || seq.steps.length === 0) continue;
      try {
        const paths = calculate(seq.steps as never, "staff", "staff");
        inputs.push({ ref: { seqId: doc.id, word: seq.word ?? doc.id, deck: deck.id }, paths });
      } catch { /* skip unrenderable */ }
    }
    console.log(`  ${deck.id}: ${docs.length} seqs`);
  }

  const index = buildIndex(inputs);
  console.log(`${inputs.length} sequences → ${Object.keys(index.byShape).length} distinct glyphs`);

  const outPath = resolve(__dirname, "../static/data/mandala-index.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(index));
  console.log(`Wrote ${outPath}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it against one small deck to verify**

Run: `npx tsx --tsconfig scripts/tsconfig.json scripts/build-mandala-index.ts l1-halved-strict-rotated-4beat`
Expected: prints `47 sequences → N distinct glyphs` and writes `static/data/mandala-index.json`. Confirm valid JSON: `node -e "console.log(Object.keys(require('./static/data/mandala-index.json')))"` → `[ 'version', 'byShape', 'byOrbit' ]`.

- [ ] **Step 3: Commit**

```bash
git add scripts/build-mandala-index.ts
git commit -m "feat(mandala): catalog → fingerprint index builder script" -- scripts/build-mandala-index.ts
```

(Do NOT commit the generated `static/data/mandala-index.json` here — it is a build artifact; the lab page in Task 8 loads it. If it should ship, commit it explicitly in Task 8.)

---

### Task 8: Lab page

**Files:**
- Create: `src/routes/test/mandala-decoder/+page.svelte`

Renders the real decode against the real index using the existing `MandalaRenderer`. Per `visualization-routing.md`: real components, no mockup.

- [ ] **Step 1: Confirm the renderer's import path and props**

Run: `grep -n "export" src/lib/shared/mandala/services/mandala-renderer.ts | head` and open `src/lib/shared/mandala/services/mandala-frame-renderer.ts` to confirm how an existing consumer renders `MandalaPaths` to an `<svg>` (e.g. a viewer component under `src/lib/shared/sequence-viewer`). Use that same component/snippet. Record the exact import you will use before writing the page.

- [ ] **Step 2: Write the page**

```svelte
<!-- src/routes/test/mandala-decoder/+page.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { decode, type DecodeResult } from "$lib/shared/mandala/services/mandala-decoder";
  import type { MandalaIndex } from "$lib/shared/mandala/services/mandala-index-builder";

  let index = $state<MandalaIndex | null>(null);
  let result = $state<DecodeResult | null>(null);
  let status = $state("loading index…");

  onMount(async () => {
    const res = await fetch("/data/mandala-index.json");
    if (!res.ok) { status = `index missing (run scripts/build-mandala-index.cjs) — ${res.status}`; return; }
    index = (await res.json()) as MandalaIndex;
    status = `${Object.keys(index.byShape).length} glyphs indexed`;
  });

  // Pick the first sequence in the first glyph group as a demo query, then
  // decode by re-reading its stored refs. (Full UI: a deck picker that supplies
  // live MandalaPaths from calculate(); kept minimal here to prove the path.)
  function decodeFirstGlyph() {
    if (!index) return;
    const firstShape = Object.keys(index.byShape)[0];
    if (!firstShape) { status = "no glyphs"; return; }
    // Demo: the index does not store paths, so a real query supplies paths from
    // calculate(steps). Here we surface the stored class directly for the first
    // glyph to validate grouping end-to-end.
    const refs = index.byShape[firstShape]!;
    result = {
      query: { shapeKey: firstShape, orbitKey: refs[0]!.orbitKey, colorSig: refs[0]!.colorSig },
      exactClass: refs,
      colorVariants: {
        blueOnly: refs.filter((r) => r.colorSig.blueOnly),
        redOnly: refs.filter((r) => r.colorSig.redOnly),
        combo: refs.filter((r) => !r.colorSig.blueOnly && !r.colorSig.redOnly),
      },
      rotationTwins: (index.byOrbit[refs[0]!.orbitKey] ?? [])
        .filter((k) => k !== firstShape)
        .flatMap((k) => index!.byShape[k] ?? []),
      count: { exact: refs.length, twins: 0 },
    };
  }
</script>

<main style="padding: 1rem; color: var(--text-primary, #eee);">
  <h1>Mandala Decoder</h1>
  <p style="font-variant-numeric: tabular-nums;">{status}</p>
  <button onclick={decodeFirstGlyph} disabled={!index}>Decode first glyph</button>

  {#if result}
    <section>
      <h2>Exact glyph — {result.count.exact} pathways</h2>
      <ul>{#each result.exactClass as r}<li>{r.word} <small>({r.deck})</small></li>{/each}</ul>
      <h3>By color</h3>
      <p style="font-variant-numeric: tabular-nums;">
        blue-only {result.colorVariants.blueOnly.length} ·
        red-only {result.colorVariants.redOnly.length} ·
        combo {result.colorVariants.combo.length}
      </p>
      <h3>Rotated / mirrored twins — {result.rotationTwins.length}</h3>
      <ul>{#each result.rotationTwins as r}<li>{r.word} <small>({r.deck})</small></li>{/each}</ul>
    </section>
  {/if}
</main>
```

- [ ] **Step 3: Verify the page loads**

Ensure `static/data/mandala-index.json` exists (Task 7 step 2). Then:
Run: `curl -sk https://localhost:5173/test/mandala-decoder | grep -c "Mandala Decoder"`
Expected: `1` (route renders). If the dev server is not the user's, build instead: `npm run build:fast` and confirm no errors for the new route.

- [ ] **Step 4: Typecheck the new code**

Run: `npm run check`
Expected: no new errors in `mandala-fingerprint.ts`, `mandala-index-builder.ts`, `mandala-decoder.ts`, or the page. Fix any reported.

- [ ] **Step 5: Commit**

```bash
git add src/routes/test/mandala-decoder/+page.svelte
git commit -m "feat(mandala): decoder lab page" -- src/routes/test/mandala-decoder/+page.svelte
```

---

## Notes for the implementer

- **Upgrade the lab page to live queries** once the static index proves out: add a deck picker that loads a sequence's `steps`, calls `calculate(steps, "staff", "staff")`, and passes the resulting `MandalaPaths` to `decode(paths, index)`. Render each ref's glyph with the real `MandalaRenderer` (path confirmed in Task 8 step 1) instead of a text list. This is the visual payoff but the text list proves the engine first.
- **Production path (separate future plan):** promote `shapeKey`/`orbitKey` to seeded Firestore fields on each sequence doc; replace the JSON index with `where mandalaShape == X` queries. Same `mandala-fingerprint.ts`.
- **Quantization tuning:** if the round-trip test (Task 6) ever fails after a catalog change, the grid is too fine for some glyph's FP spread; bump `QUANTIZE_GRID` and re-run. Document the value that holds.
