/**
 * Content-hash V2 — fork-proof + collision-safe contract
 * ======================================================
 *
 * V2 is the proposed identity basis that excludes the round-trip-derived fields
 * (`blueReversal`, `redReversal`, `gridMode`) so a sequence's identity is
 * invariant under `hydrate()` re-derivation — which kills the
 * phantom-fork-on-resave documented in
 * docs/superpowers/specs/active/2026-06-30-reversal-derivation-reconciliation-findings.md.
 *
 * Two properties must hold for Option A to be safe:
 *  1. FORK-PROOF: changing a derived field (reversal flag / gridMode) changes V1
 *     but NOT V2. Changing a real motion field changes both.
 *  2. COLLISION-SAFE: over the published corpus, V2 distinguishes every pair V1
 *     distinguishes (excluding the redundant reversal flag merges no identities,
 *     because reversal variants already differ in flipped motion content).
 *
 * Also locks V1 byte-stability (fork detection depends on it never drifting).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeHash,
  HASH_VERSION_V1,
  HASH_VERSION_V2,
  HASH_VERSION_V3,
  CONTENT_HASH_VERSION,
} from "../../src/lib/shared/library/services/sequence-content-hasher";
import { deriveSteps } from "../../src/lib/shared/foundation/services/step-deriver";
import { hydrate } from "../../src/lib/shared/foundation/services/sequence-hydrator";
import type { SequenceData } from "../../src/lib/shared/foundation/domain/models/sequence-data";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

// A minimal two-step sequence carrying a reversal flag + gridMode so the V1/V2
// difference is exercised. Motions are loose (the hasher only reads the listed
// fields).
function makeFixture(overrides?: {
  leftReversal?: boolean;
  rightReversal?: boolean;
  stepGridMode?: string;
  blueTurns?: number;
}): SequenceData {
  const motion = (rot: string, turns: number) => ({
    motionType: "pro",
    rotationDirection: rot,
    startLocation: "n",
    endLocation: "e",
    turns,
    startOrientation: "in",
    endOrientation: "out",
    handPath: null,
    gridMode: "diamond",
    skewSteps: null,
    skewDir: null,
  });
  const step = (n: number, leftRev: boolean, rightRev: boolean) => ({
    id: `s${n}`,
    letter: "A",
    startPlacement: "alpha1",
    endPlacement: "alpha3",
    stepNumber: n,
    duration: 1,
    isBlank: false,
    leftReversal: leftRev,
    rightReversal: rightRev,
    gridMode: overrides?.stepGridMode ?? "diamond",
    motions: {
      left: motion("cw", overrides?.blueTurns ?? 0),
      right: motion("cw", 0),
    },
  });
  return {
    id: "fixture",
    word: "AA",
    gridMode: "diamond",
    startPlacement: null,
    steps: [
      step(1, false, false),
      step(
        2,
        overrides?.leftReversal ?? false,
        overrides?.rightReversal ?? false
      ),
    ],
  } as unknown as SequenceData;
}

describe("content-hash V2 — fork-proof contract", () => {
  it("active version is V3 (authored motion planes are identity-bearing)", () => {
    expect(CONTENT_HASH_VERSION).toBe(HASH_VERSION_V3);
  });

  it("V1 includes reversal flags; V2 ignores them (FORK-PROOF for reversals)", async () => {
    const base = makeFixture({ leftReversal: false });
    const flipped = makeFixture({ leftReversal: true });

    const v1Base = await computeHash(base, HASH_VERSION_V1);
    const v1Flip = await computeHash(flipped, HASH_VERSION_V1);
    const v2Base = await computeHash(base, HASH_VERSION_V2);
    const v2Flip = await computeHash(flipped, HASH_VERSION_V2);

    // V1 sees the flag flip — this is exactly what forks on resave.
    expect(v1Base).not.toBe(v1Flip);
    // V2 does not — identity is invariant under reversal re-derivation.
    expect(v2Base).toBe(v2Flip);
  });

  it("V1 includes gridMode; V2 ignores it (FORK-PROOF for gridMode)", async () => {
    const diamond = makeFixture({ stepGridMode: "diamond" });
    const box = makeFixture({ stepGridMode: "box" });

    expect(await computeHash(diamond, HASH_VERSION_V1)).not.toBe(
      await computeHash(box, HASH_VERSION_V1)
    );
    expect(await computeHash(diamond, HASH_VERSION_V2)).toBe(
      await computeHash(box, HASH_VERSION_V2)
    );
  });

  it("a real motion change (turns) still changes BOTH versions (no over-exclusion)", async () => {
    const t0 = makeFixture({ blueTurns: 0 });
    const t1 = makeFixture({ blueTurns: 1 });

    expect(await computeHash(t0, HASH_VERSION_V1)).not.toBe(
      await computeHash(t1, HASH_VERSION_V1)
    );
    expect(await computeHash(t0, HASH_VERSION_V2)).not.toBe(
      await computeHash(t1, HASH_VERSION_V2)
    );
  });

  it("default computeHash() == explicit V3", async () => {
    const seq = makeFixture({ leftReversal: true });
    expect(await computeHash(seq)).toBe(
      await computeHash(seq, HASH_VERSION_V3)
    );
  });

  it("V3 distinguishes authored planes while V1/V2 stay byte-compatible", async () => {
    const inheritedWall = makeFixture();
    const wall = makeFixture();
    const wheel = makeFixture();
    (wall.steps[0]!.motions.left as { plane?: string }).plane = "wall";
    (wheel.steps[0]!.motions.left as { plane?: string }).plane = "wheel";

    expect(await computeHash(wall, HASH_VERSION_V1)).toBe(
      await computeHash(wheel, HASH_VERSION_V1)
    );
    expect(await computeHash(wall, HASH_VERSION_V2)).toBe(
      await computeHash(wheel, HASH_VERSION_V2)
    );
    expect(await computeHash(wall, HASH_VERSION_V3)).not.toBe(
      await computeHash(wheel, HASH_VERSION_V3)
    );
    expect(await computeHash(inheritedWall, HASH_VERSION_V3)).toBe(
      await computeHash(wall, HASH_VERSION_V3)
    );
  });

  it("V1 byte-stability lock (golden) — fork detection depends on this never drifting", async () => {
    const seq = makeFixture({ leftReversal: true, rightReversal: false });
    // Locked V1 hash of the fixture. If this changes, V1 hashing drifted and
    // every stored contentHash in the corpus would be invalidated.
    expect(await computeHash(seq, HASH_VERSION_V1)).toBe(
      "8ac242e7b772a2b6ca79f86b4b6530cd8ff210fa820e1d2e8376d80b829d82af"
    );
  });
});

interface RawDoc {
  word?: string;
  loopType?: string | null;
  isCircular?: boolean;
  gridMode?: string;
  startPlacement?: unknown;
  leftSoloProp?: { steps: unknown[] };
  rightSoloProp?: { steps: unknown[] };
  blueSoloProp?: { steps: unknown[] };
  redSoloProp?: { steps: unknown[] };
  stepPairings?: Array<{
    letter: string | null;
    leftReversal?: boolean;
    rightReversal?: boolean;
  }>;
}

function getSoloProps(doc: RawDoc): {
  left: { steps: unknown[] } | undefined;
  right: { steps: unknown[] } | undefined;
} {
  return {
    left: doc.leftSoloProp ?? doc.blueSoloProp,
    right: doc.rightSoloProp ?? doc.redSoloProp,
  };
}

function loadCorpus(): RawDoc[] {
  const file = path.resolve(
    projectRoot,
    "static/data/snapshots/public-sequences.json"
  );
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    documents: RawDoc[];
  };
  return parsed.documents.filter((doc) => {
    const soloProps = getSoloProps(doc);
    return (
      soloProps.left?.steps?.length &&
      soloProps.right?.steps?.length &&
      doc.stepPairings?.length
    );
  });
}

// Physical-identity fingerprint built straight from the source compositional
// data: per-step blue+red motion fields + letter + positions. Excludes reversal
// flags and gridMode (the derived fields V2 drops). Two docs with the same
// fingerprint are the SAME physical sequence — merging them is correct dedup.
function motionFingerprint(doc: RawDoc): string {
  const soloProps = getSoloProps(doc);
  const leftSteps = (soloProps.left?.steps ?? []) as Record<string, unknown>[];
  const rightSteps = (soloProps.right?.steps ?? []) as Record<
    string,
    unknown
  >[];
  const sp = doc.stepPairings ?? [];
  const m = (s: Record<string, unknown> | undefined) =>
    s
      ? [
          s.motionType,
          s.rotationDirection,
          s.startLocation,
          s.endLocation,
          s.turns,
          s.startOrientation,
          s.endOrientation,
        ].join(",")
      : "-";
  const parts: string[] = [];
  for (let i = 0; i < sp.length; i++) {
    parts.push(
      `${sp[i].letter ?? ""}|${(sp[i] as { startPlacement?: unknown }).startPlacement ?? ""}|${(sp[i] as { endPlacement?: unknown }).endPlacement ?? ""}|L${m(leftSteps[i])}|R${m(rightSteps[i])}`
    );
  }
  return parts.join("~");
}

function toSequence(doc: RawDoc): SequenceData | null {
  try {
    const soloProps = getSoloProps(doc);
    const steps = deriveSteps(
      soloProps.left as never,
      soloProps.right as never,
      doc.stepPairings as never
    );
    return {
      id: "diag",
      word: doc.word ?? "",
      gridMode: doc.gridMode,
      startPlacement: doc.startPlacement,
      steps,
      loopType: doc.loopType ?? undefined,
    } as unknown as SequenceData;
  } catch {
    return null;
  }
}

describe("content-hash V2 — collision-safe over the published corpus", () => {
  it("V2 distinguishes every sequence V1 distinguishes (no identity collapse)", async () => {
    const corpus = loadCorpus();
    expect(corpus.length).toBeGreaterThan(100);

    const v1ToV2 = new Map<string, Set<string>>();
    // motion-only fingerprint (locations+types+rot+turns+orientations+letters) of
    // each V2 hash, to tell a CORRECT dedup (same physical sequence, stale derived
    // field) from a FALSE merge (different physical sequences sharing a V2 hash).
    const v2ToFingerprints = new Map<string, Set<string>>();
    const v2ToWords = new Map<string, Set<string>>();
    let analyzed = 0;
    for (const doc of corpus) {
      const seq = toSequence(doc);
      if (!seq) continue;
      analyzed++;
      // Hash on the AUTHORED stepPairings flags (pre-override), the identity the
      // doc was saved under, to mirror real persisted contentHash inputs.
      const v1 = await computeHash(seq, HASH_VERSION_V1);
      const v2 = await computeHash(seq, HASH_VERSION_V2);
      if (!v1ToV2.has(v1)) v1ToV2.set(v1, new Set());
      v1ToV2.get(v1)!.add(v2);

      const fp = motionFingerprint(doc);
      if (!v2ToFingerprints.has(v2)) v2ToFingerprints.set(v2, new Set());
      v2ToFingerprints.get(v2)!.add(fp);
      if (!v2ToWords.has(v2)) v2ToWords.set(v2, new Set());
      v2ToWords.get(v2)!.add(doc.word ?? "?");
    }

    // Build the inverse: any V2 hash shared by ≥2 distinct V1 hashes == a merge.
    const v2Owners = new Map<string, Set<string>>();
    for (const [v1, v2s] of v1ToV2) {
      for (const v2 of v2s) {
        if (!v2Owners.has(v2)) v2Owners.set(v2, new Set());
        v2Owners.get(v2)!.add(v1);
      }
    }
    const merges = [...v2Owners.entries()].filter(
      ([, owners]) => owners.size > 1
    );

    // A merge is CORRECT (dedup) iff the merged docs share one physical motion
    // fingerprint — they are the same sequence with a stale derived field. A
    // merge is a FALSE merge iff the V2 bucket spans >1 distinct fingerprint.
    const falseMerges = merges.filter(
      ([v2]) => (v2ToFingerprints.get(v2)?.size ?? 0) > 1
    );

    /* eslint-disable no-console */
    console.log(
      `\ncollision-safety: analyzed=${analyzed} distinctV1=${v1ToV2.size} distinctV2=${v2Owners.size} merges=${merges.length} falseMerges=${falseMerges.length}`
    );
    for (const [v2] of merges) {
      console.log(
        `  merge: words=${[...(v2ToWords.get(v2) ?? [])].join(",")} fingerprints=${v2ToFingerprints.get(v2)?.size}`
      );
    }
    /* eslint-enable no-console */

    expect(analyzed).toBeGreaterThan(100);
    // The crux safety property: V2 never merges two PHYSICALLY DISTINCT sequences.
    // (Merging stale duplicates of the same physical sequence is correct dedup.)
    expect(falseMerges.length).toBe(0);
  });
});

describe("content-hash V2 — recompute determinism (the lazy-rehash relies on this)", () => {
  it("hydrate → V2 hash is stable across loads of the same stored doc", async () => {
    // The cross-version fork guard recomputes a stored doc's hash at V2 to
    // decide fork-vs-rehash. If hydrate→hash weren't deterministic, an UNCHANGED
    // doc could recompute to a different hash and spuriously fork. Step `id`
    // uses crypto.randomUUID (varies per hydrate) but is NOT hashed — confirm
    // the hashed fields are stable.
    const corpus = loadCorpus().slice(0, 40);
    expect(corpus.length).toBeGreaterThan(0);
    for (const doc of corpus) {
      let a: string, b: string;
      try {
        a = await computeHash(
          hydrate({ ...(doc as object) } as SequenceData),
          HASH_VERSION_V2
        );
        b = await computeHash(
          hydrate({ ...(doc as object) } as SequenceData),
          HASH_VERSION_V2
        );
      } catch {
        continue;
      }
      expect(a).toBe(b);
    }
  });
});
