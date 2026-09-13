/**
 * SVG asset corpus contract (Opus batch 2026-09-12 read-only audit).
 *
 * Every pictograph surface reads the same files under `static/`: the live
 * DOM, the composition worker raster, image export and print. A malformed
 * viewBox, a duplicate id or a fragment reference with no target does not
 * throw: the decoder silently drops geometry and the pictograph just looks
 * slightly wrong. That is exactly the silent class this suite exists for.
 *
 * These checks are read-only. They assert the shape of the shipped corpus and
 * name the exact file when it drifts. Findings are written up in
 * docs/reports/opus-batch-2026-09-12/svg-asset-contract-audit.md.
 */

import { describe, it, expect } from "vitest";
import { isValidPath } from "svg-path-commander";
import {
  INTENTIONAL_ZERO_DIMENSION_ASSETS,
  listSvgFiles,
  readSvg,
  type SvgRecord,
} from "./svg-corpus";

const CORPUS: SvgRecord[] = listSvgFiles("static").map(readSvg);

/**
 * Dangling `url(#...)` targets that live only inside dead `.stN` rules of the
 * Illustrator `<style>` block. Every one of them is a clip-path or gradient
 * rule whose class is applied by no element in the file, so the browser never
 * resolves the reference. Recorded rather than ignored: if a future art pass
 * starts using one of those classes the reference becomes live and broken.
 */
const DEAD_STYLE_RULE_REFS: Record<string, number> = {
  "static/images/props/animated/bigtorch.svg": 2,
  "static/images/props/animated/torch.svg": 2,
  "static/images/props/bigtorch.svg": 2,
  "static/images/props/buttons/bigtorch.svg": 2,
  "static/images/props/buttons/torch.svg": 2,
  "static/images/props/pictograph/bigtorch.svg": 2,
  "static/images/props/pictograph/torch.svg": 2,
  "static/images/props/torch.svg": 3,
};

function parseXml(text: string): { ok: boolean; message: string } {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const error = doc.querySelector("parsererror");
  return error
    ? { ok: false, message: error.textContent?.trim().slice(0, 200) ?? "" }
    : { ok: true, message: "" };
}

describe("static SVG corpus", () => {
  it("finds the shipped asset corpus", () => {
    // Guards the walker itself: a broken path would make every check below
    // vacuously pass over an empty list.
    expect(CORPUS.length).toBeGreaterThan(400);
  });

  it("uses a parser that actually reports malformed XML", () => {
    // Without this the well-formedness check could pass on anything.
    expect(parseXml("<svg><g></svg>").ok).toBe(false);
    expect(parseXml('<svg xmlns="http://www.w3.org/2000/svg"/>').ok).toBe(true);
  });

  it("parses every asset as well-formed XML", () => {
    const broken = CORPUS.filter((svg) => !parseXml(svg.text).ok).map(
      (svg) => `${svg.file}: ${parseXml(svg.text).message}`
    );
    expect(broken).toEqual([]);
  });

  it("gives every asset an <svg> root in the SVG namespace", () => {
    const bad = CORPUS.filter(
      (svg) =>
        !svg.rootTag ||
        !/\bxmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(
          svg.rootTag
        )
    ).map((svg) => svg.file);
    expect(bad).toEqual([]);
  });

  it("declares the xlink namespace wherever an xlink attribute is used", () => {
    const bad = CORPUS.filter(
      (svg) => /\bxlink:/.test(svg.text) && !/xmlns:xlink\s*=/.test(svg.text)
    ).map((svg) => svg.file);
    expect(bad).toEqual([]);
  });

  it("gives every drawable asset a four-number viewBox", () => {
    const zeroDimension = new Set<string>(INTENTIONAL_ZERO_DIMENSION_ASSETS);
    const bad = CORPUS.filter(
      (svg) => !zeroDimension.has(svg.file) && svg.box === null
    ).map((svg) => `${svg.file} (viewBox=${svg.viewBox ?? "absent"})`);
    expect(bad).toEqual([]);
  });

  it("gives every drawable asset a positive viewBox extent", () => {
    const zeroDimension = new Set<string>(INTENTIONAL_ZERO_DIMENSION_ASSETS);
    const bad = CORPUS.filter((svg) => {
      if (zeroDimension.has(svg.file) || !svg.box) return false;
      const [, , width, height] = svg.box;
      return !(width > 0) || !(height > 0);
    }).map((svg) => `${svg.file} (${svg.viewBox})`);
    expect(bad).toEqual([]);
  });

  it("keeps the zero-dimension placeholder set to the four documented files", () => {
    // `extractSvgContent()` (arrow-svg-parser.ts) returns "" for any markup
    // containing width="0". A fifth file joining this set by accident would
    // render nothing with no error anywhere.
    const zeroed = CORPUS.filter(
      (svg) => svg.rootWidth !== null && Number.parseFloat(svg.rootWidth) === 0
    ).map((svg) => svg.file);
    expect(zeroed.sort()).toEqual(
      [...INTENTIONAL_ZERO_DIMENSION_ASSETS].sort()
    );
  });

  it("never repeats an id inside one asset", () => {
    // Props are inlined into a shared pictograph document, so a duplicate id
    // inside a single file becomes an ambiguous reference in the composed DOM.
    const bad: string[] = [];
    for (const svg of CORPUS) {
      const counts = new Map<string, number>();
      for (const id of svg.ids) counts.set(id, (counts.get(id) ?? 0) + 1);
      const dupes = [...counts].filter(([, n]) => n > 1);
      if (dupes.length) {
        bad.push(
          `${svg.file}: ${dupes.map(([id, n]) => `${id}×${n}`).join(", ")}`
        );
      }
    }
    expect(bad).toEqual([]);
  });

  it("resolves every fragment reference inside its own file", () => {
    const bad: string[] = [];
    for (const svg of CORPUS) {
      const ids = new Set(svg.ids);
      const dangling = [...new Set(svg.fragmentRefs)].filter(
        (ref) => !ids.has(ref)
      );
      const allowed = DEAD_STYLE_RULE_REFS[svg.file] ?? 0;
      if (dangling.length !== allowed) {
        bad.push(
          `${svg.file}: ${dangling.length} dangling (expected ${allowed}) -> ${dangling.join(", ")}`
        );
      }
    }
    expect(bad).toEqual([]);
  });

  it("keeps every path `d` attribute parseable", () => {
    const bad: string[] = [];
    for (const svg of CORPUS) {
      svg.pathData.forEach((d, index) => {
        if (!isValidPath(d)) {
          bad.push(`${svg.file} path[${index}]: ${d.slice(0, 60)}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });

  it("references no external resource and embeds no script", () => {
    const bad: string[] = [];
    for (const svg of CORPUS) {
      if (/<script\b/i.test(svg.text)) bad.push(`${svg.file}: <script>`);
      for (const match of svg.text.matchAll(
        /\b(?:xlink:href|href)\s*=\s*["'](?!#|data:)([^"']+)["']/g
      )) {
        bad.push(`${svg.file}: external href ${match[1]!.slice(0, 60)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("grid asset geometry contract", () => {
  const grids = CORPUS.filter((svg) =>
    svg.file.startsWith("static/images/grid/")
  );

  it("keeps every grid on the 950×950 pictograph coordinate system", () => {
    // Grid coordinates are consumed as raw pictograph units. A grid authored in
    // a different box would offset every prop and arrow on it.
    expect(grids.length).toBeGreaterThan(0);
    for (const grid of grids) {
      expect(grid.box, grid.file).toEqual([0, 0, 950, 950]);
    }
  });
});

describe("arrow asset geometry contract", () => {
  const arrows = CORPUS.filter(
    (svg) =>
      svg.file.startsWith("static/images/arrows/") &&
      !INTENTIONAL_ZERO_DIMENSION_ASSETS.includes(
        svg.file as (typeof INTENTIONAL_ZERO_DIMENSION_ASSETS)[number]
      )
  );

  it("anchors every arrow viewBox at the origin", () => {
    // parseArrowSvg() rebuilds the box as `0 0 W H` and drops minX/minY. A
    // non-zero origin would shift the glyph by exactly that amount with no
    // error reported anywhere.
    const offset = arrows
      .filter((svg) => svg.box && (svg.box[0] !== 0 || svg.box[1] !== 0))
      .map((svg) => `${svg.file} (${svg.viewBox})`);
    expect(offset).toEqual([]);
  });

  it("declares `centerPoint` as an invisible circle wherever it exists", () => {
    // parseArrowSvg() reads cx/cy off `#centerPoint`; both color transformers
    // delete it with a `<circle ...>`-specific regex. Any other element type
    // would survive the transform and draw a dot on the pictograph.
    const marked = arrows.filter((svg) =>
      /id=["']centerPoint["']/.test(svg.text)
    );
    expect(marked.length).toBeGreaterThan(0);
    for (const svg of marked) {
      const tag =
        svg.text.match(/<[^>]*\bid=["']centerPoint["'][^>]*>/)?.[0] ?? "";
      expect(tag.startsWith("<circle"), `${svg.file}: ${tag}`).toBe(true);
      expect(tag, svg.file).toMatch(/fill=["']none["']/);
    }
  });

  it("keeps the sub-50-unit viewBox rescale confined to the legacy dash glyph", () => {
    // parseArrowSvg() silently multiplies any arrow whose viewBox is smaller
    // than 50×50 up to 250 units. Only the unrouted legacy /images/arrows/dash.svg
    // matches today; a newly authored small-box arrow would be scaled without
    // anyone asking for it.
    const tiny = arrows
      .filter((svg) => svg.box && svg.box[2] < 50 && svg.box[3] < 50)
      .map((svg) => svg.file);
    expect(tiny).toEqual(["static/images/arrows/dash.svg"]);
  });
});

describe("pictograph prop geometry contract", () => {
  const pictographProps = CORPUS.filter((svg) =>
    svg.file.startsWith("static/images/props/pictograph/")
  );

  it("anchors every pictograph prop viewBox at the origin", () => {
    // parsePropSvg() derives the rotation anchor as (width / 2, height / 2),
    // which is only the box centre when minX and minY are zero.
    expect(pictographProps.length).toBeGreaterThan(40);
    const offset = pictographProps
      .filter((svg) => svg.box && (svg.box[0] !== 0 || svg.box[1] !== 0))
      .map((svg) => `${svg.file} (${svg.viewBox})`);
    expect(offset).toEqual([]);
  });

  it("records the animated prop artwork whose box is not at the origin", () => {
    // PropSvgLoader reads this directory under useGridVersion and derives the
    // same (width / 2, height / 2) anchor. For these two the box centre is
    // (minX + width / 2, minY + height / 2), so the anchor sits off by exactly
    // (-minX, -minY): 30 × 10.1 units for torch, 38.5 × 12.35 for bigtorch.
    // The animation canvas reaches the same files through svg-generator, which
    // uses width/height only, so it is unaffected.
    const offset = CORPUS.filter(
      (svg) =>
        svg.file.startsWith("static/images/props/animated/") &&
        svg.box &&
        (svg.box[0] !== 0 || svg.box[1] !== 0)
    ).map((svg) => `${svg.file} (${svg.viewBox})`);

    expect(offset.sort()).toEqual([
      "static/images/props/animated/bigtorch.svg (-38.5 -12.35 402 57.3)",
      "static/images/props/animated/torch.svg (-30 -10.1 360 35.7)",
    ]);
  });
});
