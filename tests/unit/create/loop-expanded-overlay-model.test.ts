import { describe, expect, it } from "vitest";

import { LOOPComponent } from "$lib/features/create/generate/shared/domain/constants/loop-components";
import {
  buildLoopOverlayModel,
  normalizeReflectionSelection,
  type LoopRhythmValue,
} from "$lib/features/create/generate/components/cards/loop-expanded-overlay-model";

const HALVED_RHYTHM: LoopRhythmValue = {
  rotationInterval: 2,
  inversionInterval: 2,
  inversionMode: "expand",
  reflectionAxis: "north-south",
};

function model(
  selectedComponents: Set<LOOPComponent>,
  overrides: Partial<Parameters<typeof buildLoopOverlayModel>[0]> = {}
) {
  return buildLoopOverlayModel({
    selectedComponents,
    isMultiSelectMode: false,
    rhythm: HALVED_RHYTHM,
    rhythmControlsAvailable: true,
    detailComponent: null,
    sequenceLength: 8,
    ...overrides,
  });
}

describe("LOOP expanded overlay model", () => {
  it("normalizes the legacy flipped component to reflection with an axis", () => {
    const normalized = normalizeReflectionSelection(
      new Set([LOOPComponent.FLIPPED, LOOPComponent.ROTATED])
    );

    expect(normalized).toEqual(
      new Set([LOOPComponent.MIRRORED, LOOPComponent.ROTATED])
    );
  });

  it("keeps compatible combo paths open and disables dead ends", () => {
    const result = model(new Set([LOOPComponent.REWOUND]), {
      isMultiSelectMode: true,
    });

    expect(result.disabledComponents?.has(LOOPComponent.ROTATED)).toBe(true);
    expect(result.disabledComponents?.has(LOOPComponent.REWOUND)).toBe(false);
    expect(result.isImplemented).toBe(true);
  });

  it("surfaces invalid quartered rhythm without losing its configuration", () => {
    const result = model(new Set([LOOPComponent.ROTATED]), {
      rhythm: { ...HALVED_RHYTHM, rotationInterval: 4 },
      sequenceLength: 6,
      detailComponent: LOOPComponent.ROTATED,
    });

    expect(result.rhythmGate).toEqual({
      ok: false,
      reason: "6 beats can't split into 4 equal parts",
    });
    expect(result.wordMathText).toBe("6 beats can't split into 4 equal parts");
    expect(result.detailView).toBe("detail-rotated");
    expect(result.configurableComponents).toContain(LOOPComponent.ROTATED);
  });

  it("keeps guest category locks ahead of the Apply action", () => {
    const result = model(new Set([LOOPComponent.INVERTED]), {
      isMultiSelectMode: true,
      guestMaxLength: 8,
    });

    expect(result.guestLock.locked).toBe(true);
    expect(result.buttonText).toBe("Sign Up to Unlock");
  });

  it("uses the selected reflection axis and inversion mode in live copy", () => {
    const reflection = model(new Set([LOOPComponent.MIRRORED]), {
      isMultiSelectMode: true,
      rhythm: {
        ...HALVED_RHYTHM,
        reflectionAxis: "east-west",
      },
    });
    const inversion = model(new Set([LOOPComponent.INVERTED]), {
      rhythm: {
        ...HALVED_RHYTHM,
        inversionInterval: 4,
        inversionMode: "overlay",
      },
    });

    expect(reflection.buttonText).toBe("Apply Flipped");
    expect(inversion.inversionCaption).toBe(
      "Same hand placements — props flip spin direction every quarter."
    );
  });
});
