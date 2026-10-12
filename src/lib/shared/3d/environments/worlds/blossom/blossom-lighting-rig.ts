import {
  AmbientLight,
  DirectionalLight,
  Group,
  HemisphereLight,
  PointLight,
} from "three";

import type { BlossomSceneConfig } from "../../domain/models/scene-configs";
import type { BlossomRuntimeConfig } from "../../scenes/cherry-blossom/blossom-runtime";
import plan from "../../scenes/cherry-blossom/blossom-plan.json";

export interface BlossomLightingRig {
  object: Group;
  setGroundY(groundY: number): void;
  setStageZOffset(stageZOffset: number): void;
  dispose(): void;
}

/** Exact moon, horizon, hemisphere, and lantern rig from BlossomScene. */
export function createBlossomLightingRig(
  config: BlossomSceneConfig,
  runtime: BlossomRuntimeConfig,
  groundY: number,
  stageZOffset: number
): BlossomLightingRig {
  const root = new Group();
  root.name = "blossom-lighting";
  const moon = config.moonLight?.enabled ? config.moonLight : null;
  const keyPosition = moon?.position ?? [-22, 30, -34];

  const key = new DirectionalLight(
    moon?.color ?? "#d9ddff",
    runtime.lights.key
  );
  key.name = "blossom-moon-key";
  key.castShadow = runtime.effects.shadows;
  key.shadow.mapSize.set(
    runtime.effects.shadowMapSize,
    runtime.effects.shadowMapSize
  );
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 110;
  key.shadow.camera.left = -22;
  key.shadow.camera.right = 22;
  key.shadow.camera.top = 22;
  key.shadow.camera.bottom = -22;
  key.shadow.bias = -0.00065;
  key.shadow.normalBias = 0.04;
  key.shadow.radius = 3;
  key.shadow.intensity = 0.56;
  root.add(key);

  const warmFill = new DirectionalLight("#ffbb9b", 1.1);
  warmFill.name = "blossom-warm-fill";
  root.add(warmFill);
  const coolFill = new DirectionalLight("#a6c5e4", 0.2);
  coolFill.name = "blossom-cool-fill";
  root.add(coolFill);
  const hemisphere = new HemisphereLight(
    config.hemisphereLight.skyColor,
    config.hemisphereLight.groundColor,
    runtime.lights.hemisphere
  );
  hemisphere.name = "blossom-hemisphere-light";
  root.add(hemisphere);
  const ambient = new AmbientLight("#748da3", 0.08);
  ambient.name = "blossom-ambient-light";
  root.add(ambient);

  const practicals = [0, 1, 5].map((index) => {
    const [x, depth, height] = plan.lanterns[index]!;
    const hero = plan.trees[0]!.root;
    return {
      color: index === 5 ? "#ffe1cf" : "#ffbd83",
      intensity: index === 5 ? 12 : 55,
      decay: index === 5 ? 1 : 2,
      distance: index === 5 ? 24 : 13,
      x: index === 5 ? -hero[0]! : -x!,
      y: index === 5 ? hero[2]! + 6.5 : height!,
      z: index === 5 ? hero[1]! - 2 : depth!,
    };
  });
  const practicalLights = practicals
    .slice(0, runtime.effects.lanternLights)
    .map((definition, index) => {
      const light = new PointLight(
        definition.color,
        definition.intensity,
        definition.distance,
        definition.decay
      );
      light.name = `blossom-lantern-light-${index}`;
      root.add(light);
      return { light, definition };
    });

  let currentGroundY = groundY;
  let currentStageZOffset = stageZOffset;
  function setGroundY(nextGroundY: number): void {
    currentGroundY = nextGroundY;
    key.position.set(
      keyPosition[0],
      keyPosition[1] + nextGroundY,
      keyPosition[2] + currentStageZOffset
    );
    warmFill.position.set(18, 8 + nextGroundY, 22 + currentStageZOffset);
    coolFill.position.set(-12, 6 + nextGroundY, 18 + currentStageZOffset);
    for (const { light, definition } of practicalLights) {
      light.position.set(
        definition.x,
        nextGroundY + definition.y,
        definition.z + currentStageZOffset
      );
    }
  }
  setGroundY(groundY);

  return {
    object: root,
    setGroundY,
    setStageZOffset(nextStageZOffset) {
      currentStageZOffset = nextStageZOffset;
      setGroundY(currentGroundY);
    },
    dispose() {
      key.shadow.map?.dispose();
      root.clear();
    },
  };
}
