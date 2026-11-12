import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TRIAD_BUILD,
  TRIAD_BUILDS,
  TRIAD_BUILD_OPTIONS,
  applyTriadBuildToScene,
  isBuiltTriadPropType,
  normalizeTriadBuild,
  parseTriadRenderKey,
  renderedTriadBuild,
  resolveTriadRenderKey,
  triadBuildArtwork,
} from "../triad-build";
import {
  basePropTypeOfRenderKey,
  propTileArtwork,
  resolvePropRenderKey,
} from "../prop-look";
import { getPropDimensions } from "#lib/shared/animation-engine/services/IPropTextureLoader.js";
import { resolvePropSvgPath } from "#lib/shared/animation-engine/services/svg-generator.js";
import { getTipPoints } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
import { propTextureMatchesRequest } from "#lib/shared/animation-engine/services/canvas2d/prop-texture-match.js";

const STATIC = resolve(__dirname, "../../../../../../../static");
const fileOf = (publicPath: string) =>
  readFileSync(
    resolve(STATIC, publicPath.replace(/^\//, "").split("?")[0]!),
    "utf8"
  );
const viewBoxOf = (publicPath: string) =>
  fileOf(publicPath).match(/viewBox="([^"]+)"/)?.[1];

const BUILT = TRIAD_BUILDS.filter((build) => build !== "pictograph");

describe("triad build", () => {
  it("defaults to Pictograph and rejects garbage", () => {
    expect(DEFAULT_TRIAD_BUILD).toBe("pictograph");
    expect(normalizeTriadBuild(undefined)).toBe("pictograph");
    expect(normalizeTriadBuild("torch")).toBe("pictograph");
    expect(normalizeTriadBuild(2)).toBe("pictograph");
    for (const build of TRIAD_BUILDS) {
      expect(normalizeTriadBuild(build)).toBe(build);
    }
    expect(TRIAD_BUILD_OPTIONS.map((option) => option.id)).toEqual([
      ...TRIAD_BUILDS,
    ]);
  });

  it("only builds triad and big triad", () => {
    expect(isBuiltTriadPropType("triad")).toBe(true);
    expect(isBuiltTriadPropType("BigTriad")).toBe(true);
    for (const other of ["trigeng", "quiad", "staff", "triangle"]) {
      expect(isBuiltTriadPropType(other)).toBe(false);
      expect(resolvePropRenderKey(other, { triadBuild: "fire" })).toBe(other);
    }
  });

  it("keeps Pictograph on the plain render key", () => {
    expect(resolvePropRenderKey("triad", {})).toBe("triad");
    expect(resolvePropRenderKey("triad", { triadBuild: "pictograph" })).toBe(
      "triad"
    );
    expect(resolveTriadRenderKey("bigtriad", "pictograph")).toBe("bigtriad");
    expect(triadBuildArtwork("triad", "pictograph")).toBeNull();
  });

  it("round-trips every build's render key to the notation prop", () => {
    for (const propType of ["triad", "bigtriad"] as const) {
      for (const build of BUILT) {
        const key = resolvePropRenderKey(propType, { triadBuild: build });
        expect(key).toBe(`${propType}__${build}`);
        expect(parseTriadRenderKey(key)).toEqual({ propType, build });
        expect(basePropTypeOfRenderKey(key)).toBe(propType);
        expect(
          propTextureMatchesRequest({
            loaded: key,
            requested: key,
            paramsPropType: propType,
          })
        ).toBe(true);
      }
    }
    expect(parseTriadRenderKey("triad")).toBeNull();
    expect(parseTriadRenderKey("triad__pictograph")).toBeNull();
    expect(parseTriadRenderKey("trigeng__fire")).toBeNull();
    expect(parseTriadRenderKey("buugeng__fire")).toBeNull();
  });

  it("names a render's build only when a triad is drawn built", () => {
    expect(renderedTriadBuild("pictograph", ["triad", "triad"])).toBe(
      undefined
    );
    expect(renderedTriadBuild(undefined, ["triad"])).toBe(undefined);
    expect(renderedTriadBuild("fire", ["staff", "trigeng"])).toBe(undefined);
    expect(renderedTriadBuild("day", ["staff", "bigtriad"])).toBe("day");
  });

  it("draws every build on the plain triad's box, folder and tips", () => {
    for (const build of BUILT) {
      for (const propType of ["triad", "bigtriad"] as const) {
        const key = `${propType}__${build}`;
        const sprite = resolvePropSvgPath(key);
        expect(sprite).toBe(
          `/images/props/pictograph/${propType}-${build}.svg?v=1`
        );
        for (const family of ["pictograph", "animated", "buttons"] as const) {
          const art = triadBuildArtwork(propType, build, family)!;
          expect(viewBoxOf(art)).toBe(
            viewBoxOf(`/images/props/${family}/${propType}.svg`)
          );
          // The arms take the hand colour through the one frame group.
          expect(fileOf(art)).toContain("data-fan-frame");
        }
        expect(getPropDimensions(key)).toEqual(getPropDimensions(propType));
        expect(getTipPoints(key).points).toEqual(
          getTipPoints(propType).points
        );
      }
    }
  });

  it("shows the build on the picker tile", () => {
    expect(
      propTileArtwork(
        "triad",
        "left",
        { triadBuild: "fire" },
        "/images/props/buttons/triad.svg"
      ).href
    ).toBe("/images/props/buttons/triad-fire.svg?v=1");
    expect(
      propTileArtwork("triad", "left", {}, "/images/props/buttons/triad.svg")
        .href
    ).toBe("/images/props/buttons/triad.svg");
  });

  it("points the 3D finish at Fire or Day and leaves it for Pictograph", () => {
    const target = { finish: "fire" as "fire" | "day", set: vi.fn() };
    applyTriadBuildToScene(target, "pictograph");
    applyTriadBuildToScene(target, "fire");
    expect(target.set).not.toHaveBeenCalled();
    applyTriadBuildToScene(target, "day");
    expect(target.set).toHaveBeenCalledWith("day");
  });
});
