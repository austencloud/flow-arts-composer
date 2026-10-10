import { describe, expect, it, vi } from "vitest";
import { createShapeEnginePropSource } from "#lib/features/create/shape-engine/shape-engine-prop-source.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

describe("createShapeEnginePropSource", () => {
  it("reads the live settings pair", () => {
    const settings = {
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      catDogMode: true,
    };
    const source = createShapeEnginePropSource({
      getSettings: () => settings,
      updateSettings: vi.fn(),
    });
    expect(source.left).toBe(PropType.STAFF);
    expect(source.right).toBe(PropType.FAN);
    expect(source.catDog).toBe(true);
    settings.rightPropType = PropType.CLUB;
    expect(source.right).toBe(PropType.CLUB);
  });

  it("writes an engine pick into settings with its cat dog flag", () => {
    const updateSettings = vi.fn();
    const source = createShapeEnginePropSource({
      getSettings: () => ({
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
        catDogMode: false,
      }),
      updateSettings,
    });
    source.set({ left: PropType.STAFF, right: PropType.FAN, catDog: true });
    expect(updateSettings).toHaveBeenCalledWith({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      catDogMode: true,
    });
  });

  it("writes the version a pick names in the same write as the pair", () => {
    const updateSettings = vi.fn();
    const source = createShapeEnginePropSource({
      getSettings: () => ({
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
        catDogMode: false,
      }),
      updateSettings,
    });
    source.set({
      left: PropType.CAPSULE_BATON,
      right: PropType.CAPSULE_BATON,
      catDog: false,
      look: "model",
    });
    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith({
      leftPropType: PropType.CAPSULE_BATON,
      rightPropType: PropType.CAPSULE_BATON,
      catDogMode: false,
      propArtwork: "model",
    });
  });

  it("names no version in the write when the pick named none", () => {
    const updateSettings = vi.fn();
    const source = createShapeEnginePropSource({
      getSettings: () => ({}),
      updateSettings,
    });
    source.set({ left: PropType.CLUB, right: PropType.CLUB, catDog: false });
    expect(updateSettings.mock.calls[0]![0]).not.toHaveProperty("propArtwork");
  });

  it("reads a legacy settings object with no hand fields", () => {
    const source = createShapeEnginePropSource({
      getSettings: () => ({ propType: PropType.FAN }),
      updateSettings: vi.fn(),
    });
    expect(source.left).toBe(PropType.FAN);
    expect(source.right).toBe(PropType.FAN);
    expect(source.catDog).toBe(false);
  });
});
