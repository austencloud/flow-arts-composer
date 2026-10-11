import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EMBER_ATMOSPHERE_LOOK_IDS,
  getEmberAtmosphereLook,
} from "#lib/shared/3d/environments/domain/models/scene-configs/ember-atmosphere-looks.js";

const world = JSON.parse(
  readFileSync(
    resolve(
      "src/lib/shared/3d/environments/domain/models/scene-configs/ember-volcanic-world-r7.json"
    ),
    "utf8"
  )
) as {
  terrain: {
    runtimeXRange: [number, number];
    runtimeZRange: [number, number];
  };
};

/** Camera positions the Ember audit frames the scene from. */
const AUDIT_CAMERAS: Array<[number, number, number]> = [
  [-25, 25, 60],
  [-25, 35, 175],
  [0, 25, -55],
  [-18, 10, -95],
  [0, 80, 220],
  [170, 60, 10],
  [0, 80, -220],
  [-170, 60, 10],
  [-150, 110, -160],
  [0, 2, 0],
  [2, 1.6, 2],
  [0, 3.4, -9.8],
  [0, 4, 12],
];

/** Rec.709 luminance of an sRGB hex, in linear light. */
function luminance(hex: string): number {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const channel = (shift: number): number => {
    const srgb = ((value >> shift) & 0xff) / 255;
    return srgb <= 0.04045
      ? srgb / 12.92
      : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/** three.js `FogExp2`: `1 - exp(-(distance * density)^2)`. */
function fogFactor(density: number, distance: number): number {
  return 1 - Math.exp(-Math.pow(distance * density, 2));
}

describe("ember haze dome stays behind the world", () => {
  it("clears the furthest terrain any audit camera can frame", () => {
    // The dome is depth-tested, so its radius is a hard boundary: terrain nearer
    // hides it, terrain further away is painted over additively. Any radius
    // inside the world cuts a shell through the ridgelines — near hills fall to
    // fog, the ones just past the shell jump to sky — which is exactly the
    // pasted-on backdrop the upcountry frames showed. Scene fog owns distance;
    // the dome is only ever sky.
    const [minX, maxX] = world.terrain.runtimeXRange;
    const [minZ, maxZ] = world.terrain.runtimeZRange;
    const worldReach = Math.hypot(
      Math.max(Math.abs(minX), Math.abs(maxX)),
      Math.max(Math.abs(minZ), Math.abs(maxZ))
    );
    const cameraReach = Math.max(
      ...AUDIT_CAMERAS.map(([x, y, z]) => Math.hypot(x, y, z))
    );

    for (const id of EMBER_ATMOSPHERE_LOOK_IDS) {
      expect(
        getEmberAtmosphereLook(id).volcanicHaze.radius,
        id
      ).toBeGreaterThan(worldReach + cameraReach);
    }
  });
});

describe("ember aerial perspective", () => {
  it.each(EMBER_ATMOSPHERE_LOOK_IDS)(
    "%s converges distance on atmosphere rather than on black",
    (id) => {
      const look = getEmberAtmosphereLook(id);
      const fog = luminance(look.fog.color);

      // Below the sky's mid stop, distance darkens as it recedes — which is what
      // flattened every far ridge and the basalt tower into a cutout.
      expect(fog).toBeGreaterThan(luminance(look.sky.midColor!));
      // Above the lit horizon stop, the ridgeline stops reading against the sky.
      expect(fog).toBeLessThan(luminance(look.sky.bottomColor!));
    }
  );

  it.each(EMBER_ATMOSPHERE_LOOK_IDS)(
    "%s keeps the performer crisp and still washes the upcountry",
    (id) => {
      const { density } = getEmberAtmosphereLook(id).fog;
      expect(fogFactor(density, 25)).toBeLessThan(0.06);
      expect(fogFactor(density, 140)).toBeGreaterThan(0.18);
    }
  );
});

describe("ember horizon glow reaches every bearing", () => {
  it.each(EMBER_ATMOSPHERE_LOOK_IDS)(
    "%s lights the sky opposite the vent",
    (id) => {
      const haze = getEmberAtmosphereLook(id).volcanicHaze;
      const wrap = haze.underglowWrap ?? 0;
      const strength = haze.underglowStrength ?? 0;

      expect(haze.underglowFocus ?? 0).toBeGreaterThan(0);
      // Without a floor reaching the far bearings, the sky over the terminus
      // received nothing at all and read as a void.
      expect(wrap).toBeGreaterThan(0);
      // The vent still has to be a readable direction, so far bearings get a
      // floor rather than a match.
      expect(wrap).toBeLessThan(1);
      expect(wrap * strength).toBeGreaterThan(0.06);
    }
  );
});

describe("ember distant fill", () => {
  it.each(EMBER_ATMOSPHERE_LOOK_IDS)(
    "%s rakes vertical rock without lifting the plain",
    (id) => {
      // The rest of the rig rakes from the caldera side or sits nearly
      // overhead, so everything facing the terminus stayed unlit and every form
      // over there collapsed to a silhouette.
      const terminusFills = getEmberAtmosphereLook(id).rig.directionals.filter(
        (light) => {
          const [x, y, z] = light.position;
          return z < 0 && y / Math.hypot(x, y, z) < 0.2;
        }
      );

      expect(terminusFills).toHaveLength(1);
      const [fill] = terminusFills;
      // Level ground receives intensity * sin(elevation), so a light this low
      // lands on vertical rock and barely touches the plain. Let it reach key
      // strength and it washes out the darkness the rig is built on.
      expect(fill!.intensity).toBeLessThan(0.6);
    }
  );
});
