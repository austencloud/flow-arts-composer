import { describe, it, expect, vi } from "vitest";

// getBaseMotionColors pulls the SVG generator chain; stub it to fixed colors so
// the spectrum-off assertion is deterministic and the import stays light.
vi.mock("./svg-generator", () => ({
  getBaseMotionColors: () => ({ left: "#1111ff", right: "#ff1111" }),
}));

import { PropTypeManager } from "./prop-type-manager";

function makeManager() {
  const calls: Array<{
    i: number;
    leftPropType: string;
    rightPropType: string;
    left: string;
    right: string;
  }> = [];
  const renderer = {
    loadAdditionalLayerPropTextures: vi.fn(
      (
        i: number,
        leftPropType: string,
        rightPropType: string,
        left: string,
        right: string
      ) => {
        calls.push({ i, leftPropType, rightPropType, left, right });
        return Promise.resolve();
      }
    ),
  };
  const ptm = new PropTypeManager();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ptm.updateRefs({ animationRenderer: renderer as any });
  return { ptm, renderer, calls };
}

// Regression guard for the tunnel-export "only the base pair renders" bug: the
// offscreen engine bypasses PlaybackSync.update (the live path that loads the
// per-layer prop textures), so the export must pre-load them itself.
describe("PropTypeManager.preloadAdditionalLayerTextures (tunnel export)", () => {
  it("loads one texture per layer, forwarding the export's prop type to both hands", async () => {
    const { ptm, renderer, calls } = makeManager();
    await ptm.preloadAdditionalLayerTextures(3, true, "club");
    expect(renderer.loadAdditionalLayerPropTextures).toHaveBeenCalledTimes(3);
    expect(calls.map((c) => c.i)).toEqual([0, 1, 2]);
    expect(
      calls.every(
        (c) => c.leftPropType === "club" && c.rightPropType === "club"
      )
    ).toBe(true);
  });

  it("forwards per-layer prop types (Performer Set export) when supplied", async () => {
    const { ptm, calls } = makeManager();
    await ptm.preloadAdditionalLayerTextures(2, true, "staff", [
      { left: "sword", right: "club" },
      { left: "fan", right: "fan" },
    ]);
    expect(calls[0]).toMatchObject({
      i: 0,
      leftPropType: "sword",
      rightPropType: "club",
    });
    // PropTypeManager defaults fanAppearance to DEFAULT_FAN_APPEARANCE (build:
    // "fire" since commit 14fcb713, "default the 2D fan build to DoodleGrip
    // Fire"), so a forwarded "fan" prop type resolves through
    // resolveFanRenderKey to its fire-build render key, not the bare notation
    // name.
    expect(calls[1]).toMatchObject({
      i: 1,
      leftPropType: "fan__fire_bare",
      rightPropType: "fan__fire_bare",
    });
  });

  it("spectrum on → each layer fans to a distinct color", async () => {
    const { ptm, calls } = makeManager();
    await ptm.preloadAdditionalLayerTextures(3, true, "staff");
    expect(new Set(calls.map((c) => c.left)).size).toBe(3);
    expect(new Set(calls.map((c) => c.right)).size).toBe(3);
  });

  it("spectrum off → every layer matches the base pair color", async () => {
    const { ptm, calls } = makeManager();
    await ptm.preloadAdditionalLayerTextures(3, false, "staff");
    expect(calls.every((c) => c.left === "#1111ff")).toBe(true);
    expect(calls.every((c) => c.right === "#ff1111")).toBe(true);
  });

  it("custom pair → every layer uses the authored exact colors", async () => {
    const { ptm, calls } = makeManager();
    await ptm.preloadAdditionalLayerTextures(3, false, "staff", undefined, {
      left: "#123456",
      right: "#abcdef",
    });
    expect(calls.every((c) => c.left === "#123456")).toBe(true);
    expect(calls.every((c) => c.right === "#abcdef")).toBe(true);
  });

  it("no-op for zero layers", async () => {
    const { ptm, renderer } = makeManager();
    await ptm.preloadAdditionalLayerTextures(0, true, "staff");
    expect(renderer.loadAdditionalLayerPropTextures).not.toHaveBeenCalled();
  });
});

describe("PropTypeManager hidden layer preparation", () => {
  it("loads prepared layers before they join the visible frame", async () => {
    const { ptm, renderer } = makeManager();
    const statuses: Array<{
      requested: number;
      loaded: number;
      loading: number;
    }> = [];
    const layer = {
      leftProp: { centerPathAngle: 0, staffRotationAngle: 0 },
      rightProp: { centerPathAngle: 180, staffRotationAngle: 0 },
    };

    ptm.handleAdditionalLayers(
      {
        leftProp: null,
        rightProp: null,
        additionalLayers: [],
        preloadAdditionalLayers: [layer, layer],
        onAdditionalLayerTextureStatusChange: (status) => statuses.push(status),
      },
      {
        currentLeftPropType: "staff",
        currentRightPropType: "staff",
      } as never,
      () => ({}) as never
    );

    expect(renderer.loadAdditionalLayerPropTextures).toHaveBeenCalledTimes(2);
    await vi.waitFor(() =>
      expect(statuses.at(-1)).toEqual({ requested: 2, loaded: 2, loading: 0 })
    );
  });
});
