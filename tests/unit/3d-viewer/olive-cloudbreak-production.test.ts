import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultCelestialConfig } from "../../../src/lib/shared/3d/environments/domain/models/scene-configs/celestial-scene-config";
import {
  CLOUDBREAK_LAYOUT,
  CLOUDBREAK_SKY_SUN,
} from "../../../src/lib/shared/3d/environments/scenes/celestial/cloudbreak-layout";

const sceneSource = readFileSync(
  resolve("src/lib/shared/3d/environments/scenes/CelestialScene.svelte"),
  "utf8"
);
const sunSource = readFileSync(
  resolve(
    "src/lib/shared/3d/environments/scenes/celestial/CelestialSun.svelte"
  ),
  "utf8"
);
const sliceSource = readFileSync(
  resolve(
    "src/lib/shared/3d/environments/scenes/celestial/OliveCloudbreakSlice.svelte"
  ),
  "utf8"
);
const spatialSource = readFileSync(
  resolve(
    "src/lib/shared/3d/environments/scenes/celestial/CloudbreakSpatialStudy.svelte"
  ),
  "utf8"
);

function normalized([x, y, z]: [number, number, number]): [
  number,
  number,
  number,
] {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

describe("Olive Cloudbreak production contract", () => {
  it("makes the approved Cloudbreak slice the sole celestial geometry owner", () => {
    expect(sceneSource).toContain("<OliveCloudbreakSlice");
    expect(sliceSource).toContain(
      "/models/celestial/olive-cloudbreak-production-slice.glb"
    );
    expect(sliceSource).toContain("<ReflectivePool");
    expect(sliceSource).toContain("<CloudbreakAsset");
    expect(sliceSource).toContain("<CloudbreakWaterfall");
    expect(sceneSource).not.toContain("CelestialSanctuaries");
    expect(sceneSource).not.toContain("celestial-environment.glb");
  });

  it("keeps one angular sky sun aligned with the lighting configuration", () => {
    // The contract is alignment, not a magic triple: the runtime sun light
    // has to sit where the authored layout puts it. `e6b55c9f79` (sky citadel)
    // repointed `cloudbreak-layout.ts` at `scripts/celestial-citadel-layout.json`
    // and moved the sun from the Dawn Observatory's [-12, 30, -115] to
    // [-70, 85, 10], leaving the old literal here stale. Assert the alignment
    // AND pin the authored value, so a silent layout drift still trips this.
    expect(createDefaultCelestialConfig().sunLight?.position).toEqual(
      CLOUDBREAK_LAYOUT.sun.lightPosition
    );
    expect(CLOUDBREAK_LAYOUT.sun.lightPosition).toEqual([-70, 85, 10]);
    expect(CLOUDBREAK_SKY_SUN.direction).toEqual(
      normalized(CLOUDBREAK_LAYOUT.sun.position)
    );
    expect(sceneSource).toContain("<CelestialSun");
    expect(sceneSource).toContain("direction={CLOUDBREAK_SKY_SUN.direction}");
    expect(sunSource).toContain("activeCamera.position");
    expect(sunSource).toContain("angularDiameterDegrees");
    expect(sunSource).not.toContain("position = [0, 14, -115]");
    expect(sceneSource).not.toContain("<T.PointLight");
  });

  it("keeps the approved landmass fixed when the shared performer stage expands", () => {
    expect(sceneSource).toContain("<OliveCloudbreakSlice");
    expect(sceneSource).not.toMatch(
      /<OliveCloudbreakSlice[\s\S]*?stageZOffset/
    );
    expect(sliceSource).not.toContain("position.z={stageZOffset}");
  });

  it("anchors the authored terrace to the avatar feet plane", () => {
    expect(sliceSource).toContain(
      'import { userProportionsState } from "@austencloud/scene-3d"'
    );
    expect(sliceSource).toContain("groundY = userProportionsState.groundY");
    expect(sliceSource).toContain("position.y={groundY}");

    // `ba5f762e3d` moved the terrace's ground plane out of these literals and
    // into the authored layout, so the study now reads centerXZ instead of
    // repeating [0, -1]. Assert both halves: the study defers to the constant,
    // and the constant still resolves to the anchored spot. Checking only the
    // expression would let the layout drift the terrace off the feet plane
    // without a single test noticing.
    expect(spatialSource).toContain(
      "terraceCenter = CLOUDBREAK_LAYOUT.performanceTerrace.centerXZ"
    );
    expect(spatialSource).toContain(
      "position={[terraceCenter[0], 0.225, terraceCenter[1]]}"
    );
    expect(spatialSource).toContain(
      "position={[terraceCenter[0], 0.11, terraceCenter[1]]}"
    );
    expect(CLOUDBREAK_LAYOUT.performanceTerrace.centerXZ).toEqual([0, -1]);
  });
});
