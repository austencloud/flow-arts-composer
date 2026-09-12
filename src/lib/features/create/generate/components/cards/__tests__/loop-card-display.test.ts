import { describe, it, expect } from "vitest";
import {
  buildLoopCardDisplay,
  describeLoopRhythm,
  resolveEffectiveAxis,
} from "../loop-card-display";
import {
  LOOPType,
  Period,
} from "$lib/shared/foundation/domain/models/generation/circular-models";
import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import { buildCardDescriptors } from "../../../shared/services/card-configurator";
import { DifficultyLevel } from "../../../shared/domain/models/generate-models";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { UIGenerationConfig } from "../../../state/generate-config.svelte";

describe("buildLoopCardDisplay — off", () => {
  it("renders no icon at all when the loop is off", () => {
    const display = buildLoopCardDisplay({
      loopEnabled: false,
      // The config keeps its last loop type; a stale value must not light up.
      loopType: LOOPType.MIRRORED_ROTATED,
      period: Period.QUARTERED,
    });
    expect(display.iconComponents.size).toBe(0);
    expect(display.selectedComponents.size).toBe(0);
    expect(display.rotationPeriod).toBeUndefined();
    expect(display.effectiveAxis).toBeNull();
  });
});

describe("buildLoopCardDisplay — rotation period", () => {
  it("selects the quartered rotation for a rotated LOOP", () => {
    const display = buildLoopCardDisplay({
      loopEnabled: true,
      loopType: LOOPType.ROTATED,
      period: Period.QUARTERED,
    });
    expect(display.rotationPeriod).toBe(Period.QUARTERED);
    expect(display.iconComponents.has(LOOPComponent.ROTATED)).toBe(true);
  });

  it("gates a stale quartered value on a non-rotated LOOP back to halved", () => {
    const display = buildLoopCardDisplay({
      loopEnabled: true,
      loopType: LOOPType.SWAPPED,
      period: Period.QUARTERED,
    });
    // Nothing rotates, so there is no rotation glyph to mislabel.
    expect(display.rotationPeriod).toBeUndefined();
    expect(display.iconComponents.has(LOOPComponent.ROTATED)).toBe(false);
  });

  it("gates quartered to halved on a reflection LOOP that also rotates nothing", () => {
    const display = buildLoopCardDisplay({
      loopEnabled: true,
      loopType: LOOPType.MIRRORED_INVERTED,
      period: Period.QUARTERED,
    });
    expect(display.rotationPeriod).toBeUndefined();
  });

  it("shows halved when a reflection relationship coerces quartered rotation", () => {
    const display = buildLoopCardDisplay({
      loopEnabled: true,
      loopType: LOOPType.ROTATED,
      period: Period.QUARTERED,
      handRelationship: "mirrored",
    });
    expect(display.rotationPeriod).toBe(Period.HALVED);
  });

  it("keeps quartered for a relationship that commutes with rotation", () => {
    const display = buildLoopCardDisplay({
      loopEnabled: true,
      loopType: LOOPType.ROTATED,
      period: Period.QUARTERED,
      handRelationship: "unison",
    });
    expect(display.rotationPeriod).toBe(Period.QUARTERED);
  });

  it("keeps halved when halved is asked for", () => {
    const display = buildLoopCardDisplay({
      loopEnabled: true,
      loopType: LOOPType.ROTATED,
      period: Period.HALVED,
    });
    expect(display.rotationPeriod).toBe(Period.HALVED);
  });
});

describe("buildLoopCardDisplay — reflection axis", () => {
  it("uses the flipped (up-down) glyph for an east-west axis", () => {
    const display = buildLoopCardDisplay({
      loopEnabled: true,
      loopType: LOOPType.MIRRORED,
      reflectionAxis: "east-west",
    });
    expect(display.iconComponents.has(LOOPComponent.FLIPPED)).toBe(true);
    expect(display.iconComponents.has(LOOPComponent.MIRRORED)).toBe(false);
    // The drawer must still reopen on the stored component + axis.
    expect(display.selectedComponents.has(LOOPComponent.MIRRORED)).toBe(true);
    expect(display.effectiveAxis).toBe("east-west");
  });

  it("uses the mirrored (left-right) glyph for a north-south axis", () => {
    const display = buildLoopCardDisplay({
      loopEnabled: true,
      loopType: LOOPType.FLIPPED,
      reflectionAxis: "north-south",
    });
    expect(display.iconComponents.has(LOOPComponent.MIRRORED)).toBe(true);
    expect(display.iconComponents.has(LOOPComponent.FLIPPED)).toBe(false);
    expect(display.selectedComponents.has(LOOPComponent.FLIPPED)).toBe(true);
  });

  it("leaves the parsed component alone on a diagonal axis", () => {
    // The component remains the Reflection identity; the shared icon strip
    // rotates it from effectiveAxis.
    const display = buildLoopCardDisplay({
      loopEnabled: true,
      loopType: LOOPType.MIRRORED,
      reflectionAxis: "northeast-southwest",
    });
    expect(display.iconComponents.has(LOOPComponent.MIRRORED)).toBe(true);
    expect(display.iconComponents.has(LOOPComponent.FLIPPED)).toBe(false);
    expect(display.effectiveAxis).toBe("northeast-southwest");
  });

  it("falls back to the legacy axis implied by the loop type", () => {
    expect(
      resolveEffectiveAxis(new Set([LOOPComponent.FLIPPED]), undefined)
    ).toBe("east-west");
    expect(
      resolveEffectiveAxis(new Set([LOOPComponent.MIRRORED]), undefined)
    ).toBe("north-south");
    expect(resolveEffectiveAxis(new Set([LOOPComponent.ROTATED]), undefined)).toBeNull();
  });
});

describe("buildLoopCardDisplay — inversion", () => {
  it("reaches the quartered inversion icon at interval 4", () => {
    const display = buildLoopCardDisplay({
      loopEnabled: true,
      loopType: LOOPType.INVERTED,
      inversionInterval: 4,
    });
    expect(display.inversionPeriod).toBe(Period.QUARTERED);
  });

  it("defaults inversion to halved", () => {
    const display = buildLoopCardDisplay({
      loopEnabled: true,
      loopType: LOOPType.INVERTED,
    });
    expect(display.inversionPeriod).toBe(Period.HALVED);
  });

  it("reports no inversion period when nothing inverts", () => {
    const display = buildLoopCardDisplay({
      loopEnabled: true,
      loopType: LOOPType.ROTATED,
      inversionInterval: 4,
    });
    expect(display.inversionPeriod).toBeUndefined();
  });

  it("routes overlay-mode inversion into overlayComponents", () => {
    const display = buildLoopCardDisplay({
      loopEnabled: true,
      loopType: LOOPType.ROTATED_INVERTED,
      inversionMode: "overlay",
    });
    expect(display.overlayComponents.has(LOOPComponent.INVERTED)).toBe(true);
    expect(display.iconComponents.has(LOOPComponent.ROTATED)).toBe(true);
  });

  it("leaves overlayComponents empty in expand mode", () => {
    const display = buildLoopCardDisplay({
      loopEnabled: true,
      loopType: LOOPType.ROTATED_INVERTED,
      inversionMode: "expand",
    });
    expect(display.overlayComponents.size).toBe(0);
  });
});

describe("describeLoopRhythm", () => {
  it("speaks the detail the hidden icon strip would otherwise carry alone", () => {
    const display = buildLoopCardDisplay({
      loopEnabled: true,
      loopType: LOOPType.ROTATED_INVERTED,
      period: Period.QUARTERED,
      inversionInterval: 4,
      inversionMode: "overlay",
    });
    expect(describeLoopRhythm(display)).toBe(
      "quartered rotation, quartered inversion, overlay inversion"
    );
  });
});

describe("card-configurator LOOP descriptor", () => {
  const config: UIGenerationConfig = {
    mode: "freeform",
    loopEnabled: true,
    length: 8,
    level: 2,
    turnIntensity: 1,
    gridMode: GridMode.DIAMOND,
    propContinuity: "continuous",
    period: Period.QUARTERED,
    loopType: LOOPType.MIRRORED_ROTATED,
    inversionInterval: 4,
    inversionMode: "overlay",
    reflectionAxis: "east-west",
    constraintPreset: "smooth",
    handPathMode: "mixed",
    motionTypeFilter: null,
    handRelationship: "flipped",
    handRelationshipInverted: false,
    matchHandTurns: false,
    durationTemplateId: null,
    spellTargetLength: null,
  };

  it("passes every rhythm input the card needs to match the generator", () => {
    const cards = buildCardDescriptors(
      config,
      DifficultyLevel.INTERMEDIATE,
      true,
      {
        handleLevelChange: () => {},
        handleLengthChange: () => {},
        handleTurnIntensityChange: () => {},
        handlePropContinuityChange: () => {},
        handleGridModeChange: () => {},
        handleLOOPTypeChange: () => {},
        handleLoopToggle: () => {},
      },
      [1, 2, 3],
      false,
      false,
      true
    );

    const loopCard = cards.find((card) => card.id === "loop");
    expect(loopCard).toBeDefined();
    expect(loopCard!.props).toMatchObject({
      loopEnabled: true,
      currentLOOPType: LOOPType.MIRRORED_ROTATED,
      period: Period.QUARTERED,
      inversionInterval: 4,
      inversionMode: "overlay",
      reflectionAxis: "east-west",
      handRelationship: "flipped",
    });
  });

  it("keeps Customize and LOOP at an even 3/3 split", () => {
    const cards = buildCardDescriptors(
      config,
      DifficultyLevel.INTERMEDIATE,
      true,
      {
        handleLevelChange: () => {},
        handleLengthChange: () => {},
        handleTurnIntensityChange: () => {},
        handlePropContinuityChange: () => {},
        handleGridModeChange: () => {},
        handleLOOPTypeChange: () => {},
        handleConstraintPresetChange: () => {},
        handleHandPathModeChange: () => {},
        handleMotionTypeFilterChange: () => {},
        handleLoopToggle: () => {},
      },
      [1, 2, 3],
      false,
      false,
      true
    );

    expect(cards.find((c) => c.id === "customize")?.gridColumnSpan).toBe(3);
    expect(cards.find((c) => c.id === "loop")?.gridColumnSpan).toBe(3);
  });
});
