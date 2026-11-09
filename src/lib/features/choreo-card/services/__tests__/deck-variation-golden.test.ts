import { describe, it, expect } from "vitest";
import { rollVariation, BOOK_PATTERNS, TURN_PATTERNS } from "../deck-variation";
import { canonicalJSON } from "#lib/shared/foundation/utils/canonical-json.js";
import { cyrb128, makeRng } from "#lib/shared/foundation/utils/seeded-rng.js";

// Golden output for seeded deck variation rolls. The digest was captured from the
// pre-ReversalMatrix code (deck-variation's private tileFlags + resolvePattern);
// the reversal model migration must leave every seeded roll byte-identical. If a
// deliberate generator change moves this digest, bump generatorVersion with it.
const GOLDEN_DIGEST = "2224877297-3219453248-3158013169-2269343552";

function seededRolls(): unknown[] {
  const config = {
    reversalFrequency: 0.7,
    enabledReversals: BOOK_PATTERNS.map((p) => p.id),
    turnFrequency: 0.5,
    enabledTurnPatterns: TURN_PATTERNS.map((p) => p.id),
  };
  const out: unknown[] = [];
  for (let stepCount = 2; stepCount <= 16; stepCount++) {
    for (let k = 0; k < 40; k++) {
      const rng = makeRng(`golden:${stepCount}:${k}`);
      out.push([stepCount, k, rollVariation(stepCount, config, rng)]);
    }
  }
  return out;
}

describe("deck variation seeded golden output", () => {
  it("rolls the same variations for the same seeds", () => {
    const rolls = seededRolls();
    // Guard against a vacuous golden: reversals must actually be drawn.
    const withReversal = rolls.filter(
      (r) => (r as [number, number, { reversalSequence?: string } | null])[2]?.reversalSequence,
    );
    expect(withReversal.length).toBeGreaterThan(100);
    expect(cyrb128(canonicalJSON(rolls)).join("-")).toBe(GOLDEN_DIGEST);
  });
});
