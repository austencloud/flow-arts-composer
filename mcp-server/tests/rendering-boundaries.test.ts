import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCanvas } from "canvas";
import {
  BADGE_PADDING_SCALE,
  BADGE_SIZE_SCALE,
  LOOP_ICON_SIZE_SCALE,
  LOOP_ICON_STRIP_OFFSET_SCALE,
  computeLoopIconStripWidth,
  renderHeader,
  tokenizeGlyphWord,
  type CompressedSegment,
  type GlyphImageData,
  type LOOPComponentId,
} from "@tka/render-composition";
import { calculateArrowRotation } from "../src/core/arrow-placement.js";
import { convertToSequenceResult } from "../src/core/engine-generation-adapter.js";
import {
  resolveHeaderDisplay,
  resolveRenderedTurns,
} from "../src/core/sequence-renderer.js";
import {
  getStandaloneRenderer,
  type PictographInput,
} from "../src/core/standalone-renderer.js";
import { renderWordHeader } from "../src/core/text-renderer.js";
import { loadTkaGlyphImages } from "../src/core/tka-glyph-image-loader.js";

const HEADER_GLYPH_HEIGHT_RATIO = 0.65;
const HEADER_LETTER_GAP_RATIO = 0.04;

interface PixelBounds {
  left: number;
  right: number;
}

interface DrawnImageBounds {
  y: number;
  height: number;
}

function findChangedPixelBounds(
  rendered: ReturnType<typeof createCanvas>,
  withoutWord: ReturnType<typeof createCanvas>
): PixelBounds {
  const renderedPixels = rendered
    .getContext("2d")
    .getImageData(0, 0, rendered.width, rendered.height).data;
  const baselinePixels = withoutWord
    .getContext("2d")
    .getImageData(0, 0, withoutWord.width, withoutWord.height).data;
  let left = rendered.width;
  let right = -1;

  for (let y = 0; y < rendered.height; y++) {
    for (let x = 0; x < rendered.width; x++) {
      const offset = (y * rendered.width + x) * 4;
      const changed =
        renderedPixels[offset] !== baselinePixels[offset] ||
        renderedPixels[offset + 1] !== baselinePixels[offset + 1] ||
        renderedPixels[offset + 2] !== baselinePixels[offset + 2] ||
        renderedPixels[offset + 3] !== baselinePixels[offset + 3];

      if (!changed) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }

  assert.notEqual(
    right,
    -1,
    "expected the rendered header to contain word pixels"
  );
  return { left, right };
}

function protectedWordBounds(
  canvasWidth: number,
  headerHeight: number,
  loopComponents: Set<LOOPComponentId>
): PixelBounds {
  const badgeSize = headerHeight * BADGE_SIZE_SCALE;
  const badgePadding = headerHeight * BADGE_PADDING_SCALE;
  const breathingGap = headerHeight * HEADER_LETTER_GAP_RATIO;
  const iconSize = badgeSize * LOOP_ICON_SIZE_SCALE;
  const stripWidth = computeLoopIconStripWidth(loopComponents, iconSize);
  const rightIconZone =
    badgePadding + iconSize * LOOP_ICON_STRIP_OFFSET_SCALE + stripWidth;

  return {
    left: badgePadding + badgeSize + breathingGap,
    right: canvasWidth - rightIconZone - breathingGap,
  };
}

async function renderRasterHeader(options: {
  word: string;
  compressedSegments?: CompressedSegment[];
}): Promise<{
  rendered: ReturnType<typeof createCanvas>;
  withoutWord: ReturnType<typeof createCanvas>;
  protectedBounds: PixelBounds;
  drawnImages: DrawnImageBounds[];
}> {
  const canvasWidth = 900;
  const headerHeight = 100;
  const loopComponents = new Set<LOOPComponentId>([
    "rotated",
    "mirrored",
    "flipped",
  ]);
  const glyphImages = await loadTkaGlyphImages(options.word, false);
  assert.ok(glyphImages);

  const rendered = createCanvas(canvasWidth, headerHeight);
  const renderedContext = rendered.getContext("2d");
  const drawnImages: DrawnImageBounds[] = [];
  const originalDrawImage = renderedContext.drawImage.bind(renderedContext);
  renderedContext.drawImage = ((
    ...args: Parameters<typeof originalDrawImage>
  ) => {
    drawnImages.push({ y: args[2], height: args[4] });
    return originalDrawImage(...args);
  }) as typeof renderedContext.drawImage;

  const sharedOptions = {
    canvasWidth,
    headerHeight,
    difficultyLevel: 3,
    showDifficultyBadge: true,
    loopComponents,
    darkMode: false,
    glyphImages,
    glyphImagesAreThemeColored: true,
    compressedSegments: options.compressedSegments,
  };

  renderHeader(
    renderedContext as unknown as globalThis.CanvasRenderingContext2D,
    { ...sharedOptions, word: options.word }
  );

  const withoutWord = createCanvas(canvasWidth, headerHeight);
  renderHeader(
    withoutWord.getContext(
      "2d"
    ) as unknown as globalThis.CanvasRenderingContext2D,
    { ...sharedOptions, word: "" }
  );

  return {
    rendered,
    withoutWord,
    protectedBounds: protectedWordBounds(
      canvasWidth,
      headerHeight,
      loopComponents
    ),
    drawnImages,
  };
}

function drawLegacyShortGlyphWord(
  canvas: ReturnType<typeof createCanvas>,
  word: string,
  glyphImages: Map<string, GlyphImageData>
): void {
  const context = canvas.getContext("2d");
  const availableHeight = canvas.height * HEADER_GLYPH_HEIGHT_RATIO;
  const letterGap = canvas.height * HEADER_LETTER_GAP_RATIO;
  const tokens = tokenizeGlyphWord(word);
  let totalWidth = 0;

  for (const token of tokens) {
    const data = glyphImages.get(token);
    if (!data) continue;
    const scale = availableHeight / data.naturalHeight;
    totalWidth += data.naturalWidth * scale + letterGap;
  }
  if (totalWidth > 0) totalWidth -= letterGap;

  let cursorX = canvas.width / 2 - totalWidth / 2;
  const glyphY = canvas.height / 2 - availableHeight / 2;
  for (const token of tokens) {
    const data = glyphImages.get(token);
    if (!data) continue;
    const scale = availableHeight / data.naturalHeight;
    const glyphWidth = data.naturalWidth * scale;
    context.drawImage(
      data.image as never,
      cursorX,
      glyphY,
      glyphWidth,
      availableHeight
    );
    cursorX += glyphWidth + letterGap;
  }
}

describe("MCP rendering boundaries", () => {
  it("uses the normal static rotation map and leaves direction to mirroring", () => {
    const locations = ["n", "e", "s", "w", "ne", "se", "sw", "nw"];

    for (const location of locations) {
      assert.equal(
        calculateArrowRotation(
          "static",
          location,
          "cw",
          undefined,
          undefined,
          true
        ),
        calculateArrowRotation(
          "static",
          location,
          "ccw",
          undefined,
          undefined,
          true
        )
      );
      assert.equal(
        calculateArrowRotation(
          "static",
          location,
          "cw",
          undefined,
          undefined,
          false
        ),
        calculateArrowRotation(
          "static",
          location,
          "ccw",
          undefined,
          undefined,
          false
        )
      );
    }

    assert.equal(
      calculateArrowRotation("static", "w", "ccw", undefined, undefined, true),
      270
    );
    assert.equal(
      calculateArrowRotation("static", "w", "ccw", undefined, undefined, false),
      90
    );
  });

  it("uses canonical step turns instead of overwriting them at render time", () => {
    const step = {
      stepNumber: 5,
      leftMotion: { turns: 0 },
      rightMotion: { turns: 1 },
    } as Parameters<typeof resolveRenderedTurns>[0];
    const unrelatedFallback = {
      left: [0, 0, 0, 0, 1],
      right: [0, 0, 0, 0, 0],
    };

    assert.deepEqual(resolveRenderedTurns(step, unrelatedFallback), {
      left: 0,
      right: 1,
    });
  });

  it("keeps the legacy allocation only when a step has no turn data", () => {
    const step = {
      stepNumber: 2,
      leftMotion: {},
      rightMotion: {},
    } as Parameters<typeof resolveRenderedTurns>[0];
    const fallback = {
      left: [0, 1],
      right: [1, 0],
    };

    assert.deepEqual(resolveRenderedTurns(step, fallback), {
      left: 1,
      right: 0,
    });
  });

  it("labels a generated sequence with every rendered beat, including bridges", () => {
    const steps = [
      { stepNumber: 0, letter: "α" },
      { stepNumber: 1, letter: "Σ", isBridge: false },
      { stepNumber: 2, letter: "W", isBridge: true },
      { stepNumber: 3, letter: "Σ", isBridge: false },
    ] as Parameters<typeof resolveHeaderDisplay>[0];

    assert.deepEqual(resolveHeaderDisplay(steps, "ΣΣ"), {
      word: "ΣWΣ",
      letterStyles: [
        { letter: "Σ", isBridge: false, isDerived: false },
        { letter: "W", isBridge: true, isDerived: false },
        { letter: "Σ", isBridge: false, isDerived: false },
      ],
    });
  });

  it("keeps an explicit LOOP seed word compact", () => {
    const steps = [
      { stepNumber: 0, letter: "α" },
      { stepNumber: 1, letter: "Σ", isBridge: false },
      { stepNumber: 2, letter: "W", isBridge: true },
      { stepNumber: 3, letter: "Σ", isBridge: false },
      { stepNumber: 4, letter: "Σ", isBridge: false },
    ] as Parameters<typeof resolveHeaderDisplay>[0];

    assert.equal(resolveHeaderDisplay(steps, "ΣWΣΣ", "ΣΣ", [4]).word, "ΣΣ");
  });

  it("preserves explicit performer hands when converting engine output", () => {
    const motion = {
      motionType: "shift",
      rotationDirection: "cw",
      startLocation: "n",
      endLocation: "e",
      startOrientation: "in",
      endOrientation: "in",
    };
    const buildResult = {
      sequence: [
        {
          letter: "A",
          startPosition: "alpha1",
          endPosition: "alpha3",
          motions: {
            left: { ...motion },
            right: { ...motion },
          },
          stepNumber: 0,
        },
      ],
      bridgeStepIndices: [],
    } as unknown as Parameters<typeof convertToSequenceResult>[0];

    const result = convertToSequenceResult(buildResult, {
      gridMode: "diamond",
      level: 2,
    });

    assert.equal(result.steps[0]?.leftMotion.hand, "left");
    assert.equal(result.steps[0]?.rightMotion.hand, "right");
  });

  it("scopes blue and red fan styles inside one pictograph", async () => {
    const renderer = getStandaloneRenderer();
    const svg = await renderer.renderToSvg(
      {
        letter: "A",
        startPosition: "alpha1",
        endPosition: "alpha3",
        gridMode: "diamond",
        leftMotion: {
          motionType: "pro",
          rotationDirection: "cw",
          startLocation: "n",
          endLocation: "e",
          startOrientation: "in",
          hand: "left",
          turns: 0,
        },
        rightMotion: {
          motionType: "anti",
          rotationDirection: "ccw",
          startLocation: "s",
          endLocation: "w",
          startOrientation: "in",
          hand: "right",
          turns: 0,
        },
      },
      {
        darkMode: true,
        showGrid: false,
        showTKA: false,
        leftPropType: "fan",
        rightPropType: "fan",
      }
    );

    assert.ok(svg.includes(".st0-blue{fill:#3575E2;}"));
    assert.ok(svg.includes('class="st0-blue"'));
    assert.ok(svg.includes(".st0-red{fill:#ED1C24;}"));
    assert.ok(svg.includes('class="st0-red"'));
    assert.doesNotMatch(svg, /class="st0"/);
  });

  it("renders a nonzero static arrow while keeping zero-turn static motion arrowless", async () => {
    const renderer = getStandaloneRenderer();
    const input: PictographInput = {
      letter: "Σ",
      startPosition: "alpha3",
      endPosition: "gamma1",
      gridMode: "diamond",
      leftMotion: {
        motionType: "static",
        rotationDirection: "cw",
        startLocation: "w",
        endLocation: "w",
        startOrientation: "out",
        hand: "left",
        turns: 1,
      },
      rightMotion: {
        motionType: "pro",
        rotationDirection: "ccw",
        startLocation: "e",
        endLocation: "n",
        startOrientation: "out",
        hand: "right",
        turns: 0,
      },
    };
    const visibility = {
      darkMode: true,
      showGrid: false,
      showTKA: false,
      showLeftMotion: true,
      showRightMotion: false,
      leftPropType: "fan",
    };

    const oneTurnSvg = await renderer.renderToSvg(input, visibility);
    const zeroTurnSvg = await renderer.renderToSvg(
      {
        ...input,
        leftMotion: { ...input.leftMotion, turns: 0 },
      },
      visibility
    );

    assert.match(oneTurnSvg, /class="svg-arrow svg-arrow-blue"/);
    assert.doesNotMatch(zeroTurnSvg, /class="svg-arrow svg-arrow-blue"/);
  });

  it("renders an interradial quarter-turn arrow through the shared asset resolver", async () => {
    const renderer = getStandaloneRenderer();
    const svg = await renderer.renderToSvg(
      {
        letter: "H",
        startPosition: "beta3",
        endPosition: "beta5",
        gridMode: "diamond",
        leftMotion: {
          motionType: "pro",
          rotationDirection: "cw",
          startLocation: "n",
          endLocation: "e",
          startOrientation: "clockIn",
          endOrientation: "in",
          hand: "left",
          turns: 0.25,
        },
        rightMotion: {
          motionType: "anti",
          rotationDirection: "ccw",
          startLocation: "s",
          endLocation: "w",
          startOrientation: "counterIn",
          endOrientation: "out",
          hand: "right",
          turns: 0.25,
        },
      },
      {
        darkMode: true,
        showGrid: false,
        showTKA: true,
      }
    );

    assert.match(svg, /class="svg-arrow svg-arrow-blue"/);
    assert.match(svg, /class="svg-arrow svg-arrow-red"/);
    assert.match(svg, /stroke:#3575E2/);
    assert.match(svg, /stroke:#ED1C24/);
    // MCP normalizes orientation inputs to lowercase before resolving assets.
    // This path prefix belongs to pro/from_interradial_clock_in/pro_0.25.svg;
    // the generic nonradial quarter asset begins at M 51.8 instead.
    assert.match(svg, /M 76\.5 14\.0 C/);
    assert.doesNotMatch(svg, /M 51\.8 14\.0 C/);
    assert.equal(
      svg.match(/width="120" height="45" viewBox="0 0 120 45"/g)?.length,
      2
    );
  });

  it("loads canonical glyph assets, including Greek, bridge, and dash letters", async () => {
    const glyphs = await loadTkaGlyphImages("ΣWΘQVY-τ-", true);

    assert.equal(glyphs?.size, 7);
    assert.ok((glyphs?.get("Σ")?.naturalHeight ?? 0) > 0);
    assert.ok((glyphs?.get("W")?.naturalWidth ?? 0) > 0);
    assert.ok((glyphs?.get("Θ")?.naturalHeight ?? 0) > 0);
    assert.ok((glyphs?.get("Q")?.naturalWidth ?? 0) > 0);
    assert.equal(glyphs?.get("Y-")?.isDash, true);
    assert.equal(glyphs?.get("τ-")?.isDash, true);
  });

  it("renders a canonical header with glyph images instead of word text", async () => {
    const canvas = createCanvas(900, 120);
    const context = canvas.getContext("2d");
    const drawnText: string[] = [];
    let imageCount = 0;
    const originalFillText = context.fillText.bind(context);
    const originalDrawImage = context.drawImage.bind(context);

    context.fillText = ((...args: Parameters<typeof originalFillText>) => {
      drawnText.push(args[0]);
      return originalFillText(...args);
    }) as typeof context.fillText;
    context.drawImage = ((...args: Parameters<typeof originalDrawImage>) => {
      imageCount++;
      return originalDrawImage(...args);
    }) as typeof context.drawImage;

    await renderWordHeader(context, "ΣWΣ", 900, 120, 2, false, true);

    assert.equal(imageCount, 3);
    assert.ok(!drawnText.includes("ΣWΣ"));
  });

  it("keeps a fitting short-word raster byte-identical to the legacy layout", async () => {
    const canvasWidth = 900;
    const headerHeight = 100;
    const word = "ABC";
    const glyphImages = await loadTkaGlyphImages(word, false);
    assert.ok(glyphImages);

    const rendered = createCanvas(canvasWidth, headerHeight);
    renderHeader(
      rendered.getContext(
        "2d"
      ) as unknown as globalThis.CanvasRenderingContext2D,
      {
        canvasWidth,
        headerHeight,
        word,
        showDifficultyBadge: false,
        darkMode: false,
        glyphImages,
        glyphImagesAreThemeColored: true,
      }
    );

    const legacy = createCanvas(canvasWidth, headerHeight);
    renderHeader(
      legacy.getContext("2d") as unknown as globalThis.CanvasRenderingContext2D,
      {
        canvasWidth,
        headerHeight,
        word: "",
        showDifficultyBadge: false,
        darkMode: false,
      }
    );
    drawLegacyShortGlyphWord(legacy, word, glyphImages);

    const renderedPixels = rendered
      .getContext("2d")
      .getImageData(0, 0, canvasWidth, headerHeight).data;
    const legacyPixels = legacy
      .getContext("2d")
      .getImageData(0, 0, canvasWidth, headerHeight).data;
    assert.deepEqual(Buffer.from(renderedPixels), Buffer.from(legacyPixels));
  });

  it("fits a non-repeating long word between the badge and LOOP icon zones", async () => {
    const result = await renderRasterHeader({
      word: "W-Θ-OYEΩ-X-Ω-OZDΘ-",
    });
    const wordBounds = findChangedPixelBounds(
      result.rendered,
      result.withoutWord
    );

    assert.ok(
      wordBounds.left >= Math.floor(result.protectedBounds.left),
      `word begins at ${wordBounds.left}, inside the protected left zone ending at ${result.protectedBounds.left}`
    );
    assert.ok(
      wordBounds.right <= Math.ceil(result.protectedBounds.right),
      `word ends at ${wordBounds.right}, inside the protected right zone starting at ${result.protectedBounds.right}`
    );
    for (const image of result.drawnImages) {
      assert.equal(image.y + image.height / 2, result.rendered.height / 2);
    }
  });

  it("fits a compressed long word between the badge and LOOP icon zones", async () => {
    const result = await renderRasterHeader({
      word: "W-Θ-OYEΩ-W-Θ-OYEΩ-X-Ω-OZDΘ-",
      compressedSegments: [
        { tokens: ["W-", "Θ-", "O", "Y", "E", "Ω-"], repeat: 2 },
        { tokens: ["X-", "Ω-", "O", "Z", "D", "Θ-"], repeat: 1 },
      ],
    });
    const wordBounds = findChangedPixelBounds(
      result.rendered,
      result.withoutWord
    );

    assert.ok(
      wordBounds.left >= Math.floor(result.protectedBounds.left),
      `word begins at ${wordBounds.left}, inside the protected left zone ending at ${result.protectedBounds.left}`
    );
    assert.ok(
      wordBounds.right <= Math.ceil(result.protectedBounds.right),
      `word ends at ${wordBounds.right}, inside the protected right zone starting at ${result.protectedBounds.right}`
    );
    for (const image of result.drawnImages) {
      assert.equal(image.y + image.height / 2, result.rendered.height / 2);
    }
  });
});
