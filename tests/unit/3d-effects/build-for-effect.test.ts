import { describe, it, expect } from "vitest";
import type { PropBuild } from "@austencloud/scene-3d";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { buildForEffect } from "#lib/shared/3d/domain/build-for-effect.js";

/** The scene default: a pictograph fan, bare, on a fire-finish frame. */
const DEFAULT_BUILD: PropBuild = {
  finish: "fire",
  fanBuild: "pictograph",
  fanFrameColor: "black",
  fanCover: "bare",
};

const DAY_BUILD: PropBuild = {
  ...DEFAULT_BUILD,
  finish: "day",
  fanBuild: "day",
};

describe("buildForEffect — fire equips a burnable build", () => {
  it("puts a pictograph fan on the fire build", () => {
    expect(buildForEffect(PropType.FAN, "fire", DEFAULT_BUILD)).toEqual({
      propBuild: { fanBuild: "fire" },
    });
  });

  it("takes the cover off a covered day fan and lights the wicks", () => {
    expect(
      buildForEffect(PropType.FAN, "fire", {
        ...DAY_BUILD,
        fanCover: "covered",
      })
    ).toEqual({ propBuild: { fanBuild: "fire", fanCover: "bare" } });
  });

  it("keeps the selected Lotus frame when fire uncovers its wicks", () => {
    const lotusFan: PropBuild = {
      ...DEFAULT_BUILD,
      fanBuild: "lotus",
      fanCover: "covered",
    };
    expect(buildForEffect(PropType.FAN, "fire", lotusFan)).toEqual({
      propBuild: { fanCover: "bare" },
    });
    expect(
      buildForEffect(PropType.FAN, "fire", {
        ...lotusFan,
        fanCover: "bare",
      })
    ).toBeNull();
  });

  it("treats the big fan the same as the fan", () => {
    expect(buildForEffect(PropType.BIGFAN, "fire", DAY_BUILD)).toEqual({
      propBuild: { fanBuild: "fire" },
    });
  });

  it("switches the triad family to the fire finish", () => {
    for (const prop of [
      PropType.TRIAD,
      PropType.BIGTRIAD,
      PropType.TRIGENG,
      PropType.QUIAD,
    ]) {
      expect(buildForEffect(prop, "fire", DAY_BUILD)).toEqual({
        propBuild: { finish: "fire" },
      });
    }
  });

  it("swaps a club for a torch and a staff for a fire staff", () => {
    expect(buildForEffect(PropType.CLUB, "fire", DEFAULT_BUILD)).toEqual({
      prop: PropType.TORCH,
    });
    expect(buildForEffect(PropType.BIGCLUB, "fire", DEFAULT_BUILD)).toEqual({
      prop: PropType.BIGTORCH,
    });
    expect(buildForEffect(PropType.STAFF, "fire", DEFAULT_BUILD)).toEqual({
      prop: PropType.FIRE_DOUBLE_STAFF,
    });
    expect(
      buildForEffect(PropType.CAPSULE_BATON, "fire", DEFAULT_BUILD)
    ).toEqual({ prop: PropType.FIRE_DOUBLE_STAFF });
  });

  it("leaves props that have no fire build alone — they burn as they are", () => {
    for (const prop of [
      PropType.MINIHOOP,
      PropType.BUUGENG,
      PropType.SWORD,
      PropType.GUITAR,
      PropType.CHICKEN,
    ]) {
      expect(buildForEffect(prop, "fire", DEFAULT_BUILD)).toBeNull();
    }
  });
});

describe("buildForEffect — led equips the emitting build", () => {
  it("swaps a staff or fire staff for the LED baton", () => {
    expect(buildForEffect(PropType.STAFF, "led", DEFAULT_BUILD)).toEqual({
      prop: PropType.CAPSULE_BATON,
    });
    expect(
      buildForEffect(PropType.FIRE_DOUBLE_STAFF, "led", DEFAULT_BUILD)
    ).toEqual({ prop: PropType.CAPSULE_BATON });
  });

  it("puts both fan sizes on the Moon LED build", () => {
    expect(buildForEffect(PropType.FAN, "led", DEFAULT_BUILD)).toEqual({
      propBuild: { fanBuild: "moon" },
    });
    expect(buildForEffect(PropType.BIGFAN, "led", DEFAULT_BUILD)).toEqual({
      propBuild: { fanBuild: "moon" },
    });
  });

  it("leaves clubs alone because they still have no LED build", () => {
    expect(buildForEffect(PropType.CLUB, "led", DEFAULT_BUILD)).toBeNull();
  });
});

describe("buildForEffect — nothing to change", () => {
  it("returns null when the build is already equipped", () => {
    const fireFan: PropBuild = { ...DEFAULT_BUILD, fanBuild: "fire" };
    expect(buildForEffect(PropType.FAN, "fire", fireFan)).toBeNull();
    expect(buildForEffect(PropType.TORCH, "fire", DEFAULT_BUILD)).toBeNull();
    expect(
      buildForEffect(PropType.FIRE_DOUBLE_STAFF, "fire", DEFAULT_BUILD)
    ).toBeNull();
    expect(
      buildForEffect(PropType.CAPSULE_BATON, "led", DEFAULT_BUILD)
    ).toBeNull();
    expect(
      buildForEffect(PropType.FAN, "led", {
        ...DEFAULT_BUILD,
        fanBuild: "moon",
      })
    ).toBeNull();
  });

  it("keeps the build when the effect is turned off or inherited", () => {
    const fireFan: PropBuild = { ...DEFAULT_BUILD, fanBuild: "fire" };
    expect(buildForEffect(PropType.FAN, "none", fireFan)).toBeNull();
    expect(buildForEffect(PropType.FAN, null, fireFan)).toBeNull();
  });

  it("equips nothing for effects that read whatever build is in hand", () => {
    for (const effect of [
      "charcoal",
      "trails",
      "sparkles",
      "ghost",
      "smoke",
    ] as const) {
      expect(buildForEffect(PropType.FAN, effect, DAY_BUILD)).toBeNull();
      expect(buildForEffect(PropType.CLUB, effect, DAY_BUILD)).toBeNull();
    }
  });
});
