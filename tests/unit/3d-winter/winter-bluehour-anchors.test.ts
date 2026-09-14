import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultWinterConfig } from "$lib/shared/3d/environments/domain/models/scene-configs/winter-scene-config";
import { WINTER_ENVIRONMENT_URL } from "$lib/shared/3d/environments/worlds/winter/winter-environment-world";

/**
 * Winter's production venue is the Blue Hour Lodge, which replaced Moonlit
 * Winter Hollow on 2026-09-05 (`66d9541160`, and see
 * `static/models/winter/README.md`). The runtime fire, chimney plume, tarn and
 * ice court are not free-floating numbers: they are measured off
 * `blender/winter/blue-hour-lodge.blend` and recorded, in runtime coordinates,
 * in the shipped asset's manifest.
 *
 * `winter-settlement-layout.test.ts` used to guard these against the retired
 * Keeper's Hollow settlement JSON. Those files still describe the old venue and
 * its authoring artifacts, so they stayed put; this suite owns the live scene.
 */
interface BlueHourManifest {
  source: string;
  courtRadius: number;
  courtHeight: number;
  runtimePond: { x: number; z: number; y: number };
  /** `[x, groundOffset, z]` in runtime coordinates. */
  chimney: [number, number, number];
  /** `[x, groundOffset, z]` in runtime coordinates. */
  hearth: [number, number, number];
}

const manifest = JSON.parse(
  readFileSync(
    resolve("static/models/winter/blue-hour-lodge-manifest.json"),
    "utf8"
  )
) as BlueHourManifest;

describe("Blue Hour Lodge runtime anchors", () => {
  it("boots the venue the manifest describes", () => {
    expect(manifest.source).toBe("blender/winter/blue-hour-lodge.blend");
    expect(WINTER_ENVIRONMENT_URL).toBe("/models/winter/blue-hour-lodge.glb");
  });

  it("keeps the runtime fire on the authored hearth", () => {
    const config = createDefaultWinterConfig();
    const [hearthX, hearthGroundOffset, hearthZ] = manifest.hearth;

    expect(config.campfire?.position).toEqual({ x: hearthX, z: hearthZ });
    // The flame starts inside the bronze bowl, not on the snow.
    expect(config.campfire?.groundOffset).toBe(hearthGroundOffset);
  });

  it("keeps the chimney plume on the authored copper flue", () => {
    const config = createDefaultWinterConfig();
    const [chimneyX, chimneyHeight, chimneyZ] = manifest.chimney;

    expect(config.cabin.enabled).toBe(true);
    expect(config.cabin.smoke.enabled).toBe(true);
    expect(config.cabin.smoke.position).toEqual({ x: chimneyX, z: chimneyZ });
    expect(config.cabin.smoke.heightOffset).toBe(chimneyHeight);
  });

  it("keeps the tarn and the ice court on their measured footprints", () => {
    const config = createDefaultWinterConfig();

    expect(config.pond?.position).toEqual({
      x: manifest.runtimePond.x,
      z: manifest.runtimePond.z,
    });
    expect(config.platform.radius).toBe(manifest.courtRadius);
    expect(config.platform.height).toBe(manifest.courtHeight);
  });
});
