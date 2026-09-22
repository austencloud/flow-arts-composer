import { describe, expect, it, vi } from "vitest";
import { buildCardDescriptors } from "../card-configurator";
import { DifficultyLevel } from "../../domain/models/generate-models";
import type { UIGenerationConfig } from "../../../state/generate-config.svelte";
import type {
  CardDescriptor,
  CardHandlers,
} from "$lib/shared/create/domain/generator-contract-types";

function makeConfig(level: number): UIGenerationConfig {
  return {
    level,
    length: 16,
    turnIntensity: level >= 3 ? 0.5 : 1,
    loopEnabled: false,
    handRelationship: "free",
    propRelationship: "free",
    matchHandTurns: false,
  } as UIGenerationConfig;
}

function makeHandlers(): CardHandlers {
  return {
    handleGridModeChange: vi.fn(),
    handleTurnIntensityChange: vi.fn(),
    handleConstraintPresetChange: vi.fn(),
    handleHandPathModeChange: vi.fn(),
    handleMotionTypeFilterChange: vi.fn(),
    handleLoopToggle: vi.fn(),
    handleHandRelationshipChange: vi.fn(),
  } as unknown as CardHandlers;
}

function descriptor(
  cards: CardDescriptor[],
  id: CardDescriptor["id"]
): CardDescriptor {
  const card = cards.find((candidate) => candidate.id === id);
  expect(card, `${id} card should be present`).toBeDefined();
  return card!;
}

describe("Generate card layout by level", () => {
  it("keeps Level out of the descriptor list and balances the Level 1 rows", () => {
    const cards = buildCardDescriptors(
      makeConfig(1),
      DifficultyLevel.BEGINNER,
      true,
      makeHandlers(),
      []
    );

    expect(cards.some((card) => card.id === "level")).toBe(false);
    expect(descriptor(cards, "grid-mode").gridColumnSpan).toBe(3);
    expect(descriptor(cards, "customize").gridColumnSpan).toBe(3);
    expect(descriptor(cards, "tnd").gridColumnSpan).toBe(3);
    expect(descriptor(cards, "loop").gridColumnSpan).toBe(3);
    expect(cards.some((card) => card.id === "turn-intensity")).toBe(false);
  });

  it("splits one row three ways between Grid, Turn Intensity and Customize at Level 3", () => {
    const cards = buildCardDescriptors(
      makeConfig(3),
      DifficultyLevel.ADVANCED,
      true,
      makeHandlers(),
      [0, 0.5, 1]
    );

    expect(descriptor(cards, "grid-mode").gridColumnSpan).toBe(2);
    expect(descriptor(cards, "turn-intensity").gridColumnSpan).toBe(2);
    expect(descriptor(cards, "customize").gridColumnSpan).toBe(2);
    expect(descriptor(cards, "tnd").gridColumnSpan).toBe(3);
    expect(descriptor(cards, "loop").gridColumnSpan).toBe(3);
    expect(descriptor(cards, "customize").props).toMatchObject({ level: 3 });
    expect(descriptor(cards, "tnd").props).toMatchObject({
      handRelationship: "free",
      propRelationship: "free",
      matchHandTurns: false,
      blockedHandModes: {},
    });
  });
});
