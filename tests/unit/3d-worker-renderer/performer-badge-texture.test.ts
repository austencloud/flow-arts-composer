import { describe, expect, it, vi } from "vitest";

import { createPerformerBadgeTexture } from "#lib/shared/3d/rendering/performer-badge-texture.js";

describe("createPerformerBadgeTexture", () => {
  it("paints the exact numbered badge through an injected canvas owner", () => {
    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      font: "",
      textAlign: "start",
      textBaseline: "alphabetic",
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    };

    const texture = createPerformerBadgeTexture(
      2,
      "#123456",
      true,
      () => canvas
    );

    expect(canvas).toMatchObject({ width: 64, height: 64 });
    expect(context.arc).toHaveBeenCalledWith(32, 32, 30, 0, Math.PI * 2);
    expect(context.fillText).toHaveBeenCalledWith("3", 32, 32);
    expect(context.stroke).toHaveBeenCalledTimes(1);
    expect(texture.image).toBe(canvas);
  });
});
