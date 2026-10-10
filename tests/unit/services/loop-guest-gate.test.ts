import { describe, expect, it } from "vitest";
import { guestLoopGate, minBuildableLength } from "#lib/shared/create/services/loop-guest-gate.js";
import { buildLoopSpec, generateLOOPType } from "#lib/shared/create/services/loop-type-utils.js";
import { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";

const C = LOOPComponent;
const GUEST_CAP = 8;

const HALVED = { rotationInterval: 2, inversionInterval: 2, inversionMode: "expand" } as const;
const QUARTERED = { rotationInterval: 4, inversionInterval: 2, inversionMode: "expand" } as const;

function gate(components: Set<LOOPComponent>, rhythm: typeof HALVED | typeof QUARTERED) {
  return guestLoopGate(
    generateLOOPType(components),
    buildLoopSpec(components, rhythm),
    GUEST_CAP,
  );
}

describe("guestLoopGate — category lock", () => {
  it("frees single rotated LOOP", () => {
    expect(gate(new Set([C.ROTATED]), HALVED).locked).toBe(false);
  });

  it("frees rotated combos (mirrored+rotated) at halved", () => {
    expect(gate(new Set([C.MIRRORED, C.ROTATED]), HALVED).locked).toBe(false);
  });

  it("locks non-rotated singles behind sign-up", () => {
    for (const c of [C.MIRRORED, C.FLIPPED, C.SWAPPED, C.INVERTED, C.REWOUND]) {
      const result = gate(new Set([c]), HALVED);
      expect(result.locked).toBe(true);
      if (result.locked) expect(result.kind).toBe("category");
    }
  });
});

describe("guestLoopGate — length lock", () => {
  it("locks the quartered mirrored+inverted+rotated combo (needs 16 > 8 cap)", () => {
    const components = new Set([C.MIRRORED, C.INVERTED, C.ROTATED]);
    // sanity: this IS a rotated type (passes the category gate)
    const wire = buildLoopSpec(components, QUARTERED);
    expect(minBuildableLength(wire!)).toBe(16);

    const result = gate(components, QUARTERED);
    expect(result.locked).toBe(true);
    if (result.locked) expect(result.kind).toBe("length");
  });

  it("frees the same combo at halved (fits in 8)", () => {
    const components = new Set([C.MIRRORED, C.INVERTED, C.ROTATED]);
    expect(minBuildableLength(buildLoopSpec(components, HALVED)!)).toBeLessThanOrEqual(GUEST_CAP);
    expect(gate(components, HALVED).locked).toBe(false);
  });
});

describe("guestLoopGate — no gating when maxLength absent semantics", () => {
  it("category is checked before length (rotated-free wins the copy)", () => {
    // a rotated single is always free regardless of cap
    expect(guestLoopGate(LOOPType.ROTATED, null, GUEST_CAP).locked).toBe(false);
  });
});
