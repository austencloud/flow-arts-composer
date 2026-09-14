import { describe, expect, it } from "vitest";
import {
  resolveTunnelPropColorState,
  resolvePerformerColorPair,
  buildTunnelRenderColors,
  tunnelPerformerPair,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";

describe("performer colors", () => {
  it("preserves normalized performer settings through JSON persistence", () => {
    const state = resolveTunnelPropColorState({
      mode: "spectrum",
      performers: {
        alice: { mode: "custom", custom: { left: "#ABC", right: "#123456" } },
        bob: {
          mode: "hue",
          hue: 600,
          saturation: 100,
          leftLightness: 75,
          rightLightness: 25,
        },
      },
    });
    expect(
      resolveTunnelPropColorState(JSON.parse(JSON.stringify(state)))
    ).toEqual(state);
    expect(state.performers?.alice.custom.left).toBe("#aabbcc");
    expect(state.performers?.bob.hue).toBe(240);
    expect(resolvePerformerColorPair(state.performers!.bob)).toEqual({
      left: "#8080ff",
      right: "#000080",
    });
  });

  it("keeps a performer's colors on reordering and on all their stage copies", () => {
    const state = resolveTunnelPropColorState({
      mode: "hands",
      performers: {
        alice: {
          mode: "custom",
          custom: { left: "#abcdef", right: "#123456" },
        },
      },
    });
    const fallback = { left: "#0000ff", right: "#ff0000" };
    const colors = buildTunnelRenderColors(
      state,
      ["bob", "alice", "alice"],
      fallback
    )!;
    expect(tunnelPerformerPair(colors, 0)).toEqual(fallback);
    expect(tunnelPerformerPair(colors, 1)).toEqual({
      left: "#abcdef",
      right: "#123456",
    });
    expect(tunnelPerformerPair(colors, 2)).toEqual(
      tunnelPerformerPair(colors, 1)
    );
    const reordered = buildTunnelRenderColors(
      state,
      ["alice", "bob"],
      fallback
    )!;
    expect(reordered.left).toBe("#abcdef");
    expect(tunnelPerformerPair(reordered, 1)).toEqual(fallback);
  });

  it("rejects nonfinite values and preserves legacy rendering without overrides", () => {
    const state = resolveTunnelPropColorState({
      performers: {
        a: { mode: "hue", hue: Infinity, saturation: -1, leftLightness: 200 },
      },
    });
    expect(state.performers?.a.hue).toBe(240);
    expect(state.performers?.a.saturation).toBe(0);
    expect(state.performers?.a.leftLightness).toBe(100);
    expect(
      buildTunnelRenderColors(resolveTunnelPropColorState(undefined), ["a"], {
        left: "#000000",
        right: "#ffffff",
      })
    ).toBeNull();
  });
});
