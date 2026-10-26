import { describe, expect, it } from "vitest";
import { guestLoopGate } from "#lib/shared/create/services/loop-guest-gate.js";
import { generateLOOPType } from "#lib/shared/create/services/loop-type-utils.js";
import { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";

const C = LOOPComponent;

function gate(components: Set<LOOPComponent>) {
  return guestLoopGate(generateLOOPType(components));
}

describe("guestLoopGate — category lock", () => {
  it("frees single rotated LOOP", () => {
    expect(gate(new Set([C.ROTATED])).locked).toBe(false);
    expect(guestLoopGate(LOOPType.ROTATED).locked).toBe(false);
  });

  it("frees rotated combos (mirrored+rotated)", () => {
    expect(gate(new Set([C.MIRRORED, C.ROTATED])).locked).toBe(false);
  });

  it("frees long rotated combos; length is never a guest lock", () => {
    expect(gate(new Set([C.MIRRORED, C.INVERTED, C.ROTATED])).locked).toBe(false);
  });

  it("locks non-rotated singles behind sign-up", () => {
    for (const c of [C.MIRRORED, C.FLIPPED, C.SWAPPED, C.INVERTED, C.REWOUND]) {
      expect(gate(new Set([c])).locked).toBe(true);
    }
  });
});
