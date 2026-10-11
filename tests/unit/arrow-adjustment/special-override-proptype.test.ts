import { describe, it, expect, vi } from "vitest";

// Mock firebase/auth before importing anything that touches the firestore chain.
// SpecialArrowPlacementSchema uses firestoreDate which imports from $lib/shared/auth
// which pulls in firebase/auth → protobufjs at module-load time.
vi.mock("#lib/shared/auth/state/authState.svelte", () => ({
  authState: { effectiveUserId: null },
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
}));

import {
  generateSpecialOverrideKey,
  parseSpecialOverrideKey,
  SpecialArrowPlacementSchema,
} from "#lib/shared/pictograph/arrow/positioning/special-override/domain/special-arrow-placement.js";
import { createSpecialArrowPlacementState } from "#lib/shared/pictograph/arrow/positioning/special-override/state/special-arrow-placement-state.svelte.js";

describe("special override key — propType dimension", () => {
  it("includes propType as the 7th segment", () => {
    const key = generateSpecialOverrideKey({
      placementFrame: "canonical",
      oriFolder: "from_layer2",
      letter: "P",
      turnsTuple: "(0, 0)",
      motionType: "pro",
      attributeKey: "red",
      propType: "fan",
    });
    expect(key).toBe("canonical|from_layer2|P|(0, 0)|pro|red|fan");
  });

  it("parses a 7-part key back to fields", () => {
    expect(
      parseSpecialOverrideKey("canonical|from_layer2|P|(0, 0)|pro|red|fan")
    ).toEqual({
      placementFrame: "canonical",
      oriFolder: "from_layer2",
      letter: "P",
      turnsTuple: "(0, 0)",
      motionType: "pro",
      attributeKey: "red",
      propType: "fan",
    });
  });

  it("parses a legacy 6-part key with propType defaulted to staff", () => {
    expect(
      parseSpecialOverrideKey("canonical|from_layer2|P|(0, 0)|pro|red")
    ).toEqual({
      placementFrame: "canonical",
      oriFolder: "from_layer2",
      letter: "P",
      turnsTuple: "(0, 0)",
      motionType: "pro",
      attributeKey: "red",
      propType: "staff",
    });
  });

  it("schema defaults a missing propType to staff", () => {
    const parsed = SpecialArrowPlacementSchema.parse({
      key: "canonical|from_layer2|P|(0, 0)|pro|red",
      placementFrame: "canonical",
      oriFolder: "from_layer2",
      letter: "P",
      turnsTuple: "(0, 0)",
      motionType: "pro",
      attributeKey: "red",
      adjustmentX: 1,
      adjustmentY: 2,
      originalX: 0,
      originalY: 0,
      updatedAt: new Date().toISOString(),
      updatedBy: "x",
    });
    expect(parsed.propType).toBe("staff");
  });
});

describe("special override state — prop isolation + zero handling", () => {
  const base = {
    placementFrame: "canonical",
    oriFolder: "from_layer2",
    letter: "P",
    turnsTuple: "(0, 0)",
    motionType: "pro",
    attributeKey: "red",
    originalX: 0,
    originalY: 0,
    updatedAt: undefined as never,
    updatedBy: "me",
  };
  it("isolates fan from staff under distinct keys", () => {
    const s = createSpecialArrowPlacementState();
    s.setOverride({
      ...base,
      key: "canonical|from_layer2|P|(0, 0)|pro|red|fan",
      propType: "fan",
      adjustmentX: 3,
      adjustmentY: 4,
    });
    expect(s.getOverride("canonical|from_layer2|P|(0, 0)|pro|red|fan")?.x).toBe(
      3
    );
    expect(
      s.getOverride("canonical|from_layer2|P|(0, 0)|pro|red|staff")
    ).toBeNull();
  });
  it("treats a [0,0] override as absent", () => {
    const s = createSpecialArrowPlacementState();
    s.setOverride({
      ...base,
      key: "canonical|from_layer2|P|(0, 0)|pro|red|staff",
      propType: "staff",
      adjustmentX: 0,
      adjustmentY: 0,
    });
    expect(
      s.getOverride("canonical|from_layer2|P|(0, 0)|pro|red|staff")
    ).toBeNull();
    expect(s.hasOverride("canonical|from_layer2|P|(0, 0)|pro|red|staff")).toBe(
      false
    );
  });
});
