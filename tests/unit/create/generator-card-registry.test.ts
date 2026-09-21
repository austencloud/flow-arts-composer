import { describe, expect, it, vi } from "vitest";
import {
  CARD_REGISTRY,
  getGeneratorCardHelp,
  getGeneratorCardSpan,
  getGeneratorPanelCards,
} from "$lib/shared/create/domain/card-registry";
import { buildCardDescriptors } from "$lib/features/create/generate/shared/services/card-configurator";
import { DifficultyLevel } from "$lib/features/create/generate/shared/domain/models/generate-models";
import type { UIGenerationConfig } from "$lib/features/create/generate/state/generate-config.svelte";
import type { CardHandlers } from "$lib/shared/create/domain/generator-contract-types";
import { generateTourState } from "$lib/shared/onboarding/state/generate-tour-state.svelte";

const CURRENT_PANEL_CARD_IDS = [
  "level",
  "word-input",
  "preset",
  "length",
  "grid-mode",
  "turn-intensity",
  "customize",
  "tnd",
  "loop",
  "generate-button",
] as const;

function makeHandlers(): CardHandlers {
  return {
    handleLevelChange: vi.fn(),
    handleLengthChange: vi.fn(),
    handleTurnIntensityChange: vi.fn(),
    handlePropContinuityChange: vi.fn(),
    handleGridModeChange: vi.fn(),
    handleLOOPTypeChange: vi.fn(),
    handleConstraintPresetChange: vi.fn(),
    handleHandPathModeChange: vi.fn(),
    handleMotionTypeFilterChange: vi.fn(),
    handleLoopToggle: vi.fn(),
    handleHandRelationshipChange: vi.fn(),
    handleOpenPresetDrawer: vi.fn(),
    handleGenerateClick: vi.fn(),
  } as unknown as CardHandlers;
}

function makeConfig(level: number): UIGenerationConfig {
  return {
    level,
    length: 8,
    turnIntensity: 1,
    loopEnabled: false,
  } as UIGenerationConfig;
}

describe("generator card registry", () => {
  it("contains exactly the controls that exist in the current panel", () => {
    expect(CARD_REGISTRY.map((entry) => entry.id)).toEqual(
      CURRENT_PANEL_CARD_IDS
    );
  });

  it("resolves complete panel-specific help for every tour stop", () => {
    const helpByCard = Object.fromEntries(
      CARD_REGISTRY.map((entry) => [entry.id, getGeneratorCardHelp(entry)])
    );

    expect(Object.keys(helpByCard)).toEqual([...CURRENT_PANEL_CARD_IDS]);
    expect(helpByCard["word-input"]?.name).toBe("Word");
    expect(helpByCard.preset?.name).toBe("Setups");
    expect(helpByCard.customize?.fullDesc).toContain("turn pattern");
    expect(helpByCard.customize?.fullDesc).not.toContain("rhythm templates");
  });

  it("uses the same order and spans for the registry and real Level 2 panel", () => {
    const handlers = makeHandlers();
    const descriptors = buildCardDescriptors(
      makeConfig(2),
      DifficultyLevel.INTERMEDIATE,
      true,
      handlers,
      [1, 2, 3]
    );
    const registryCards = getGeneratorPanelCards({
      includeLevel: false,
      isBeginner: false,
    }).filter((entry) => entry.slot === "grid");

    expect(descriptors.map((descriptor) => descriptor.id)).toEqual(
      registryCards.map((entry) => entry.id)
    );
    expect(descriptors.map((descriptor) => descriptor.gridColumnSpan)).toEqual(
      registryCards.map((entry) => getGeneratorCardSpan(entry, false))
    );
  });

  it("removes Turn Intensity from both the Level 1 list and layout", () => {
    const handlers = makeHandlers();
    const descriptors = buildCardDescriptors(
      makeConfig(1),
      DifficultyLevel.BEGINNER,
      true,
      handlers,
      []
    );
    const registryCards = getGeneratorPanelCards({
      includeLevel: false,
      isBeginner: true,
    }).filter((entry) => entry.slot === "grid");

    expect(descriptors.map((descriptor) => descriptor.id)).toEqual(
      registryCards.map((entry) => entry.id)
    );
    expect(
      descriptors.some((descriptor) => descriptor.id === "turn-intensity")
    ).toBe(false);
  });

  it("gives tour state the exact controls rendered for the current level", () => {
    generateTourState.reset();
    const beginnerStops = getGeneratorPanelCards({ isBeginner: true }).map(
      (entry) => entry.id
    );

    generateTourState.setStops(beginnerStops);

    expect(generateTourState.totalStops).toBe(beginnerStops.length);
    expect(beginnerStops).not.toContain("turn-intensity");
    generateTourState.goToStop("loop");
    expect(generateTourState.currentStop).toBe("loop");
    generateTourState.reset();
  });
});
