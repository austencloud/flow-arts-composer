/**
 * Asset-path resolution coverage (Opus batch 2026-09-12 read-only audit).
 *
 * The renderers build asset URLs from motion and prop data. When a resolver
 * emits a path that has no file behind it the fetch 404s, the loader rejects,
 * and the pictograph simply renders without that arrow or prop. No console
 * error reaches the user. These checks walk the resolvers' real output domain
 * and compare it against the files actually on disk.
 *
 * Read-only: nothing here edits an asset or a runtime module. Failures are
 * written up in docs/reports/opus-batch-2026-09-12/svg-asset-contract-audit.md.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { resolveFullArrowAssetPath } from "@tka/render-core";
import { HALF_ASSET_TURNS } from "$lib/shared/pictograph/arrow/rendering/services/half-asset-manifest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { REPO_ROOT } from "./svg-corpus";

const exists = (assetPath: string) =>
  fs.existsSync(path.join(REPO_ROOT, "static", assetPath.replace(/^\//, "")));

/** Every orientation the asset resolver can be handed. */
const ORIENTATIONS = [
  "in",
  "out",
  "clock",
  "counter",
  "clockIn",
  "clockOut",
  "counterIn",
  "counterOut",
  "centerN",
  "centerNE",
  "centerE",
  "centerSE",
  "centerS",
  "centerSW",
  "centerW",
  "centerNW",
] as const;

const FULL_MOTION_TYPES = ["pro", "anti", "static", "dash"] as const;
const TURNS = [0, 0.25, 0.5, 1, 1.5, 2, 2.5, 3] as const;

type Combo = {
  motionType: (typeof FULL_MOTION_TYPES)[number];
  startOrientation: (typeof ORIENTATIONS)[number];
  turns: (typeof TURNS)[number];
  skewSteps?: number;
  skewDirection?: "+" | "-";
};

function resolvedPaths(combos: Combo[]): Map<string, Combo[]> {
  const byPath = new Map<string, Combo[]>();
  for (const combo of combos) {
    const resolved = `/${resolveFullArrowAssetPath(combo as never)}`;
    const bucket = byPath.get(resolved) ?? [];
    bucket.push(combo);
    byPath.set(resolved, bucket);
  }
  return byPath;
}

function describeCombo(combo: Combo): string {
  const skew = combo.skewDirection ? ` skew${combo.skewDirection}` : "";
  return `${combo.motionType}/${combo.startOrientation}/${combo.turns}${skew}`;
}

const PLAIN_COMBOS: Combo[] = FULL_MOTION_TYPES.flatMap((motionType) =>
  ORIENTATIONS.flatMap((startOrientation) =>
    TURNS.map((turns) => ({ motionType, startOrientation, turns }))
  )
);

/** Skew art is authored only for pro and anti, and the resolver ignores it at 0.25. */
const SKEW_COMBOS: Combo[] = (["pro", "anti"] as const).flatMap((motionType) =>
  ORIENTATIONS.flatMap((startOrientation) =>
    TURNS.filter((turns) => turns !== 0.25).flatMap((turns) =>
      (["+", "-"] as const).map((skewDirection) => ({
        motionType,
        startOrientation,
        turns,
        skewSteps: 1,
        skewDirection,
      }))
    )
  )
);

describe("full-motion arrow asset resolution", () => {
  const plain = resolvedPaths(PLAIN_COMBOS);

  it("covers the whole resolver output domain", () => {
    expect(plain.size).toBeGreaterThan(80);
  });

  it("resolves every non-skew combination to a file on disk", () => {
    const missing = [...plain]
      .filter(([assetPath]) => !exists(assetPath))
      .map(
        ([assetPath, combos]) =>
          `${assetPath} <- ${combos.length} combos, e.g. ${describeCombo(combos[0]!)}`
      );
    expect(missing).toEqual([]);
  });

  it("records the four skew arrow files that exist today", () => {
    // Zero-turn skew is the only skew art that was ever drawn, and only four of
    // the eight motion-type × orientation-family × direction slots were filled.
    // This inventory flips red the moment the art set changes in either
    // direction, which is when the resolver expectations below need revisiting.
    const skewFiles = fs
      .readdirSync(path.join(REPO_ROOT, "static/images/arrows"), {
        recursive: true,
        encoding: "utf8",
      })
      .filter((entry) => entry.includes("_skew"))
      .map((entry) => entry.split(path.sep).join("/"))
      .sort();

    expect(skewFiles).toEqual([
      "anti/from_nonradial/anti_0.0_skew+.svg",
      "anti/from_radial/anti_0.0_skew-.svg",
      "pro/from_radial/pro_0.0_skew+.svg",
      "pro/from_radial/pro_0.0_skew-.svg",
    ]);
  });

  it.fails(
    "resolves every zero-turn skew combination to a file on disk",
    () => {
      // KNOWN DEFECT (audit finding F2). A skewed zero-turn pro or anti resolves
      // to art that was never drawn for four of the eight slots, e.g.
      // pro/clock/0 skew+ asks for
      // static/images/arrows/pro/from_nonradial/pro_0.0_skew+.svg.
      // The loader rejects on the 404 and the arrow is dropped from the
      // pictograph without a user-visible error. Delete the `.fails` when the
      // art lands or the resolver learns to fall back.
      const zeroTurn = SKEW_COMBOS.filter((combo) => combo.turns === 0);
      const missing = [...resolvedPaths(zeroTurn)]
        .filter(([assetPath]) => !exists(assetPath))
        .map(([assetPath]) => assetPath);
      expect(missing).toEqual([]);
    }
  );

  it("names exactly the four zero-turn skew slots with no art", () => {
    const zeroTurn = SKEW_COMBOS.filter((combo) => combo.turns === 0);
    const missing = [...resolvedPaths(zeroTurn)]
      .filter(([assetPath]) => !exists(assetPath))
      .map(([assetPath]) => assetPath)
      .sort();
    expect(missing).toEqual([
      "/images/arrows/anti/from_nonradial/anti_0.0_skew-.svg",
      "/images/arrows/anti/from_radial/anti_0.0_skew+.svg",
      "/images/arrows/pro/from_nonradial/pro_0.0_skew+.svg",
      "/images/arrows/pro/from_nonradial/pro_0.0_skew-.svg",
    ]);
  });

  it.fails("resolves every turning skew combination to a file on disk", () => {
    // KNOWN DEFECT (audit finding F2, wider half). Every skew variant above
    // zero turns resolves to a file that does not exist. Reachable only if a
    // skewed motion can carry turns; no shipped sequence data does today, so
    // this is recorded as latent rather than live.
    const turning = SKEW_COMBOS.filter((combo) => combo.turns !== 0);
    const missing = [...resolvedPaths(turning)]
      .filter(([assetPath]) => !exists(assetPath))
      .map(([assetPath]) => assetPath);
    expect(missing).toEqual([]);
  });

  it("routes float motions to the one shipped float glyph", () => {
    expect(resolveFullArrowAssetPath({ motionType: "float" } as never)).toBe(
      "images/arrows/float.svg"
    );
    expect(
      resolveFullArrowAssetPath({ motionType: "pro", turns: "fl" } as never)
    ).toBe("images/arrows/float.svg");
    expect(exists("/images/arrows/float.svg")).toBe(true);
  });
});

describe("halved-motion arrow asset resolution", () => {
  it("backs every manifest entry with a file on disk", () => {
    const missing: string[] = [];
    for (const [motionType, turnsSet] of Object.entries(HALF_ASSET_TURNS)) {
      for (const turns of turnsSet) {
        const suffix =
          turns === "fl" ? "_fl" : `_${(turns as number).toFixed(1)}`;
        const assetPath = `/images/arrows/${motionType}_half/from_radial/${motionType}_half${suffix}.svg`;
        if (!exists(assetPath)) missing.push(assetPath);
      }
    }
    expect(missing).toEqual([]);
  });

  it("backs the bare fallback glyph for every half motion type", () => {
    // halfArrowPath() drops the turns suffix for anything the manifest does not
    // cover, so the bare file is the last stop for those motions.
    const missing = Object.keys(HALF_ASSET_TURNS)
      .map(
        (motionType) =>
          `/images/arrows/${motionType}_half/from_radial/${motionType}_half.svg`
      )
      .filter((assetPath) => !exists(assetPath));
    expect(missing).toEqual([]);
  });
});

describe("prop artwork resolution", () => {
  const propTypes = Object.values(PropType);

  /** Mirrors isAnimatedOnlyProp() in animation-engine/services/svg-generator.ts. */
  const animatedOnly = (propType: string) =>
    propType === "torch" ||
    propType === "bigtorch" ||
    propType === "triquetra2" ||
    propType.startsWith("sword-");

  it("enumerates the shipped prop types", () => {
    expect(propTypes.length).toBeGreaterThan(30);
  });

  it("gives every prop type the pictograph artwork the loader fetches", () => {
    // PropSvgLoader builds `/images/props/pictograph/{propType}.svg` for every
    // non-fan prop on the default (pictograph) path.
    const missing = propTypes
      .map((propType) => `/images/props/pictograph/${propType}.svg`)
      .filter((assetPath) => !exists(assetPath));
    expect(missing).toEqual([]);
  });

  it("gives every animated-only prop its animated artwork", () => {
    // resolvePropSvgPath() sends exactly this set to /images/props/animated/.
    const missing = propTypes
      .filter(animatedOnly)
      .map((propType) => `/images/props/animated/${propType}.svg`)
      .filter((assetPath) => !exists(assetPath));
    expect(missing).toEqual([]);
  });

  it.fails(
    "gives every prop type the animated artwork its consumers request",
    () => {
      // KNOWN DEFECT (audit finding F3). PropPlane2D.svelte and the qr-video
      // worker-asset-loader build `/images/props/animated/{propType}.svg` from an
      // arbitrary prop type, and PropSvgLoader does the same under
      // useGridVersion. Two prop types have no file in that directory:
      // capsule_baton and fire_double_staff. Both fetches reject.
      const missing = propTypes
        .map((propType) => `/images/props/animated/${propType}.svg`)
        .filter((assetPath) => !exists(assetPath));
      expect(missing).toEqual([]);
    }
  );

  it("names exactly the two animated-artwork gaps that exist today", () => {
    const missing = propTypes
      .map((propType) => `/images/props/animated/${propType}.svg`)
      .filter((assetPath) => !exists(assetPath))
      .sort();
    expect(missing).toEqual([
      "/images/props/animated/capsule_baton.svg",
      "/images/props/animated/fire_double_staff.svg",
    ]);
  });
});
