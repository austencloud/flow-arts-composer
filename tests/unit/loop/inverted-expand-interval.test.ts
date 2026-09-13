/**
 * Guard: an "adds length" (expand) inversion never reaches the generator at
 * period 4.
 *
 * The Generate tab's Inverted card exposes two knobs — "Invert when"
 * (At halfway / Every quarter) and "Build the sequence" (Adds length / On top).
 * Picking "Every quarter" + "Adds length" used to write `inverted: { period: 4 }`
 * straight into the wire spec.
 *
 * Inversion is an involution: pro↔anti applied twice restores the original
 * motions. A period-4 EXPAND inversion therefore emits [S, inv(S), S, inv(S)] —
 * a byte-identical double of the period-2 result that reduceToMinimalLoop
 * strips straight back — while its extra outer pass wraps the rest of the combo
 * so the detector sees only the inversion. Measured on origin/main @ c4be1619,
 * every mirrored / swapped / rotated + inverted combo then failed outright:
 *
 *   Unable to generate a valid swapped_inverted LOOP after 40 attempts
 *   (last failure: identity mismatch (expected inverted+swapped, detected inverted))
 *
 * OVERLAY inversion keeps its interval — it partitions the finished sequence
 * into `period` blocks and flips the odd ones in place, so blocks 0 and 2 carry
 * different content and period 4 is a real alternating pattern.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SequenceBuilder } from "@tka/sequence-engine/generation";
import { Period as EnginePeriod, loopSpecFromWire } from "@tka/sequence-engine/loop";
import {
  buildLoopSpec,
  effectiveInversionInterval,
  expanderMultiplier,
  parseLoopComponents,
  resolveLoopConfig,
} from "$lib/shared/create/services/loop-type-utils";
import { gateRhythm } from "$lib/shared/create/services/loop-rhythm-gating";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const CSV_PATH = path.join(
  REPO_ROOT,
  "static/data/pictographs/DiamondPictographDataframe.csv"
);

/** Every combo the Generate tab can build that contains INVERTED. */
const INVERTED_COMBOS = [
  LOOPType.INVERTED,
  LOOPType.MIRRORED_INVERTED,
  LOOPType.ROTATED_INVERTED,
  LOOPType.SWAPPED_INVERTED,
  LOOPType.MIRRORED_INVERTED_ROTATED,
  LOOPType.MIRRORED_SWAPPED_INVERTED,
  LOOPType.ROTATED_SWAPPED_INVERTED,
  LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED,
] as const;

function loadVariations(): unknown[] {
  const lines = readFileSync(CSV_PATH, "utf8").split("\n");
  const out: unknown[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i]!.split(",").map((s) => s.trim());
    if (c.length < 13 || !c[0]) continue;
    out.push({
      letter: c[0],
      startPosition: c[1]!,
      endPosition: c[2]!,
      timing: c[3]!,
      direction: c[4]!,
      leftMotion: {
        hand: "left",
        motionType: c[5]!,
        rotationDirection: c[6]!,
        startLocation: c[7]!,
        endLocation: c[8]!,
        startOrientation: "in",
        endOrientation: "in",
      },
      rightMotion: {
        hand: "right",
        motionType: c[9]!,
        rotationDirection: c[10]!,
        startLocation: c[11]!,
        endLocation: c[12]!,
        startOrientation: "in",
        endOrientation: "in",
      },
    });
  }
  return out;
}

function builder(): SequenceBuilder {
  const data = loadVariations();
  const index = new Map<string, unknown[]>();
  for (const p of data as Array<{ letter: string; startPosition: string }>) {
    const key = `${p.letter}:${p.startPosition}`;
    const bucket = index.get(key);
    if (bucket) bucket.push(p);
    else index.set(key, [p]);
  }
  return new SequenceBuilder({
    getVariations: (letter: string, position: string) =>
      index.get(`${letter}:${position}`) ?? [],
    getAllVariations: () => data,
  } as never);
}

describe("expand inversion interval", () => {
  it("coerces an expand inversion asked for at every-quarter back to halfway", () => {
    expect(
      effectiveInversionInterval({
        inversionInterval: 4,
        inversionMode: "expand",
      })
    ).toBe(2);
  });

  it("leaves an overlay inversion at every-quarter alone", () => {
    expect(
      effectiveInversionInterval({
        inversionInterval: 4,
        inversionMode: "overlay",
      })
    ).toBe(4);
  });

  it("defaults a mode-less rhythm to the expand rule", () => {
    expect(effectiveInversionInterval({ inversionInterval: 4 })).toBe(2);
  });

  it.each(INVERTED_COMBOS)(
    "writes period 2 into the %s wire spec in expand mode",
    (loopType) => {
      const wire = buildLoopSpec(parseLoopComponents(loopType), {
        rotationInterval: 2,
        inversionInterval: 4,
        inversionMode: "expand",
      });
      expect(wire?.left?.inverted?.period).toBe(2);
      expect(wire?.left?.inverted?.mode).toBeUndefined();
      expect(wire?.right?.inverted?.period).toBe(2);
    }
  );

  it.each(INVERTED_COMBOS)(
    "keeps period 4 in the %s wire spec in overlay mode",
    (loopType) => {
      const wire = buildLoopSpec(parseLoopComponents(loopType), {
        rotationInterval: 2,
        inversionInterval: 4,
        inversionMode: "overlay",
      });
      expect(wire?.left?.inverted?.period).toBe(4);
      expect(wire?.left?.inverted?.mode).toBe("overlay");
    }
  );

  it("echoes the coerced interval so the LOOP card cannot show a rhythm the generator will not use", () => {
    const resolved = resolveLoopConfig(LOOPType.SWAPPED_INVERTED, "halved", {
      inversionInterval: 4,
      inversionMode: "expand",
    });
    expect(resolved.loopRhythm.inversionInterval).toBe(2);
    expect(resolved.loopSpecWire?.left?.inverted?.period).toBe(2);
  });

  it("keeps the seed divisor at the halved multiplier instead of quadrupling it", () => {
    const components = parseLoopComponents(LOOPType.MIRRORED_INVERTED);
    const rhythm = {
      rotationInterval: 2 as const,
      inversionInterval: 4 as const,
      inversionMode: "expand" as const,
    };

    // Before the coercion this was 8 (mirror ×2 then a separate invert ×4),
    // which pushed a 16-step request down to a 2-step seed.
    expect(expanderMultiplier(buildLoopSpec(components, rhythm)!)).toBe(2);

    const gate = gateRhythm(components, rhythm, 16);
    expect(gate.ok).toBe(true);
    if (gate.ok) expect(gate.seedLength).toBe(8);
  });
});

describe("expand inversion at every-quarter still generates", () => {
  // The regression itself: each combo below threw
  // "identity mismatch (expected …, detected inverted)" on every one of the
  // engine's 40 internal attempts before the coercion.
  it.each(INVERTED_COMBOS)(
    "builds a 16-step %s LOOP with every-quarter + adds-length selected",
    (loopType) => {
      const resolved = resolveLoopConfig(loopType, "halved", {
        inversionInterval: 4,
        inversionMode: "expand",
      });
      const wire = resolved.loopSpecWire;
      expect(wire).toBeDefined();

      const multiplier = expanderMultiplier(wire!);
      expect(16 % multiplier).toBe(0);
      const seedLength = 16 / multiplier;
      expect(seedLength).toBeGreaterThanOrEqual(2);

      const result = builder().build({
        length: seedLength,
        gridMode: "diamond",
        level: 1,
        constraintPreset: "smooth",
        loop: {
          type: loopType,
          period: EnginePeriod.HALVED,
          useTargetedGeneration: true,
          loopSpec: loopSpecFromWire(wire!),
          requestedTotalLength: 16,
        },
      } as never);

      expect(result.sequence.length - 1).toBe(16);
    }
  );
});
