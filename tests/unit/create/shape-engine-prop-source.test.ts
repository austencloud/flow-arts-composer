import { describe, expect, it, vi } from "vitest";
import { createShapeEnginePropSource } from "$lib/features/create/shape-engine/shape-engine-prop-source";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

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
