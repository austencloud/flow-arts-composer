import { describe, expect, it } from "vitest";
import {
  resolveForestNearFrameShadowRole,
  resolveForestShadowRole,
} from "#lib/shared/3d/environments/scenes/forest/forest-shadow-roles.js";

describe("Forest shadow roles", () => {
  it("lets the terrain receive local contact shadows without casting", () => {
    expect(resolveForestShadowRole("terrain")).toEqual({
      cast: false,
      receive: true,
    });
    expect(resolveForestShadowRole("camp-shelf")).toEqual({
      cast: false,
      receive: true,
    });
  });

  it("keeps the authored woodland out of the moon shadow pass", () => {
    expect(resolveForestShadowRole("tree")).toEqual({
      cast: false,
      receive: false,
    });
    expect(resolveForestShadowRole(undefined)).toEqual({
      cast: false,
      receive: false,
    });
  });

  it("keeps tree casting off while the foliage material owns internal depth", () => {
    expect(resolveForestNearFrameShadowRole("near-frame-tree", true)).toEqual({
      cast: false,
      receive: true,
    });
    expect(
      resolveForestNearFrameShadowRole("near-frame-static-prop", true)
    ).toEqual({ cast: true, receive: true });
    expect(resolveForestNearFrameShadowRole("near-frame-grass", true)).toEqual({
      cast: false,
      receive: true,
    });
  });

  it("removes the near-frame layer from low-cost shadow passes", () => {
    expect(resolveForestNearFrameShadowRole("near-frame-tree", false)).toEqual({
      cast: false,
      receive: false,
    });
  });
});
