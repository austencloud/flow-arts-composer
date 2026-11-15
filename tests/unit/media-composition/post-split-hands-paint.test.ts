// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  SPLIT_HAND_ANIMATOR_FLAGS,
  splitClipSettings,
  splitSourceLayers,
} from "#lib/shared/post-studio-plugin/split-hands-paint.js";

/**
 * What each hand's canvas draws. These catch the hand canvases silently
 * losing a layer the single canvas shows (the mandala, the trails, the path
 * lines) or the clip's own settings for them.
 */

/** A real canvas element: the test setup stubs document.createElement. */
const canvasElement = () =>
  document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "canvas"
  ) as HTMLCanvasElement;

/** A source holding the canvases an animator mounts, at their z-indexes. */
function source(): HTMLElement {
  const root = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div"
  ) as HTMLElement;
  for (const [layer, z] of [
    ["props", 3],
    ["trails", 1],
    ["mandala", 2],
    ["led", 1],
  ] as const) {
    const canvas = canvasElement();
    canvas.width = 100;
    canvas.height = 100;
    canvas.setAttribute("data-animation-layer", layer);
    canvas.style.zIndex = String(z);
    root.append(canvas);
  }
  const paths = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  paths.setAttribute("class", "path-lines-overlay");
  paths.style.zIndex = "4";
  root.append(paths);
  // An effect canvas that has not been sized yet draws nothing.
  root.append(canvasElement());
  const unsized = root.lastElementChild as HTMLCanvasElement;
  unsized.width = 0;
  return root;
}

const nameOf = (element: Element) =>
  element instanceof HTMLCanvasElement
    ? element.getAttribute("data-animation-layer")
    : "paths";

describe("the layers each hand's canvas repeats", () => {
  it("takes every sized canvas and the path lines, stacked as the single canvas stacks them", () => {
    const layers = splitSourceLayers({ left: source(), right: source() });
    expect(
      layers.map((layer) => `${layer.side}:${nameOf(layer.element)}`)
    ).toEqual([
      "left:trails",
      "left:led",
      "right:trails",
      "right:led",
      "left:mandala",
      "right:mandala",
      "left:props",
      "right:props",
      "left:paths",
      "right:paths",
    ]);
  });

  it("works with one source missing", () => {
    const layers = splitSourceLayers({ left: null, right: source() });
    expect(layers.every((layer) => layer.side === "right")).toBe(true);
    expect(layers).toHaveLength(5);
  });
});

describe("each hand's animator", () => {
  it("never switches off a per-hand layer the single canvas draws", () => {
    const flags = Object.keys(SPLIT_HAND_ANIMATOR_FLAGS);
    for (const banned of [
      "suppress2DOverlays",
      "hidePathLines",
      "mandalaVisibleOverride",
      "trailSettings",
      "gridVisible",
    ])
      expect(flags).not.toContain(banned);
    expect(SPLIT_HAND_ANIMATOR_FLAGS.backgroundAlpha).toBe(0);
  });

  it("carries the clip's own mandala, trails, effects and dark mode", () => {
    const own = { visibility: {}, effects: {}, trail: {} };
    const settings = splitClipSettings(
      { darkMode: false, mandalaThickness: 7, gridMode: "none" },
      own
    );
    expect(settings).toMatchObject({
      previewDarkMode: false,
      mandalaStrokeWidthOverride: 7,
      gridVisible: false,
    });
    expect(settings.visibilityManagerOverride).toBe(own.visibility);
    expect(settings.effectsConfigState).toBe(own.effects);
    expect(settings.trailSettings).toBe(own.trail);
  });

  it("follows the viewer's settings for a clip without a look of its own", () => {
    const settings = splitClipSettings(undefined, {
      visibility: {},
      effects: {},
      trail: {},
    });
    expect(settings).toEqual({
      gridVisible: true,
      previewDarkMode: true,
      mandalaStrokeWidthOverride: undefined,
    });
  });
});
