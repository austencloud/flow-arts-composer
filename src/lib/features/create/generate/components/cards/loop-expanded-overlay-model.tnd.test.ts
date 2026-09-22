/**
 * The overlay model turns the hand mode's LOOP compatibility into UI facts.
 * Reflection hand modes narrow the axis picker and close Quartered; Quarter
 * Same disables the reflections and Swapped with a reason on each button.
 */
import { describe, expect, it } from "vitest";
import { LOOPComponent } from "$lib/features/create/generate/shared/domain/constants/loop-components";
import {
  buildLoopOverlayModel,
  type LoopOverlayModel,
  type LoopOverlayModelInput,
} from "./loop-expanded-overlay-model";

function input(
  overrides: Partial<LoopOverlayModelInput> = {}
): LoopOverlayModelInput {
  return {
    selectedComponents: new Set<LOOPComponent>(),
    isMultiSelectMode: false,
    rhythm: {
      rotationInterval: 2,
      inversionInterval: 2,
      inversionMode: "expand",
      reflectionAxis: "north-south",
    },
    rhythmControlsAvailable: true,
    detailComponent: null,
    ...overrides,
  };
}

// Order independent: the picker may list axes in any order.
function axisFlags(model: LoopOverlayModel): Record<string, boolean> {
  return Object.fromEntries(
    model.reflectionAxisOptions.map((option) => [
      option.value,
      option.disabled ?? false,
    ])
  );
}

const ALL_AXES_OPEN = {
  "north-south": false,
  "east-west": false,
  "northeast-southwest": false,
  "northwest-southeast": false,
};

describe("buildLoopOverlayModel with a hand mode", () => {
  it("Quarter Same disables the reflections and Swapped with a reason", () => {
    const model = buildLoopOverlayModel(input({ handRelationship: "QS" }));

    expect([...(model.disabledComponents ?? [])].sort()).toEqual(
      [
        LOOPComponent.FLIPPED,
        LOOPComponent.MIRRORED,
        LOOPComponent.SWAPPED,
      ].sort()
    );
    expect(model.disabledReasons[LOOPComponent.MIRRORED]).toBe(
      "Not compatible with Quarter Same hands"
    );
    expect(model.disabledReasons[LOOPComponent.SWAPPED]).toBe(
      "Not compatible with Quarter Same hands"
    );
    expect(model.disabledReasons[LOOPComponent.ROTATED]).toBeUndefined();
    expect(model.quarteredAvailable).toBe(true);
    expect(axisFlags(model)).toEqual(ALL_AXES_OPEN);
  });

  it("Quarter Opposite keeps only the diagonal axes and halved rotation", () => {
    const model = buildLoopOverlayModel(input({ handRelationship: "QO" }));

    expect(model.disabledComponents).toBeNull();
    expect(model.disabledReasons).toEqual({});
    expect(model.quarteredAvailable).toBe(false);
    expect(axisFlags(model)).toEqual({
      "north-south": true,
      "east-west": true,
      "northeast-southwest": false,
      "northwest-southeast": false,
    });
  });

  it("Together Opposite keeps only the cardinal axes and halved rotation", () => {
    const model = buildLoopOverlayModel(input({ handRelationship: "TO" }));

    expect(model.disabledComponents).toBeNull();
    expect(model.quarteredAvailable).toBe(false);
    expect(axisFlags(model)).toEqual({
      "north-south": false,
      "east-west": false,
      "northeast-southwest": true,
      "northwest-southeast": true,
    });
  });

  it("Free and an absent hand mode disable nothing", () => {
    for (const model of [
      buildLoopOverlayModel(input({ handRelationship: "free" })),
      buildLoopOverlayModel(input()),
    ]) {
      expect(model.disabledComponents).toBeNull();
      expect(model.disabledReasons).toEqual({});
      expect(model.quarteredAvailable).toBe(true);
      expect(axisFlags(model)).toEqual(ALL_AXES_OPEN);
    }
  });

  it("multi-select keeps the hand blocks beside the combo blocks and never disables a selected component", () => {
    const model = buildLoopOverlayModel(
      input({
        handRelationship: "QS",
        isMultiSelectMode: true,
        selectedComponents: new Set([
          LOOPComponent.ROTATED,
          LOOPComponent.MIRRORED,
        ]),
      })
    );
    const disabled = model.disabledComponents;

    expect(disabled).not.toBeNull();
    expect(disabled!.has(LOOPComponent.SWAPPED)).toBe(true);
    expect(disabled!.has(LOOPComponent.FLIPPED)).toBe(true);
    // A selected component stays clickable so the user can deselect it.
    expect(disabled!.has(LOOPComponent.MIRRORED)).toBe(false);
    expect(disabled!.has(LOOPComponent.ROTATED)).toBe(false);
    expect(model.disabledReasons[LOOPComponent.MIRRORED]).toBe(
      "Not compatible with Quarter Same hands"
    );
  });
});
