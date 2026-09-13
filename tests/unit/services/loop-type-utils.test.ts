import { describe, expect, it } from "vitest";
import {
  generateLOOPType,
  parseLoopComponents,
  isImplementedCombo,
  canExtendCombo,
  buildLoopSpec,
  expanderMultiplier,
  specHasExpandInversion,
  resolveLoopConfig,
} from "$lib/shared/create/services/loop-type-utils";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";

const C = LOOPComponent;

describe("generateLOOPType", () => {
  it("maps every single component to its strict type", () => {
    expect(generateLOOPType(new Set([C.ROTATED]))).toBe(LOOPType.ROTATED);
    expect(generateLOOPType(new Set([C.MIRRORED]))).toBe(LOOPType.MIRRORED);
    expect(generateLOOPType(new Set([C.FLIPPED]))).toBe(LOOPType.FLIPPED);
    expect(generateLOOPType(new Set([C.SWAPPED]))).toBe(LOOPType.SWAPPED);
    expect(generateLOOPType(new Set([C.INVERTED]))).toBe(LOOPType.INVERTED);
    expect(generateLOOPType(new Set([C.REWOUND]))).toBe(LOOPType.STRICT_REWOUND);
  });

  it("maps the implemented triples, including mirrored+swapped+inverted and rotated+swapped+inverted", () => {
    expect(
      generateLOOPType(new Set([C.MIRRORED, C.INVERTED, C.ROTATED]))
    ).toBe(LOOPType.MIRRORED_INVERTED_ROTATED);
    expect(
      generateLOOPType(new Set([C.MIRRORED, C.ROTATED, C.SWAPPED]))
    ).toBe(LOOPType.MIRRORED_ROTATED_SWAPPED);
    expect(
      generateLOOPType(new Set([C.MIRRORED, C.SWAPPED, C.INVERTED]))
    ).toBe(LOOPType.MIRRORED_SWAPPED_INVERTED);
    // The former sole gap in the combo builder — every subset of
    // {MIRRORED, ROTATED, SWAPPED, INVERTED} is now implemented.
    expect(
      generateLOOPType(new Set([C.ROTATED, C.SWAPPED, C.INVERTED]))
    ).toBe(LOOPType.ROTATED_SWAPPED_INVERTED);
  });

  it("returns null for unmapped combos instead of silently coercing to ROTATED", () => {
    // The bug this locks out: mirrored+flipped+rewound used to bounce to ROTATED.
    expect(
      generateLOOPType(new Set([C.MIRRORED, C.FLIPPED, C.REWOUND]))
    ).toBeNull();
    // flipped and rewound combine with nothing
    expect(generateLOOPType(new Set([C.FLIPPED, C.MIRRORED]))).toBeNull();
    expect(generateLOOPType(new Set([C.REWOUND, C.ROTATED]))).toBeNull();
  });

  it("keeps the legacy ROTATED default for the empty set", () => {
    expect(generateLOOPType(new Set())).toBe(LOOPType.ROTATED);
  });

  it("round-trips every implemented combo through parseLoopComponents", () => {
    const combos: LOOPComponent[][] = [
      [C.ROTATED],
      [C.MIRRORED],
      [C.FLIPPED],
      [C.SWAPPED],
      [C.INVERTED],
      [C.REWOUND],
      [C.MIRRORED, C.INVERTED],
      [C.ROTATED, C.INVERTED],
      [C.SWAPPED, C.INVERTED],
      [C.MIRRORED, C.ROTATED],
      [C.MIRRORED, C.SWAPPED],
      [C.ROTATED, C.SWAPPED],
      [C.MIRRORED, C.INVERTED, C.ROTATED],
      [C.MIRRORED, C.ROTATED, C.SWAPPED],
      [C.MIRRORED, C.SWAPPED, C.INVERTED],
      [C.ROTATED, C.SWAPPED, C.INVERTED],
      [C.MIRRORED, C.ROTATED, C.INVERTED, C.SWAPPED],
    ];

    for (const combo of combos) {
      const input = new Set(combo);
      const loopType = generateLOOPType(input);
      expect(loopType, combo.join("+")).not.toBeNull();
      const parsed = parseLoopComponents(loopType);
      expect(parsed, combo.join("+")).toEqual(input);
    }
  });
});

describe("canExtendCombo", () => {
  it("blocks flipped and rewound from joining any other component", () => {
    expect(canExtendCombo(new Set([C.MIRRORED]), C.FLIPPED)).toBe(false);
    expect(canExtendCombo(new Set([C.MIRRORED]), C.REWOUND)).toBe(false);
    expect(canExtendCombo(new Set([C.FLIPPED]), C.MIRRORED)).toBe(false);
    expect(canExtendCombo(new Set([C.REWOUND]), C.ROTATED)).toBe(false);
  });

  it("allows building toward All Four through unmapped intermediates", () => {
    // {rotated, inverted, mirrored, swapped} (All Four) is reachable by adding
    // MIRRORED to the now-implemented {rotated, inverted, swapped} triple.
    expect(canExtendCombo(new Set([C.ROTATED, C.INVERTED]), C.SWAPPED)).toBe(true);
    expect(
      isImplementedCombo(new Set([C.ROTATED, C.INVERTED, C.SWAPPED]))
    ).toBe(true);
    expect(
      canExtendCombo(new Set([C.ROTATED, C.INVERTED, C.SWAPPED]), C.MIRRORED)
    ).toBe(true);
  });

  it("rotated+swapped+inverted is a real destination, not just a pass-through intermediate", () => {
    expect(canExtendCombo(new Set([C.ROTATED, C.SWAPPED]), C.INVERTED)).toBe(true);
    expect(
      generateLOOPType(new Set([C.ROTATED, C.SWAPPED, C.INVERTED]))
    ).toBe(LOOPType.ROTATED_SWAPPED_INVERTED);
  });

  it("allows every component from an empty selection", () => {
    for (const component of [
      C.ROTATED,
      C.MIRRORED,
      C.FLIPPED,
      C.SWAPPED,
      C.INVERTED,
      C.REWOUND,
    ]) {
      expect(canExtendCombo(new Set(), component)).toBe(true);
    }
  });
});

describe("buildLoopSpec", () => {
  it("defaults reproduce today's behavior: rotation at the chosen interval, all other components at interval 2, expand mode", () => {
    const wire = buildLoopSpec(new Set([C.ROTATED, C.MIRRORED, C.INVERTED]), { rotationInterval: 4 });
    expect(wire).not.toBeNull();
    expect(wire!.left!.rotated).toEqual({ period: 4 });
    expect(wire!.left!.mirrored).toEqual({
      period: 2,
      reflectionAxis: "north-south",
    });
    expect(wire!.left!.inverted).toEqual({ period: 2 });
    expect(wire!.right).toEqual(wire!.left);
  });

  it("carries inversion rhythm + overlay mode", () => {
    const wire = buildLoopSpec(new Set([C.MIRRORED, C.INVERTED]), {
      inversionInterval: 4,
      inversionMode: "overlay",
    });
    expect(wire!.left!.inverted).toEqual({ period: 4, mode: "overlay" });
  });

  it("carries any reflection axis independently of the component alias", () => {
    const diagonal = buildLoopSpec(new Set([C.MIRRORED]), {
      reflectionAxis: "northwest-southeast",
    });
    expect(diagonal!.left!.mirrored).toEqual({
      period: 2,
      reflectionAxis: "northwest-southeast",
    });

    const legacyFlipped = buildLoopSpec(new Set([C.FLIPPED]), {});
    expect(legacyFlipped!.left!.flipped).toEqual({
      period: 2,
      reflectionAxis: "east-west",
    });
  });

  it("returns null for unmapped combos (same gate as generateLOOPType)", () => {
    const wire = buildLoopSpec(new Set([C.MIRRORED, C.FLIPPED, C.REWOUND]), {});
    expect(wire).toBeNull();
  });

  it("expanderMultiplier: overlay does not multiply", () => {
    const wire = buildLoopSpec(new Set([C.ROTATED, C.MIRRORED, C.INVERTED]), {
      rotationInterval: 2, inversionInterval: 4, inversionMode: "overlay",
    })!;
    expect(expanderMultiplier(wire)).toBe(4); // rot x2 * mir x2; overlay inversion contributes x1
  });

  it("expanderMultiplier: rotation absorbed when it shares a period with swap/invert only (engine fuseableAtSamePeriod rule)", () => {
    // ROTATED_INVERTED, both at period 2: the engine's FusedExecutor absorbs
    // the rotation into the single fused stage (spec-executor.ts), so the
    // total multiplier is 2, NOT 4. (Task 4 discovered this — the naive
    // product-of-periods formula double-counts.)
    const wire = buildLoopSpec(new Set([C.ROTATED, C.INVERTED]), {
      rotationInterval: 2,
    })!;
    expect(expanderMultiplier(wire)).toBe(2);
  });

  it("expanderMultiplier: rotation stays a separate stage when mirror/flip shares its period", () => {
    // rot:2 + mir:2 + inv:2 (today's halved MIR): rotate stage x2, fused group x2 = 4.
    const wire = buildLoopSpec(new Set([C.ROTATED, C.MIRRORED, C.INVERTED]), {
      rotationInterval: 2,
    })!;
    expect(expanderMultiplier(wire)).toBe(4);
    // The stage arithmetic itself is unchanged: a spec that really does carry
    // rot:2 + mir:2 + inv:4 as three expand stages is x2 * x2 * x4 = 16.
    const rawTriple = {
      rotated: { period: 2 },
      mirrored: { period: 2, reflectionAxis: "north-south" as const },
      inverted: { period: 4 },
    };
    expect(expanderMultiplier({ left: rawTriple, right: rawTriple })).toBe(16);
  });

  it("expanderMultiplier: an expand inversion never reaches that x4 stage", () => {
    // buildLoopSpec coerces an expand inversion back to period 2
    // (effectiveInversionInterval), so the triple stays at x4 and a 16-step
    // request keeps a 4-step seed instead of collapsing to a 1-step one.
    const triple = buildLoopSpec(new Set([C.ROTATED, C.MIRRORED, C.INVERTED]), {
      rotationInterval: 2, inversionInterval: 4, inversionMode: "expand",
    })!;
    expect(triple.left?.inverted?.period).toBe(2);
    expect(expanderMultiplier(triple)).toBe(4);
  });
});

describe("resolveLoopConfig", () => {
  it("keeps the reflection axis independent of grid and legacy naming", () => {
    const diagonal = resolveLoopConfig("mirrored", "halved", {
      reflectionAxis: "northeast-southwest",
    });
    expect(diagonal.loopRhythm.reflectionAxis).toBe(
      "northeast-southwest"
    );
    expect(diagonal.loopSpecWire!.left!.mirrored.reflectionAxis).toBe(
      "northeast-southwest"
    );

    expect(
      resolveLoopConfig("flipped", "halved").loopRhythm.reflectionAxis
    ).toBe("east-west");
  });

  it("coerces quartered→halved for non-rotation loop types (period-2 transforms have no genuine period-4)", () => {
    // A period-2 transform asked as quartered extends to a literal double that
    // reduceToMinimalLoop strips back to half length — the "asked for 16, got 8"
    // deck bug. The coercion is the first line of defense.
    for (const lt of ["mirrored", "flipped", "swapped", "inverted", "mirrored_swapped", "swapped_inverted"]) {
      expect(resolveLoopConfig(lt, "quartered").period, lt).toBe("halved");
    }
  });

  it("honors quartered for rotation-bearing loop types", () => {
    expect(resolveLoopConfig("rotated", "quartered").period).toBe("quartered");
    expect(resolveLoopConfig("rotated_swapped", "quartered").period).toBe("quartered");
    expect(resolveLoopConfig("mirrored_rotated", "quartered").period).toBe("quartered");
    // ...and stays halved when halved is requested
    expect(resolveLoopConfig("mirrored_rotated", "halved").period).toBe("halved");
  });

  it("builds a wire spec whose expander multiplier is the TRUE period, not the raw 2/4", () => {
    // mirror+rotated HALVED: true period is LCM(mirror 2, rotate 2) = 4. The deck
    // used to divide the requested length by the raw 2 and overshoot to 2× (16→32);
    // the wire multiplier is 4, so the seed is length/4 and the card is exactly 16.
    const mr = resolveLoopConfig("mirrored_rotated", "halved");
    expect(expanderMultiplier(mr.loopSpecWire!)).toBe(4);
    // A lone period-2 transform stays at multiplier 2 (no overshoot).
    expect(expanderMultiplier(resolveLoopConfig("mirrored", "halved").loopSpecWire!)).toBe(2);
    // rotated quartered = genuine period 4.
    expect(expanderMultiplier(resolveLoopConfig("rotated", "quartered").loopSpecWire!)).toBe(4);
  });

  it("returns an undefined wire for combos with no implemented mapping", () => {
    // mirrored+flipped has no implemented LOOP type — falls back to the legacy
    // type+period path in the orchestrator, unchanged.
    expect(resolveLoopConfig("mirrored_flipped", "halved").loopSpecWire).toBeUndefined();
  });
});

describe("specHasExpandInversion", () => {
  it("is true when INVERTED is present with no mode (default expand)", () => {
    const wire = buildLoopSpec(new Set([C.ROTATED, C.INVERTED]), { rotationInterval: 2 })!;
    expect(specHasExpandInversion(wire)).toBe(true);
  });

  it("is false when INVERTED is overlay mode", () => {
    const wire = buildLoopSpec(new Set([C.MIRRORED, C.INVERTED]), {
      inversionInterval: 4,
      inversionMode: "overlay",
    })!;
    expect(specHasExpandInversion(wire)).toBe(false);
  });

  it("is false when INVERTED is absent entirely", () => {
    const wire = buildLoopSpec(new Set([C.ROTATED, C.MIRRORED]), { rotationInterval: 2 })!;
    expect(specHasExpandInversion(wire)).toBe(false);
  });
});
