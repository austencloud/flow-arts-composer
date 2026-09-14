/**
 * Bitmap-decode sanitizer contract (Opus batch 2026-09-12 read-only audit).
 *
 * `sanitizeSvgForBitmap()` is the last thing that touches an SVG before it
 * becomes a drawable. Its job is to give viewBox-only artwork intrinsic
 * width/height, because a dimensionless HTMLImageElement makes a later
 * `createImageBitmap(img)` throw InvalidStateError and the asset is dropped
 * from the bundle that feeds the worker pool (see the comment on
 * `browserLoadImageFromUrl` in svg-image-cache.ts).
 *
 * Two halves here: what the real function does on inputs that expose its
 * edges, and whether the shipped corpus can reach those edges today.
 */

import { describe, it, expect } from "vitest";
import { sanitizeSvgForBitmap } from "$lib/shared/render/services/svg-bitmap-sanitize";
import { listSvgFiles, readSvg, type SvgRecord } from "./svg-corpus";

const CORPUS: SvgRecord[] = listSvgFiles("static").map(readSvg);

function rootTagOf(markup: string): string {
  return markup.match(/<svg\b[^>]*>/i)?.[0] ?? "";
}

function attr(tag: string, name: string): string[] {
  return [
    ...tag.matchAll(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "gi")),
  ].map((m) => m[1]!);
}

describe("sanitizeSvgForBitmap: measured behavior", () => {
  it("gives viewBox-only markup intrinsic dimensions from the viewBox", () => {
    const out = sanitizeSvgForBitmap(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 15.5"><path d="M0 0"/></svg>'
    );
    expect(attr(rootTagOf(out), "width")).toEqual(["300"]);
    expect(attr(rootTagOf(out), "height")).toEqual(["15.5"]);
  });

  it("strips the double-encoded style attribute the letter assets carry", () => {
    const out = sanitizeSvgForBitmap(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" style="style=&quot;fill:red&quot;"/>'
    );
    expect(out).not.toContain("style=&quot;");
  });

  it("reads only whitespace-separated viewBox numbers", () => {
    // A comma-separated viewBox is legal SVG. The sanitizer splits on
    // whitespace only, so every number after the first is NaN and the fallback
    // 100x100 box is injected: a silently wrong aspect ratio, not an error.
    const out = sanitizeSvgForBitmap(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,300,15.5"/>'
    );
    expect(attr(rootTagOf(out), "width")).toEqual(["100"]);
    expect(attr(rootTagOf(out), "height")).toEqual(["100"]);
  });

  it("counts a root stroke-width as the width it is looking for", () => {
    // The presence test is /<svg[^>]*\bwidth\s*=/ and `\b` matches inside
    // "stroke-width". A root carrying stroke-width and height but no width
    // therefore looks fully dimensioned, nothing is injected, and the decode
    // produces exactly the dimensionless image the injection exists to prevent.
    const out = sanitizeSvgForBitmap(
      '<svg xmlns="http://www.w3.org/2000/svg" stroke-width="2" height="15.5" viewBox="0 0 300 15.5"/>'
    );
    expect(attr(rootTagOf(out), "width")).toEqual([]);
    expect(attr(rootTagOf(out), "height")).toEqual(["15.5"]);

    // The same root without stroke-width is repaired, which pins the cause on
    // the word-boundary match rather than on the missing width itself.
    const control = sanitizeSvgForBitmap(
      '<svg xmlns="http://www.w3.org/2000/svg" height="15.5" viewBox="0 0 300 15.5"/>'
    );
    expect(attr(rootTagOf(control), "width")).toEqual(["300"]);
  });

  it("emits a duplicate attribute when only one of width/height is authored", () => {
    // The guard is "width missing OR height missing", but the injection writes
    // both. A root with width and no height comes back with width twice, which
    // is not well-formed XML and fails the decode outright.
    const out = sanitizeSvgForBitmap(
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" viewBox="0 0 300 15.5"/>'
    );
    expect(attr(rootTagOf(out), "width")).toHaveLength(2);
    expect(
      new DOMParser()
        .parseFromString(out, "image/svg+xml")
        .querySelector("parsererror")
    ).not.toBeNull();
  });
});

describe("shipped corpus vs. the sanitizer's edges", () => {
  it("reaches none of those edges today", () => {
    const commaViewBox: string[] = [];
    const strokeWidthOnly: string[] = [];
    const asymmetricDimensions: string[] = [];

    for (const svg of CORPUS) {
      if (!svg.rootTag) continue;
      if (svg.viewBox && svg.viewBox.includes(",")) commaViewBox.push(svg.file);

      const hasWidth = svg.rootWidth !== null;
      const hasHeight = svg.rootHeight !== null;
      if (hasWidth !== hasHeight) asymmetricDimensions.push(svg.file);
      if (!hasWidth && /\bstroke-width\s*=/.test(svg.rootTag)) {
        strokeWidthOnly.push(svg.file);
      }
    }

    expect({ commaViewBox, strokeWidthOnly, asymmetricDimensions }).toEqual({
      commaViewBox: [],
      strokeWidthOnly: [],
      asymmetricDimensions: [],
    });
  });

  it("comes out of the sanitizer with intrinsic dimensions and still well-formed", () => {
    const bad: string[] = [];
    for (const svg of CORPUS) {
      const out = sanitizeSvgForBitmap(svg.text);
      const tag = rootTagOf(out);
      const widths = attr(tag, "width");
      const heights = attr(tag, "height");

      if (widths.length !== 1 || heights.length !== 1) {
        bad.push(
          `${svg.file}: width×${widths.length} height×${heights.length}`
        );
        continue;
      }
      if (
        new DOMParser()
          .parseFromString(out, "image/svg+xml")
          .querySelector("parsererror")
      ) {
        bad.push(`${svg.file}: sanitized output is not well-formed`);
      }
    }
    expect(bad).toEqual([]);
  });
});
