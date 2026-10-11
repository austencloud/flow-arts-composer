import { describe, expect, it } from "vitest";
import {
  resolveTunnelGridOpacity,
  resolveTunnelLayerOpacity,
  resolveTunnelLayerProgress,
  revealTunnelCopies,
  tunnelLayerPoseDifference,
  TUNNEL_REVEAL_DURATION,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-layer-reveal.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";

describe("Tunnel layer reveal", () => {
  it("uses one canonical structural phrase for the formation change", () => {
    expect(TUNNEL_REVEAL_DURATION).toBe(DURATION.emphasis + DURATION.normal);
  });

  it("holds every layer inside a normalized opacity envelope", () => {
    expect(resolveTunnelLayerOpacity(-1, 0, 4)).toBe(0);
    expect(resolveTunnelLayerOpacity(2, 3, 4)).toBe(1);
  });

  it("starts the whole ensemble during the opening fifth", () => {
    const near = resolveTunnelLayerOpacity(0.2, 0, 4);
    const far = resolveTunnelLayerOpacity(0.2, 3, 4);

    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it("settles every layer together at the transition endpoint", () => {
    const opacities = Array.from({ length: 6 }, (_, index) =>
      resolveTunnelLayerOpacity(1, index, 6)
    );

    expect(opacities).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("keeps a subtle depth spread without backloading the outer copies", () => {
    const opacities = Array.from({ length: 7 }, (_, index) =>
      resolveTunnelLayerOpacity(0.5, index, 7)
    );

    expect(Math.min(...opacities)).toBeGreaterThan(0.35);
    expect(opacities[0] - opacities[6]).toBeLessThan(0.15);
    expect(opacities).toEqual([...opacities].sort((a, b) => b - a));
  });

  it("draws the copies as they are once fully revealed", () => {
    const layers = [
      { leftProp: null, rightProp: null },
      { leftProp: null, rightProp: null },
    ];

    expect(revealTunnelCopies(layers, 1)).toBe(layers);
  });

  it("gives each copy its staggered opacity part way through", () => {
    const layers = Array.from({ length: 3 }, () => ({
      leftProp: null,
      rightProp: null,
    }));

    expect(revealTunnelCopies(layers, 0.4).map((l) => l.opacity)).toEqual(
      [0, 1, 2].map((index) => resolveTunnelLayerOpacity(0.4, index, 3))
    );
    expect(revealTunnelCopies(layers, 0).map((l) => l.opacity)).toEqual([
      0, 0, 0,
    ]);
  });

  it("dims a copy that already had an opacity of its own", () => {
    const [copy] = revealTunnelCopies(
      [{ leftProp: null, rightProp: null, opacity: 0.5 }],
      0.5
    );

    expect(copy?.opacity).toBe(0.5 * resolveTunnelLayerOpacity(0.5, 0, 1));
  });

  it("does not ease the shared reveal clock a second time", () => {
    expect(resolveTunnelLayerProgress(0.5, 0, 7)).toBe(0.5);
  });

  it("uses the shared stagger progress directly for opacity", () => {
    expect(resolveTunnelLayerProgress(0.42, 1, 4)).toBe(
      resolveTunnelLayerOpacity(0.42, 1, 4)
    );
  });

  it("reports no drift when the rendered prop is at its authored pose", () => {
    const target = {
      centerPathAngle: Math.PI / 2,
      staffRotationAngle: Math.PI,
    };

    expect(tunnelLayerPoseDifference(target, target)).toBe(0);
  });

  it("measures the shortest orientation drift across the angle seam", () => {
    const degrees = (value: number) => (value * Math.PI) / 180;
    const difference = tunnelLayerPoseDifference(
      { centerPathAngle: degrees(350), staffRotationAngle: degrees(350) },
      { centerPathAngle: degrees(10), staffRotationAngle: degrees(10) }
    );

    expect(difference).toBeCloseTo(20 / 180);
  });

  it("reports positional drift in grid-radius units", () => {
    expect(
      tunnelLayerPoseDifference(
        { centerPathAngle: 0, staffRotationAngle: 0, x: 0, y: 0 },
        { centerPathAngle: 0, staffRotationAngle: 0, x: 0.6, y: 0.8 }
      )
    ).toBeCloseTo(1);
  });
});

describe("Tunnel grid reveal", () => {
  it("removes the 2D grid on the same reversible progress as Tunnel", () => {
    expect(resolveTunnelGridOpacity(0, false)).toBe(1);
    expect(resolveTunnelGridOpacity(0.5, false)).toBe(0.5);
    expect(resolveTunnelGridOpacity(1, false)).toBe(0);
  });

  it("keeps an authored Tunnel grid visible throughout the handoff", () => {
    expect(resolveTunnelGridOpacity(0, true)).toBe(1);
    expect(resolveTunnelGridOpacity(0.5, true)).toBe(1);
    expect(resolveTunnelGridOpacity(1, true)).toBe(1);
  });
});
