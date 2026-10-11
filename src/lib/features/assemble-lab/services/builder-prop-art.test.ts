/**
 * Assemble's prop artwork follows the settings the pictographs draw with.
 * InteractiveGrid and the Create front door's Assemble preview load it inside
 * effects, so every setting has to be read before the first await.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { normalizeFanAppearance } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
import type { PropRenderData } from "#lib/shared/pictograph/prop/domain/models/prop-render-data.js";
import { applyHandColorOverride } from "#lib/shared/pictograph/prop/domain/prop-preview-color.js";
import { normalizePropLook } from "#lib/shared/pictograph/prop/domain/prop-look.js";
import { normalizeTriangleGrip } from "#lib/shared/pictograph/prop/domain/triangle-appearance.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { getMotionColor } from "#lib/shared/utils/svg-color-utils.js";
import {
  loadBuilderPropArt,
  type BuilderPropSettings,
} from "./builder-prop-art";

const { loadPropSvg } = vi.hoisted(() => ({ loadPropSvg: vi.fn() }));

vi.mock("#lib/shared/pictograph/prop/services/prop-svg-loader.js", () => ({
  propSvgLoader: { loadPropSvg },
}));

/** Staff artwork as the loader paints it: in the default blue. */
const SOURCE = `<path fill="${getMotionColor(HandSide.LEFT, "dark")}" d="M0 0h252.8v77.8H0z"/>`;

function art(svgContent = SOURCE): PropRenderData {
  return {
    position: { x: 0, y: 0 },
    rotation: 0,
    svgData: {
      svgContent,
      viewBox: { width: 252.8, height: 77.8 },
      center: { x: 126.4, y: 38.9 },
    },
    loaded: true,
    error: null,
  };
}

beforeEach(() => {
  loadPropSvg.mockReset();
});

describe("loadBuilderPropArt", () => {
  it("reads every setting before its first await", () => {
    loadPropSvg.mockReturnValue(new Promise(() => {}));
    const read = new Set<string>();
    const settings = new Proxy<BuilderPropSettings>(
      {
        leftPropType: PropType.STAFF,
        primaryPropColors: { left: "#00ff00", right: "#ff00ff" },
      },
      {
        get(target, key, receiver) {
          read.add(String(key));
          return Reflect.get(target, key, receiver);
        },
      }
    );
    void loadBuilderPropArt(HandSide.LEFT, settings);
    expect([...read].sort()).toEqual([
      "fanAppearance",
      "leftPropType",
      "primaryPropColors",
      "propArtwork",
      "triangleGrip",
    ]);
  });

  it("draws the hand's own prop type in the pictographs' look", async () => {
    loadPropSvg.mockResolvedValue(art());
    await loadBuilderPropArt(HandSide.RIGHT, {
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
    });
    expect(loadPropSvg).toHaveBeenCalledTimes(1);
    const [, motion, useGridVersion, options] = loadPropSvg.mock.calls[0] ?? [];
    expect(motion).toMatchObject({
      propType: PropType.FAN,
      hand: HandSide.RIGHT,
    });
    expect(useGridVersion).toBe(false);
    expect(options).toEqual({
      propLook: normalizePropLook(undefined),
      fanAppearance: normalizeFanAppearance(undefined),
      triangleGrip: normalizeTriangleGrip(undefined),
    });
  });

  it("repaints the artwork in the hand's chosen color", async () => {
    loadPropSvg.mockResolvedValue(art());
    const result = await loadBuilderPropArt(HandSide.LEFT, {
      primaryPropColors: { left: "#00ff00", right: "#ff00ff" },
    });
    expect(result.svgData?.svgContent).toBe(
      applyHandColorOverride(SOURCE, HandSide.LEFT, PropType.STAFF, "#00ff00")
    );
    expect(result.svgData?.svgContent).toContain('fill="#00ff00"');
    expect(result.svgData?.center).toEqual({ x: 126.4, y: 38.9 });
  });

  it("keeps the loader's artwork when no color is chosen", async () => {
    const loaded = art();
    loadPropSvg.mockResolvedValue(loaded);
    expect(await loadBuilderPropArt(HandSide.LEFT, {})).toBe(loaded);
  });
});
