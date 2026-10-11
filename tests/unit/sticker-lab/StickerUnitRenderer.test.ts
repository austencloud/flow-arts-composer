import { describe, it, expect } from "vitest";
import { renderStickerUnitSVG } from "#lib/features/sticker-lab/services/sticker-unit-renderer.js";
import {
  createDefaultStickerUnit,
  type MandalaPrimitiveRef,
} from "#lib/features/sticker-lab/domain/sticker-types.js";
import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";
import {
  STICKER_TILE_SIZE_PX,
  STICKER_ART_DIAMETER_PX,
} from "#lib/features/sticker-lab/domain/sticker-constants.js";

const emptyPaths: MandalaPaths = { left: [], right: [], purple: [] };

const testRef: MandalaPrimitiveRef = {
  shapeHash: "shape-1",
  ultraHash: "shape-1",
  identityKind: "geometry-v1",
  representativeSequenceId: "sequence-1",
};

describe("StickerUnitRenderer", () => {
  it("renders an SVG at the full tile size (art + bleed)", () => {
    const unit = createDefaultStickerUnit({ primitiveRef: testRef });
    const svg = renderStickerUnitSVG(unit, emptyPaths);
    expect(svg).toContain(
      `viewBox="0 0 ${STICKER_TILE_SIZE_PX} ${STICKER_TILE_SIZE_PX}"`
    );
  });

  it("transparent background produces no background rect", () => {
    const unit = createDefaultStickerUnit({
      primitiveRef: testRef,
      background: "transparent",
    });
    const svg = renderStickerUnitSVG(unit, emptyPaths);
    expect(svg).not.toMatch(/<rect[^>]*fill="#ffffff"/i);
    expect(svg).not.toMatch(/url\(#sticker-bg-gradient/);
  });

  it("white background produces a solid white circle at art diameter", () => {
    const unit = createDefaultStickerUnit({
      primitiveRef: testRef,
      background: "white",
    });
    const svg = renderStickerUnitSVG(unit, emptyPaths);
    expect(svg).toMatch(/<circle[^>]*fill="#ffffff"/i);
    expect(svg).toContain(`r="${STICKER_ART_DIAMETER_PX / 2}"`);
  });

  it("radial-gradient background defines a gradient and uses it as fill", () => {
    const unit = createDefaultStickerUnit({
      primitiveRef: testRef,
      background: "radial-gradient",
    });
    const svg = renderStickerUnitSVG(unit, emptyPaths);
    expect(svg).toContain("<radialGradient");
    expect(svg).toMatch(/fill="url\(#sticker-bg-gradient[^)]*\)"/);
  });

  it("variant=left renders only the left-hand path", () => {
    const unit = createDefaultStickerUnit({
      primitiveRef: testRef,
      variant: "left",
    });
    const svg = renderStickerUnitSVG(unit, {
      left: [{ d: "M0 0 L10 10", tipIndex: 0 }],
      right: [{ d: "M0 0 L20 20", tipIndex: 0 }],
      purple: [],
    });
    // Only the left-hand path should appear. The right-hand path should not.
    expect(svg).toContain("M0 0 L10 10");
    expect(svg).not.toContain("M0 0 L20 20");
  });

  it("variant=right renders only the right-hand path", () => {
    const unit = createDefaultStickerUnit({
      primitiveRef: testRef,
      variant: "right",
    });
    const svg = renderStickerUnitSVG(unit, {
      left: [{ d: "M0 0 L10 10", tipIndex: 0 }],
      right: [{ d: "M0 0 L20 20", tipIndex: 0 }],
      purple: [],
    });
    expect(svg).not.toContain("M0 0 L10 10");
    expect(svg).toContain("M0 0 L20 20");
  });

  it("variant=full renders both paths with the overlap mask", () => {
    const unit = createDefaultStickerUnit({
      primitiveRef: testRef,
      variant: "full",
    });
    const svg = renderStickerUnitSVG(unit, {
      left: [{ d: "M0 0 L10 10", tipIndex: 0 }],
      right: [{ d: "M0 0 L20 20", tipIndex: 0 }],
      purple: [],
    });
    expect(svg).toContain("M0 0 L10 10");
    expect(svg).toContain("M0 0 L20 20");
    expect(svg).toContain("<mask");
  });
});
