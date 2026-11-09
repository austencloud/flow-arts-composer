import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BackgroundType } from "@austencloud/backgrounds";
import {
  CANONICAL_PERFORMER_ANCHOR_Y,
  getStageCoordinateFrame,
} from "../domain/stage-coordinate-frame";
import {
  EnvironmentManifestError,
  foldEnvironmentProgress,
  parseEnvironmentManifest,
} from "./environment-manifest";
import {
  buildEnvironmentRegistry,
  ENVIRONMENTS,
  getEnvironmentFrame,
  getRegisteredEnvironment,
  isBackgroundType,
} from "./environment-registry";
import { hasEnvironmentRuntime } from "./environment-runtimes";

const repoRoot = process.cwd();

const minimal = {
  id: "demo",
  label: "Demo",
  glbUrl: "/models/demo/demo.glb",
  license: "CC0",
  source: "https://example.com/demo",
};

describe("scene.json licence gate", () => {
  // Every manifest in static/models/ is parsed when the registry module loads,
  // so this suite failing is the same failure a build or dev boot would hit.
  it("registers at least the ocean and one scene the enum does not know", () => {
    expect(Object.keys(ENVIRONMENTS)).toContain("ocean");
    expect(Object.keys(ENVIRONMENTS).some((id) => !isBackgroundType(id))).toBe(
      true
    );
  });

  it("ships only CC0, attributed CC-BY, or first-party scenes with a real build script", () => {
    for (const def of Object.values(ENVIRONMENTS)) {
      expect(["CC0", "CC-BY-3.0", "CC-BY-4.0", "first-party"]).toContain(
        def.license
      );
      if (def.license.startsWith("CC-BY")) {
        expect(def.attribution, def.id).toBeTruthy();
      }
      if (def.license === "first-party") {
        expect(
          existsSync(path.join(repoRoot, def.source)),
          `${def.id}: build script ${def.source} is missing`
        ).toBe(true);
      }
    }
  });

  it("points every scene at a GLB that exists and a runtime that exists", () => {
    for (const def of Object.values(ENVIRONMENTS)) {
      expect(
        existsSync(path.join(repoRoot, "static", def.glbUrl)),
        `${def.id}: ${def.glbUrl} is not under static/`
      ).toBe(true);
      if (def.runtime !== null) {
        expect(hasEnvironmentRuntime(def.runtime), def.id).toBe(true);
      }
    }
  });

  it.each([
    ["an unlisted licence", { license: "CC-BY-NC-4.0" }],
    ["a proprietary licence", { license: "proprietary" }],
    ["CC-BY without attribution", { license: "CC-BY-4.0" }],
    [
      "CC-BY without a source link",
      { license: "CC-BY-4.0", attribution: "By someone", source: "pack" },
    ],
    [
      "first-party without a build script",
      { license: "first-party", source: "made it myself" },
    ],
  ])("refuses %s", (_label, override) => {
    expect(() =>
      parseEnvironmentManifest({ ...minimal, ...override }, "demo/scene.json")
    ).toThrow(EnvironmentManifestError);
  });

  it("accepts attributed CC-BY", () => {
    const def = parseEnvironmentManifest(
      { ...minimal, license: "CC-BY-4.0", attribution: "Model by A. Artist" },
      "demo/scene.json"
    );
    expect(def.license).toBe("CC-BY-4.0");
  });

  it("refuses a manifest whose id does not match its folder, or a duplicate", () => {
    expect(() =>
      buildEnvironmentRegistry({ "/static/models/other/scene.json": minimal })
    ).toThrow(/folder name "other"/);
    expect(() =>
      buildEnvironmentRegistry({
        "/static/models/demo/scene.json": minimal,
        "/static/models/x/../demo/scene.json": minimal,
      })
    ).toThrow(/duplicate/);
  });

  it("refuses a GLB path outside /models", () => {
    expect(() =>
      parseEnvironmentManifest(
        { ...minimal, glbUrl: "https://cdn.example.com/a.glb" },
        "demo/scene.json"
      )
    ).toThrow(/glbUrl/);
  });
});

describe("Ocean through the registry", () => {
  const ocean = getRegisteredEnvironment(BackgroundType.OCEAN)!;

  // The values OceanScene hard-coded before it read its manifest.
  it("resolves to the scenery, decoders and curtain slot OceanScene used", () => {
    expect(ocean).toMatchObject({
      id: "ocean",
      glbUrl: "/models/ocean/ocean-environment.glb",
      compression: { geometry: "meshopt", texture: "ktx2" },
      requiresAsyncLoad: true,
      featureKey: "environment",
      glbProgressWeight: 0.4,
      offset: [0, 0, 0],
      runtime: "ocean",
    });
  });

  it("leaves fog, sky and lighting to the ocean's own appearance owner", () => {
    expect(ocean.fog).toBeNull();
    expect(ocean.background).toBeNull();
    expect(ocean.environmentMap).toBeNull();
  });

  it("keeps the ocean's authored stage frame", () => {
    for (const stage of [true, false]) {
      expect(getEnvironmentFrame(BackgroundType.OCEAN, stage)).toEqual(
        getStageCoordinateFrame(BackgroundType.OCEAN, stage)
      );
    }
  });

  it("folds seabed and flora into the curtain exactly as before", () => {
    const legacy = (
      seabed: boolean,
      floraFraction: number,
      floraRequired: boolean,
      floraLoaded: boolean
    ) => ({
      fraction: (seabed ? 1 : 0) * 0.4 + floraFraction * 0.6,
      ready: seabed && (!floraRequired || floraLoaded),
    });
    for (const seabed of [false, true]) {
      for (const floraFraction of [0, 0.25, 0.5, 1]) {
        for (const floraRequired of [false, true]) {
          for (const floraLoaded of [false, true]) {
            expect(
              foldEnvironmentProgress(ocean, seabed, {
                fraction: floraFraction,
                ready: !floraRequired || floraLoaded,
              })
            ).toEqual(
              legacy(seabed, floraFraction, floraRequired, floraLoaded)
            );
          }
        }
      }
    }
  });
});

describe("a scene the external enum does not know", () => {
  const trench = getRegisteredEnvironment("water-traverse")!;

  it("is registered from its scene.json alone and uses the shared loader", () => {
    expect(trench).not.toBeNull();
    expect(isBackgroundType(trench.id)).toBe(false);
    expect(trench.runtime).toBeNull();
    expect(trench.glbUrl).toBe("/models/water-traverse/trench-floor.glb");
  });

  it("moves the scenery so its floor meets the performer anchor", () => {
    expect(getEnvironmentFrame("water-traverse", true).environmentYOffset).toBe(
      CANONICAL_PERFORMER_ANCHOR_Y + 18
    );
  });

  it("reports a single-GLB scene ready once the GLB lands", () => {
    expect(foldEnvironmentProgress(trench, false, null)).toEqual({
      fraction: 0,
      ready: false,
    });
    expect(foldEnvironmentProgress(trench, true, null)).toEqual({
      fraction: 1,
      ready: true,
    });
  });

  it("does not hijack an unknown key", () => {
    expect(getRegisteredEnvironment("not-a-scene")).toBeNull();
    expect(getRegisteredEnvironment("constructor")).toBeNull();
  });
});

describe("scene.json material options", () => {
  const parse = (materials: unknown) =>
    parseEnvironmentManifest(
      { ...minimal, environmentMap: "room", materials },
      "demo/scene.json"
    );

  it("leaves a scene without the field exactly as exported", () => {
    expect(
      parseEnvironmentManifest(minimal, "demo/scene.json").materials
    ).toBeNull();
    expect(parse({})).toMatchObject({ materials: null });
  });

  it("reads vertex colours, a linear tint and an image-light strength", () => {
    expect(
      parse({
        vertexColors: true,
        tint: [0.2, 0.25, 0.26],
        envMapIntensity: 0.16,
      }).materials
    ).toEqual({
      vertexColors: true,
      tint: [0.2, 0.25, 0.26],
      envMapIntensity: 0.16,
    });
  });

  it.each([
    ["a non-object", "bright"],
    ["a misspelt key", { vertexColours: true }],
    ["a string flag", { vertexColors: "yes" }],
    ["a two-channel tint", { tint: [0.2, 0.2] }],
    ["a negative tint", { tint: [0.2, -0.1, 0.2] }],
    ["a negative image-light strength", { envMapIntensity: -1 }],
  ])("refuses %s", (_label, materials) => {
    expect(() => parse(materials)).toThrow(/materials/);
  });

  it("refuses an image-light strength with no environment map to scale", () => {
    expect(() =>
      parseEnvironmentManifest(
        { ...minimal, materials: { envMapIntensity: 0.16 } },
        "demo/scene.json"
      )
    ).toThrow(/environmentMap/);
  });

  it("gives the trench floor TrenchFloor's vertex colours and exposure correction", () => {
    expect(getRegisteredEnvironment("water-traverse")!.materials).toEqual({
      vertexColors: true,
      tint: [0.2, 0.25, 0.26],
      envMapIntensity: 0.16,
    });
    expect(getRegisteredEnvironment("ocean")!.materials).toBeNull();
  });
});
