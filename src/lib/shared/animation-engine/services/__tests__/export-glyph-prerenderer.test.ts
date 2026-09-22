import { describe, it, expect, vi } from "vitest";
import { ExportGlyphPrerenderer } from "../export-glyph-prerenderer";
import { SvgImageConverter } from "$lib/shared/foundation/services/svg-image-converter";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  getLetterImagePath,
  isDashLetter,
} from "$lib/shared/pictograph/tka-glyph/utils/letter-image-getter";
import {
  getTurnNumberImagePath,
  HALF_MARK_IMAGE_PATH,
  parseTurnsTuple,
  getTurnNumberWidth,
  getSlotUnitWidth,
  getSlotOffsetX,
  MARK_GAP,
} from "$lib/shared/pictograph/tka-glyph/utils/turn-tuple-parser";
import {
  DEFAULT_SKEW_BRACE_INK,
  getSkewBraceLayout,
  placeSkewBraceGlyphs,
} from "$lib/shared/pictograph/tka-glyph/utils/skew-brace-layout";
import { calculateTurnPositions } from "$lib/shared/pictograph/tka-glyph/utils/turn-position-calculator";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

// Coverage for the halved-motion mark parity fix
// (docs/superpowers/specs/2026-07-16-half-notation-canon-design.md ledger):
// the video-export prerenderer's composite SVG string must inline the same
// half.svg mark the live TurnsColumn.svelte draws, not silently drop it.
//
// buildAndCacheGlyph is private and takes pre-fetched svgTextCache/
// svgDimsCache maps as parameters, so it can be exercised directly (no
// network fetch, no real canvas/browser image decode - just the pure
// composite-SVG-string assembly) by pre-seeding those caches and swapping in
// a stub SvgImageConverter that captures the string it was asked to convert.
describe("ExportGlyphPrerenderer - halved-motion mark", () => {
  function makeConverter(): { converter: SvgImageConverter; getCaptured: () => string } {
    const converter = new SvgImageConverter();
    let captured = "";
    vi.spyOn(converter, "convertSvgStringToImage").mockImplementation(
      async (svgString: string) => {
        captured = svgString;
        return {} as HTMLImageElement;
      }
    );
    return { converter, getCaptured: () => captured };
  }

  it("inlines the half-mark SVG content for a halved, displayed top slot", async () => {
    const { converter, getCaptured } = makeConverter();
    const prerenderer = new ExportGlyphPrerenderer(converter);

    const letterPath = getLetterImagePath(Letter.A);
    const topPath = getTurnNumberImagePath(1);
    const bottomPath = getTurnNumberImagePath(2);

    const svgTextCache = new Map<string, string>([
      [letterPath, `<svg viewBox="0 0 100 100"><path d="M0 0"/></svg>`],
      [topPath, `<svg viewBox="0 0 30 45"><path id="TOP_NUMBER" d="M1 1"/></svg>`],
      [bottomPath, `<svg viewBox="0 0 30 45"><path id="BOTTOM_NUMBER" d="M2 2"/></svg>`],
      [
        HALF_MARK_IMAGE_PATH,
        `<svg viewBox="0 0 16 45"><path id="HALF_MARK" d="M3 3"/></svg>`,
      ],
    ]);
    const svgDimsCache = new Map();

    // "(1/, 2)" -> top halved+displayed, bottom displayed+unhalved
    const buildAndCacheGlyph = (
      prerenderer as unknown as {
        buildAndCacheGlyph: (
          key: string,
          data: {
            letter: string;
            turnsTuple: string;
            topColor: string;
            bottomColor: string;
            step: StepData;
          },
          isDarkMode: boolean,
          svgTextCache: Map<string, string>,
          svgDimsCache: Map<string, unknown>
        ) => Promise<void>;
      }
    ).buildAndCacheGlyph.bind(prerenderer);

    await buildAndCacheGlyph(
      "test-key",
      {
        letter: Letter.A,
        turnsTuple: "(1/, 2)",
        topColor: "#3575E2",
        bottomColor: "#ED1C24",
        step: {} as StepData,
      },
      false,
      svgTextCache,
      svgDimsCache
    );

    expect(prerenderer.getGlyph("test-key")).not.toBeNull();

    const composite = getCaptured();
    expect(composite).toContain("HALF_MARK");
    expect(composite).toContain("TOP_NUMBER");
    expect(composite).toContain("BOTTOM_NUMBER");
  });

  it("inlines the half-mark alone (no number) for a halved 0-turn slot", async () => {
    const { converter, getCaptured } = makeConverter();
    const prerenderer = new ExportGlyphPrerenderer(converter);

    const letterPath = getLetterImagePath(Letter.A);

    const svgTextCache = new Map<string, string>([
      [letterPath, `<svg viewBox="0 0 100 100"><path d="M0 0"/></svg>`],
      [
        HALF_MARK_IMAGE_PATH,
        `<svg viewBox="0 0 16 45"><path id="HALF_MARK" d="M3 3"/></svg>`,
      ],
    ]);
    const svgDimsCache = new Map();

    const buildAndCacheGlyph = (
      prerenderer as unknown as {
        buildAndCacheGlyph: (
          key: string,
          data: {
            letter: string;
            turnsTuple: string;
            topColor: string;
            bottomColor: string;
            step: StepData;
          },
          isDarkMode: boolean,
          svgTextCache: Map<string, string>,
          svgDimsCache: Map<string, unknown>
        ) => Promise<void>;
      }
    ).buildAndCacheGlyph.bind(prerenderer);

    // "(0/, 0)" -> top halved with a 0 value (mark-alone), bottom not shown at all
    await buildAndCacheGlyph(
      "test-key-zero",
      {
        letter: Letter.A,
        turnsTuple: "(0/, 0)",
        topColor: "#3575E2",
        bottomColor: "#ED1C24",
        step: {} as StepData,
      },
      false,
      svgTextCache,
      svgDimsCache
    );

    expect(prerenderer.getGlyph("test-key-zero")).not.toBeNull();

    const composite = getCaptured();
    expect(composite).toContain("HALF_MARK");
  });
});

// Coverage for the skew-brace fix in commit 5d60c5fa27 (feat(render): draw
// skew braces in the video-export prerenderer and the animation glyph
// overlay) plus the xOffset fix that followed it: a skewed-frame beat's
// braces must be emitted, and the composite's returned xOffset must equal
// the left pad the caller (export-frame-compositor.ts) has to shift its
// draw position by so nothing lands to the right of where the live canvas
// puts it.
describe("ExportGlyphPrerenderer - skew braces", () => {
  function makeConverter(): { converter: SvgImageConverter; getCaptured: () => string } {
    const converter = new SvgImageConverter();
    let captured = "";
    vi.spyOn(converter, "convertSvgStringToImage").mockImplementation(
      async (svgString: string) => {
        captured = svgString;
        return {} as HTMLImageElement;
      }
    );
    return { converter, getCaptured: () => captured };
  }

  function bindBuildAndCacheGlyph(prerenderer: ExportGlyphPrerenderer) {
    return (
      prerenderer as unknown as {
        buildAndCacheGlyph: (
          key: string,
          data: {
            letter: string;
            turnsTuple: string;
            topColor: string;
            bottomColor: string;
            step: StepData;
          },
          isDarkMode: boolean,
          svgTextCache: Map<string, string>,
          svgDimsCache: Map<string, unknown>
        ) => Promise<void>;
      }
    ).buildAndCacheGlyph.bind(prerenderer);
  }

  it("draws both braces for a skewed-frame beat with their ink inside the composite, centred on the letter", async () => {
    const { converter, getCaptured } = makeConverter();
    const prerenderer = new ExportGlyphPrerenderer(converter);
    const buildAndCacheGlyph = bindBuildAndCacheGlyph(prerenderer);

    const letterPath = getLetterImagePath(Letter.A);
    const svgTextCache = new Map<string, string>([
      [letterPath, `<svg viewBox="0 0 100 100"><path d="M0 0"/></svg>`],
    ]);
    const svgDimsCache = new Map();

    // Left hand on a cardinal point (n), right hand on an intercardinal
    // point (ne) - isSkewedFrameBeat's mixed-pair gate (skewed-frame.ts).
    // isVisibleMotion only requires isVisible !== false, so this minimal
    // shape is enough without building a full MotionData.
    const skewedStep = {
      motions: {
        left: { isVisible: true, startLocation: "n", endLocation: "n" },
        right: { isVisible: true, startLocation: "ne", endLocation: "ne" },
      },
    } as unknown as StepData;

    await buildAndCacheGlyph(
      "test-key-skewed",
      {
        letter: Letter.A,
        turnsTuple: "(s, 0, 0)",
        topColor: "#3575E2",
        bottomColor: "#ED1C24",
        step: skewedStep,
      },
      false,
      svgTextCache,
      svgDimsCache
    );

    const asset = prerenderer.getGlyph("test-key-skewed");
    expect(asset).not.toBeNull();

    const composite = getCaptured();
    const braceText = (glyph: "{" | "}") => {
      const end = composite.indexOf(`>${glyph}</text>`);
      expect(end, `${glyph} brace`).toBeGreaterThan(0);
      const attrs = composite.slice(composite.lastIndexOf("<text ", end), end);
      const attr = (name: string) => attrs.match(new RegExp(`${name}="([^"]+)"`))?.[1];
      return {
        x: Number(attr("x")),
        y: Number(attr("y")),
        anchor: attr("text-anchor"),
        baseline: attr("dominant-baseline"),
      };
    };
    const open = braceText("{");
    const close = braceText("}");

    // "(s, 0, 0)" displays no turns, so nothing pads the composite
    // vertically and the closing brace clears only the plain letter.
    // Node has no canvas to measure with, so the default ink applies.
    const braceLayout = getSkewBraceLayout(Letter.A, { width: 100, height: 100 }, {
      rightExtent: 0,
    });
    const ink = DEFAULT_SKEW_BRACE_INK;
    const fontSize = braceLayout.fontSize;
    const glyphs = placeSkewBraceGlyphs(braceLayout, ink);

    // Start-anchored on the alphabetic baseline: the only baseline whose
    // position against the glyph's ink the ink metrics describe.
    for (const brace of [open, close]) {
      expect(brace.anchor).toBe("start");
      expect(brace.baseline).toBe("alphabetic");
    }
    expect(open.x).toBeCloseTo(glyphs.open.x + asset!.xOffset);
    expect(close.x).toBeCloseTo(glyphs.close.x + asset!.xOffset);

    // Ink centred on the 100-unit letter.
    expect(open.y - ((ink.open.ascent - ink.open.descent) / 2) * fontSize).toBeCloseTo(50);
    expect(close.y - ((ink.close.ascent - ink.close.descent) / 2) * fontSize).toBeCloseTo(50);

    // The letter shifts by the same pad the caller is told about...
    expect(composite).toContain(`<g transform="translate(${asset!.xOffset}, 0)"`);
    // ...and that pad keeps the opening brace's ink inside the viewBox. A pad
    // of just the 14-unit gap left the whole glyph at negative x, where the
    // rasterised composite clipped it away.
    expect(open.x - ink.open.left * fontSize).toBeGreaterThanOrEqual(0);
    expect(close.x + ink.close.right * fontSize).toBeLessThanOrEqual(asset!.dimensions.width);
  });

  it("leaves a plain (non-skewed) beat's composite exactly as before the skew-brace feature", async () => {
    // Not a golden byte-for-byte string captured from the pre-5d60c5fa27
    // revision: this private method's composite depends on the mock SVG
    // fixtures below, and pinning the exact serialized string would make
    // the test brittle to unrelated formatting changes without adding real
    // protection. Instead this asserts the specific contract the xOffset
    // fix must preserve for a plain beat: zero horizontal pad, no brace
    // glyphs, and the same unpadded width buildAndCacheGlyph always
    // produced for a plain letter with no turns and no dash.
    const { converter, getCaptured } = makeConverter();
    const prerenderer = new ExportGlyphPrerenderer(converter);
    const buildAndCacheGlyph = bindBuildAndCacheGlyph(prerenderer);

    const letterPath = getLetterImagePath(Letter.A);
    const svgTextCache = new Map<string, string>([
      [letterPath, `<svg viewBox="0 0 100 100"><path d="M0 0"/></svg>`],
    ]);
    const svgDimsCache = new Map();

    await buildAndCacheGlyph(
      "test-key-plain",
      {
        letter: Letter.A,
        turnsTuple: "(s, 0, 0)",
        topColor: "#3575E2",
        bottomColor: "#ED1C24",
        step: {} as StepData,
      },
      false,
      svgTextCache,
      svgDimsCache
    );

    const asset = prerenderer.getGlyph("test-key-plain");
    expect(asset).not.toBeNull();

    const composite = getCaptured();
    expect(composite).not.toContain("{</text>");
    expect(composite).not.toContain("}</text>");

    expect(asset!.xOffset).toBe(0);
    expect(asset!.dimensions.width).toBe(100);
  });

  // Coverage for the follow-up fix to 0ccb4822ab: xOffset was proven correct
  // for the composite's own bounds (the tests above), but the four x
  // coordinates the same threading actually shifts - a top/bottom turn
  // number's <g transform> and a top/bottom halved-motion mark's <g
  // transform>, per buildAndCacheGlyph's appendTurnNumber/appendHalfMark
  // calls - were never individually exercised. "(s, 1/, 2/)" both displays a
  // number and carries the halved marker on both slots, so a single tuple
  // exercises all four.
  it("shifts a turn number's and half mark's x by xOffset for a real turns tuple on a skewed step", async () => {
    const { converter, getCaptured } = makeConverter();
    const prerenderer = new ExportGlyphPrerenderer(converter);
    const buildAndCacheGlyph = bindBuildAndCacheGlyph(prerenderer);

    const letterPath = getLetterImagePath(Letter.A);
    const topPath = getTurnNumberImagePath(1);
    const bottomPath = getTurnNumberImagePath(2);
    const svgTextCache = new Map<string, string>([
      [letterPath, `<svg viewBox="0 0 100 100"><path d="M0 0"/></svg>`],
      [topPath, `<svg viewBox="0 0 30 45"><path id="TOP_NUMBER" d="M1 1"/></svg>`],
      [bottomPath, `<svg viewBox="0 0 30 45"><path id="BOTTOM_NUMBER" d="M2 2"/></svg>`],
      [
        HALF_MARK_IMAGE_PATH,
        `<svg viewBox="0 0 16 45"><path id="HALF_MARK" d="M3 3"/></svg>`,
      ],
    ]);
    const svgDimsCache = new Map();

    const skewedStep = {
      motions: {
        left: { isVisible: true, startLocation: "n", endLocation: "n" },
        right: { isVisible: true, startLocation: "ne", endLocation: "ne" },
      },
    } as unknown as StepData;

    await buildAndCacheGlyph(
      "test-key-skewed-turns",
      {
        letter: Letter.A,
        turnsTuple: "(s, 1/, 2/)",
        topColor: "#3575E2",
        bottomColor: "#ED1C24",
        step: skewedStep,
      },
      false,
      svgTextCache,
      svgDimsCache
    );

    const asset = prerenderer.getGlyph("test-key-skewed-turns");
    expect(asset).not.toBeNull();
    expect(asset!.xOffset).toBeGreaterThan(0);

    const { topNumberBaseX, topHalfMarkBaseX, bottomNumberBaseX, bottomHalfMarkBaseX } =
      computeUnpaddedTurnXs(Letter.A, "(s, 1/, 2/)");
    const [topNumberX, topHalfMarkX, bottomNumberX, bottomHalfMarkX] =
      extractTurnGroupXs(getCaptured());

    expect(topNumberX).toBe(topNumberBaseX + asset!.xOffset);
    expect(topHalfMarkX).toBe(topHalfMarkBaseX + asset!.xOffset);
    expect(bottomNumberX).toBe(bottomNumberBaseX + asset!.xOffset);
    expect(bottomHalfMarkX).toBe(bottomHalfMarkBaseX + asset!.xOffset);
  });

  it("leaves the same turns tuple's turn-number and half-mark x unchanged (xOffset 0) on a plain step", async () => {
    const { converter, getCaptured } = makeConverter();
    const prerenderer = new ExportGlyphPrerenderer(converter);
    const buildAndCacheGlyph = bindBuildAndCacheGlyph(prerenderer);

    const letterPath = getLetterImagePath(Letter.A);
    const topPath = getTurnNumberImagePath(1);
    const bottomPath = getTurnNumberImagePath(2);
    const svgTextCache = new Map<string, string>([
      [letterPath, `<svg viewBox="0 0 100 100"><path d="M0 0"/></svg>`],
      [topPath, `<svg viewBox="0 0 30 45"><path id="TOP_NUMBER" d="M1 1"/></svg>`],
      [bottomPath, `<svg viewBox="0 0 30 45"><path id="BOTTOM_NUMBER" d="M2 2"/></svg>`],
      [
        HALF_MARK_IMAGE_PATH,
        `<svg viewBox="0 0 16 45"><path id="HALF_MARK" d="M3 3"/></svg>`,
      ],
    ]);
    const svgDimsCache = new Map();

    await buildAndCacheGlyph(
      "test-key-plain-turns",
      {
        letter: Letter.A,
        turnsTuple: "(s, 1/, 2/)",
        topColor: "#3575E2",
        bottomColor: "#ED1C24",
        step: {} as StepData,
      },
      false,
      svgTextCache,
      svgDimsCache
    );

    const asset = prerenderer.getGlyph("test-key-plain-turns");
    expect(asset).not.toBeNull();
    expect(asset!.xOffset).toBe(0);

    const { topNumberBaseX, topHalfMarkBaseX, bottomNumberBaseX, bottomHalfMarkBaseX } =
      computeUnpaddedTurnXs(Letter.A, "(s, 1/, 2/)");
    const [topNumberX, topHalfMarkX, bottomNumberX, bottomHalfMarkX] =
      extractTurnGroupXs(getCaptured());

    expect(topNumberX).toBe(topNumberBaseX);
    expect(topHalfMarkX).toBe(topHalfMarkBaseX);
    expect(bottomNumberX).toBe(bottomNumberBaseX);
    expect(bottomHalfMarkX).toBe(bottomHalfMarkBaseX);
  });
});

// Recomputes the four unpadded (pre-xOffset) x coordinates
// buildAndCacheGlyph derives for a turns tuple's top/bottom number and
// top/bottom half mark, using the same real helpers the source does
// (calculateTurnPositions, getSlotOffsetX, getTurnNumberWidth, MARK_GAP)
// rather than hardcoded numbers, so this stays correct if those constants
// ever change.
function computeUnpaddedTurnXs(letter: Letter, turnsTuple: string) {
  const letterDims = { width: 100, height: 100 };
  const parsed = parseTurnsTuple(turnsTuple);
  const hasDash = isDashLetter(letter);
  const turnPositions = calculateTurnPositions(letterDims, 45, hasDash);

  const topOwnWidth = getTurnNumberWidth(parsed.top);
  const bottomOwnWidth = getTurnNumberWidth(parsed.bottom);
  const topUnit = getSlotUnitWidth(topOwnWidth, parsed.topHalved);
  const bottomUnit = getSlotUnitWidth(bottomOwnWidth, parsed.bottomHalved);
  const columnWidth = Math.max(topUnit, bottomUnit);
  const topOffsetX = getSlotOffsetX(columnWidth, topOwnWidth, parsed.topHalved);
  const bottomOffsetX = getSlotOffsetX(columnWidth, bottomOwnWidth, parsed.bottomHalved);

  const topNumberBaseX = turnPositions.top.x + topOffsetX;
  const topHalfMarkBaseX = topNumberBaseX + topOwnWidth + MARK_GAP;
  const bottomNumberBaseX = turnPositions.bottom.x + bottomOffsetX;
  const bottomHalfMarkBaseX = bottomNumberBaseX + bottomOwnWidth + MARK_GAP;

  return { topNumberBaseX, topHalfMarkBaseX, bottomNumberBaseX, bottomHalfMarkBaseX };
}

// Pulls the x from each of the composite's four turn/mark <g transform>
// groups in source order (buildAndCacheGlyph always pushes top number, top
// half mark, bottom number, bottom half mark in that order - see the
// appendTurnNumber/appendHalfMark call sequence).
function extractTurnGroupXs(composite: string): number[] {
  const groups = [
    ...composite.matchAll(
      /<g transform="translate\(([-\d.]+), [-\d.]+\)" filter="url\(#(?:top|bottom)-color\)">/g
    ),
  ];
  expect(groups).toHaveLength(4);
  return groups.map((m) => parseFloat(m[1]!));
}
