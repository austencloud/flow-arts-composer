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
// CelestialScene loads the shared world and runs its lifecycle. These modules
// build the geometry, sun, and landmass that the runtime contracts check.
const worldSource = readFileSync(
  resolve(
    "src/lib/shared/3d/environments/worlds/celestial/celestial-environment-world.ts"
  ),
  "utf8"
);
const cloudbreakWorldSource = readFileSync(
  resolve(
    "src/lib/shared/3d/environments/worlds/celestial/celestial-cloudbreak-world.ts"
  ),
  "utf8"
);
const atmosphereSource = readFileSync(
  resolve(
    "src/lib/shared/3d/environments/worlds/celestial/celestial-atmosphere.ts"
  ),
  "utf8"
);
// Only the review page at /test/celestial-asset-catalog renders these. The
// live scene stopped using them when it moved to the shared world.
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

describe("Celestial runtime Cloudbreak contract", () => {
  it("makes the shared Cloudbreak world the sole celestial geometry owner", () => {
    expect(worldSource).toContain(
      "root.add(atmosphere.object, cloudbreak.object, lighting)"
    );
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
    expect(atmosphereSource).toContain("object.add(sun.group)");
    expect(atmosphereSource).toContain(
      "new Vector3(...CLOUDBREAK_SKY_SUN.direction)"
    );
    expect(sceneSource).not.toContain("<T.PointLight");
  });

  it("keeps the approved landmass fixed when the shared performer stage expands", () => {
    expect(cloudbreakWorldSource).toContain(
      "object.add(prepareShell(assets.shell, options))"
    );
    expect(worldSource).not.toContain("stageZOffset");
    expect(cloudbreakWorldSource).not.toContain("stageZOffset");
  });
});

describe("Olive Cloudbreak review slice contract", () => {
  it("assembles the olive slice from its GLB, pool, assets, and waterfalls", () => {
    expect(sliceSource).toContain(
      "/models/celestial/olive-cloudbreak-production-slice.glb"
    );
    expect(sliceSource).toContain("<ReflectivePool");
    expect(sliceSource).toContain("<CloudbreakAsset");
    expect(sliceSource).toContain("<CloudbreakWaterfall");
  });

  it("keeps the review sun angular and camera-relative", () => {
    expect(sunSource).toContain("activeCamera.position");
    expect(sunSource).toContain("angularDiameterDegrees");
    expect(sunSource).not.toContain("position = [0, 14, -115]");
  });

  it("keeps the slice fixed when the shared performer stage expands", () => {
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
