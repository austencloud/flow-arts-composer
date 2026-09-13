/**
 * Fragment-reference survival across the shipped prop color transform
 * (Opus batch 2026-09-12 read-only audit).
 *
 * `PropSvgLoader.applyColorToSvg()` calls `applyMotionColorToSvg(..., {
 * makeClassNamesUnique: true })` on every non-fan prop, for both the live DOM
 * and the worker raster. That option rewrites `id="X"` to `id="X-left"` and
 * `url(#X)` to `url(#X-left)` so two props inlined into one pictograph cannot
 * collide. Any reference form it does not rewrite silently loses its target:
 * a `<use>` with no target draws nothing, and a `<clipPath>` whose only child
 * is such a `<use>` clips its subject away completely.
 *
 * These tests call the real exported transform, not a reimplementation, over
 * the real artwork the loader fetches.
 */

import { describe, it, expect } from "vitest";
import { applyMotionColorToSvg } from "$lib/shared/utils/svg-color-utils";
import { SELECTIVE_COLOR_PROP_TYPES } from "@tka/render-core";
import {
  listSvgFiles,
  readSvg,
  stripComments,
  type SvgRecord,
} from "./svg-corpus";

/** The two directories PropSvgLoader fetches from. */
const LOADED_PROP_DIRS = [
  "static/images/props/pictograph/",
  "static/images/props/animated/",
];

const LOADED_PROPS: SvgRecord[] = listSvgFiles("static/images/props")
  .map(readSvg)
  .filter((svg) => LOADED_PROP_DIRS.some((dir) => svg.file.startsWith(dir)));

function propTypeOf(svg: SvgRecord): string {
  return svg.file
    .split("/")
    .pop()!
    .replace(/\.svg$/, "");
}

/** Exactly the call PropSvgLoader makes for a left-hand prop in dark mode. */
function transform(svg: SvgRecord): string {
  const propType = propTypeOf(svg);
  return applyMotionColorToSvg(svg.text, "left" as never, {
    makeClassNamesUnique: true,
    themeMode: "dark",
    selectiveColorMode: (
      SELECTIVE_COLOR_PROP_TYPES as readonly string[]
    ).includes(propType.toLowerCase()),
  });
}

interface RefSet {
  ids: Set<string>;
  urlRefs: string[];
  useRefs: string[];
}

function collectRefs(markup: string): RefSet {
  const body = stripComments(markup);
  return {
    ids: new Set(
      [...body.matchAll(/\bid\s*=\s*["']([^"']*)["']/g)].map((m) => m[1]!)
    ),
    urlRefs: [...body.matchAll(/url\(\s*["']?#([^)"']+)["']?\s*\)/g)].map(
      (m) => m[1]!
    ),
    useRefs: [
      ...body.matchAll(
        /<use\b[^>]*\b(?:xlink:href|href)\s*=\s*["']#([^"']+)["']/g
      ),
    ].map((m) => m[1]!),
  };
}

/** References that resolved in the authored file but not after the transform. */
function newlyBroken(
  before: RefSet,
  after: RefSet,
  kind: "urlRefs" | "useRefs"
): string[] {
  const wasResolvable = new Set(
    before[kind].filter((ref) => before.ids.has(ref))
  );
  return [...new Set(after[kind])].filter(
    (ref) => !after.ids.has(ref) && wasResolvable.has(ref)
  );
}

describe("prop color transform: fragment references", () => {
  it("covers the artwork the prop loader actually fetches", () => {
    expect(LOADED_PROPS.length).toBeGreaterThan(45);
  });

  it("suffixes ids, so a left and a right prop cannot collide in one document", () => {
    // The whole reason makeClassNamesUnique exists. Proven on a file that has
    // ids to rewrite, so the check cannot pass vacuously.
    const torch = LOADED_PROPS.find(
      (svg) => svg.file === "static/images/props/pictograph/torch.svg"
    )!;
    const after = collectRefs(transform(torch));
    expect(after.ids.size).toBeGreaterThan(0);
    for (const id of after.ids) expect(id, torch.file).toMatch(/-left$/);
  });

  it("keeps every url(#...) reference resolvable after the transform", () => {
    const broken: string[] = [];
    for (const svg of LOADED_PROPS) {
      const lost = newlyBroken(
        collectRefs(svg.text),
        collectRefs(transform(svg)),
        "urlRefs"
      );
      if (lost.length) broken.push(`${svg.file}: ${lost.join(", ")}`);
    }
    expect(broken).toEqual([]);
  });

  it.fails("keeps every <use> reference resolvable after the transform", () => {
    // KNOWN DEFECT (audit finding F1). applyColorToSvg() rewrites `id=` and
    // `url(#...)` but not `xlink:href="#..."`, so every `<use>` in the torch
    // family loses its target the moment a prop is colored. The authored
    // black shaft body and the clipped interior detail stop drawing; no error
    // is raised on any surface. Delete the `.fails` when the transform learns
    // to rewrite href fragments (or the artwork stops using `<use>`).
    const broken: string[] = [];
    for (const svg of LOADED_PROPS) {
      const lost = newlyBroken(
        collectRefs(svg.text),
        collectRefs(transform(svg)),
        "useRefs"
      );
      if (lost.length) broken.push(`${svg.file}: ${lost.length}`);
    }
    expect(broken).toEqual([]);
  });

  it("names exactly the four loaded prop files whose <use> targets break", () => {
    const broken: Record<string, number> = {};
    for (const svg of LOADED_PROPS) {
      const lost = newlyBroken(
        collectRefs(svg.text),
        collectRefs(transform(svg)),
        "useRefs"
      );
      if (lost.length) broken[svg.file] = lost.length;
    }
    expect(broken).toEqual({
      "static/images/props/animated/bigtorch.svg": 2,
      "static/images/props/animated/torch.svg": 3,
      "static/images/props/pictograph/bigtorch.svg": 2,
      "static/images/props/pictograph/torch.svg": 3,
    });
  });

  it("breaks every <use> target in those files, not just some", () => {
    // None of the four files has a pre-existing dangling <use>: the authored
    // artwork is internally consistent and the transform is what breaks it.
    for (const file of Object.keys({
      "static/images/props/animated/bigtorch.svg": 0,
      "static/images/props/animated/torch.svg": 0,
      "static/images/props/pictograph/bigtorch.svg": 0,
      "static/images/props/pictograph/torch.svg": 0,
    })) {
      const svg = LOADED_PROPS.find((candidate) => candidate.file === file)!;
      const before = collectRefs(svg.text);
      const after = collectRefs(transform(svg));
      const preDangling = [...new Set(before.useRefs)].filter(
        (ref) => !before.ids.has(ref)
      );
      const postDangling = [...new Set(after.useRefs)].filter(
        (ref) => !after.ids.has(ref)
      );
      expect(preDangling, `${file} authored`).toEqual([]);
      expect(postDangling.length, `${file} transformed`).toBe(
        new Set(after.useRefs).size
      );
    }
  });

  it("leaves every other loaded prop's fragment references intact", () => {
    // Scopes the finding: this is torch artwork, not a corpus-wide problem.
    const affected = LOADED_PROPS.filter((svg) => {
      const before = collectRefs(svg.text);
      const after = collectRefs(transform(svg));
      return (
        newlyBroken(before, after, "useRefs").length > 0 ||
        newlyBroken(before, after, "urlRefs").length > 0
      );
    }).map((svg) => propTypeOf(svg));
    expect([...new Set(affected)].sort()).toEqual(["bigtorch", "torch"]);
  });

  it("empties the clip paths that depend on those <use> children", () => {
    // The consequence that matters: a <clipPath> whose only child is a dangling
    // <use> has no geometry, and SVG clips its subject away entirely.
    const torch = LOADED_PROPS.find(
      (svg) => svg.file === "static/images/props/pictograph/torch.svg"
    )!;
    const after = transform(torch);
    const refs = collectRefs(after);

    const emptied: string[] = [];
    for (const match of after.matchAll(
      /<clipPath\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/clipPath>/g
    )) {
      const [, id, body] = match as unknown as [string, string, string];
      const children = [
        ...body.matchAll(
          /<use\b[^>]*\b(?:xlink:href|href)\s*=\s*["']#([^"']+)["']/g
        ),
      ].map((child) => child[1]!);
      const hasOtherGeometry =
        /<(path|rect|circle|ellipse|polygon|polyline)\b/.test(body);
      if (
        children.length > 0 &&
        !hasOtherGeometry &&
        children.every((child) => !refs.ids.has(child))
      ) {
        emptied.push(id);
      }
    }

    expect(emptied.length).toBe(3);

    // Two of the three are still referenced by a group, and an SVG element
    // whose clip path has no geometry is not drawn at all, so that group's
    // interior shading disappears from the pictograph.
    const stillReferenced = emptied.filter((id) =>
      after.includes(`url(#${id})`)
    );
    expect(stillReferenced.length).toBe(2);
  });
});
