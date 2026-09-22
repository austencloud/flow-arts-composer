import { describe, it, expect, vi } from "vitest";
import { ExportGlyphPrerenderer } from "../export-glyph-prerenderer";
import { SvgImageConverter } from "$lib/shared/foundation/services/svg-image-converter";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import { getLetterImagePath } from "$lib/shared/pictograph/tka-glyph/utils/letter-image-getter";
import {
  getTurnNumberImagePath,
  HALF_MARK_IMAGE_PATH,
} from "$lib/shared/pictograph/tka-glyph/utils/turn-tuple-parser";
import { getSkewBraceLayout } from "$lib/shared/pictograph/tka-glyph/utils/skew-brace-layout";
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

  it("draws both braces for a skewed-frame beat and widens the composite on both edges", async () => {
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
    // Both braces are emitted as SVG <text> glyphs.
    expect(composite).toContain("{</text>");
    expect(composite).toContain("}</text>");

    // "(s, 0, 0)" displays no turns, so getTurnsColumnRightExtent is 0 and
    // getSkewBraceLayout's own dash-extent term is 0 for a non-dash letter
    // (Letter.A) - closeX + fontSize always dominates the plain letter
    // width in the composite's right-bound math (see buildAndCacheGlyph's
    // maxRight computation), so it is also the composite's pre-pad width.
    const braceLayout = getSkewBraceLayout(Letter.A, { width: 100, height: 100 }, {
      rightExtent: 0,
    });
    const expectedXOffset = Math.max(0, Math.ceil(-braceLayout.openX));
    const expectedWidth =
      Math.ceil(braceLayout.closeX + braceLayout.fontSize) + expectedXOffset;

    expect(asset!.xOffset).toBe(expectedXOffset);
    expect(asset!.dimensions.width).toBe(expectedWidth);
    // Widened past the bare 100-unit letter on both edges: xOffset alone
    // already exceeds 0, and the right edge clears the letter width too.
    expect(expectedXOffset).toBeGreaterThan(0);
    expect(asset!.dimensions.width).toBeGreaterThan(100 + expectedXOffset);
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
});
