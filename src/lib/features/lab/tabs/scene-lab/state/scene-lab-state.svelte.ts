import {
  createDefaultAutumnConfig,
  normalizeAutumnConfig,
  type AutumnSceneConfig,
} from "#lib/shared/3d/environments/domain/models/scene-configs/autumn-scene-config.js";
import {
  createDefaultBlossomConfig,
  type BlossomSceneConfig,
} from "#lib/shared/3d/environments/domain/models/scene-configs/blossom-scene-config.js";
import {
  createDefaultCelestialConfig,
  type CelestialSceneConfig,
} from "#lib/shared/3d/environments/domain/models/scene-configs/celestial-scene-config.js";
import {
  createDefaultCosmicAuroraConfig,
  createDefaultCosmicNightConfig,
  type CosmicSceneConfig,
} from "#lib/shared/3d/environments/domain/models/scene-configs/cosmic-scene-config.js";
import {
  createDefaultEmberConfig,
  type EmberSceneConfig,
} from "#lib/shared/3d/environments/domain/models/scene-configs/ember-scene-config.js";
import {
  createDefaultForestFireflyConfig,
  type ForestSceneConfig,
} from "#lib/shared/3d/environments/domain/models/scene-configs/forest-scene-config.js";
import {
  createDefaultOceanReefConfig,
  type OceanSceneConfig,
} from "#lib/shared/3d/environments/domain/models/scene-configs/ocean-scene-config.js";
import {
  createDefaultRainbowConfig,
  type RainbowSceneConfig,
} from "#lib/shared/3d/environments/domain/models/scene-configs/rainbow-scene-config.js";
import {
  createDefaultVoidConfig,
  type VoidSceneConfig,
} from "#lib/shared/3d/environments/domain/models/scene-configs/void-scene-config.js";
import {
  createDefaultWinterConfig,
  type WinterSceneConfig,
} from "#lib/shared/3d/environments/domain/models/scene-configs/winter-scene-config.js";
import type { SceneId } from "../domain/scene-lab-types";
import type { CosmicVariant } from "../services/scene-lab-persistence";
import { loadSceneLabState } from "../services/scene-lab-persistence";
import { getSceneUndoManager } from "#lib/shared/3d/undo/get-scene-undo-manager.js";

export function createSceneLabState() {
  const persisted = loadSceneLabState();

  let sceneId = $state<SceneId>(persisted?.sceneId ?? "winter");
  let cosmicVariant = $state<CosmicVariant>(
    persisted?.cosmicVariant ?? "night"
  );

  const winterDefaults = createDefaultWinterConfig();
  let winterConfig = $state<WinterSceneConfig>({
    ...winterDefaults,
    ...persisted?.configs.winter,
    forestDetail:
      persisted?.configs.winter?.forestDetail ?? winterDefaults.forestDetail,
    cabin: {
      ...winterDefaults.cabin,
      ...persisted?.configs.winter?.cabin,
      smoke: {
        ...winterDefaults.cabin.smoke,
        ...persisted?.configs.winter?.cabin?.smoke,
        area: {
          ...winterDefaults.cabin.smoke.area,
          ...persisted?.configs.winter?.cabin?.smoke?.area,
        },
      },
      windowLight: {
        ...winterDefaults.cabin.windowLight,
        ...persisted?.configs.winter?.cabin?.windowLight,
      },
    },
  });
  let forestConfig = $state<ForestSceneConfig>(
    persisted?.configs.forest ?? createDefaultForestFireflyConfig()
  );
  let autumnConfig = $state<AutumnSceneConfig>(
    normalizeAutumnConfig(persisted?.configs.autumn)
  );
  let cosmicNightConfig = $state<CosmicSceneConfig>(
    persisted?.configs.cosmicNight ?? createDefaultCosmicNightConfig()
  );
  let cosmicAuroraConfig = $state<CosmicSceneConfig>(
    persisted?.configs.cosmicAurora ?? createDefaultCosmicAuroraConfig()
  );
  const oceanDefaults = createDefaultOceanReefConfig();
  const persistedOcean = persisted?.configs.ocean;
  let oceanConfig = $state<OceanSceneConfig>(
    persistedOcean && "zones" in persistedOcean
      ? {
          ...oceanDefaults,
          ...persistedOcean,
          fish: {
            ...oceanDefaults.fish,
            ...(persistedOcean as OceanSceneConfig).fish,
          },
        }
      : oceanDefaults
  );
  let emberConfig = $state<EmberSceneConfig>(
    persisted?.configs.ember ?? createDefaultEmberConfig()
  );
  let blossomConfig = $state<BlossomSceneConfig>(
    persisted?.configs.blossom ?? createDefaultBlossomConfig()
  );
  let celestialConfig = $state<CelestialSceneConfig>(
    persisted?.configs.celestial ?? createDefaultCelestialConfig()
  );
  let rainbowConfig = $state<RainbowSceneConfig>(
    persisted?.configs.rainbow ?? createDefaultRainbowConfig()
  );
  let voidConfig = $state<VoidSceneConfig>(
    persisted?.configs.void ?? createDefaultVoidConfig()
  );

  $effect(() => {
    const serialized = JSON.stringify({
      version: 3,
      sceneId,
      cosmicVariant,
      configs: {
        winter: winterConfig,
        forest: forestConfig,
        autumn: autumnConfig,
        cosmicNight: cosmicNightConfig,
        cosmicAurora: cosmicAuroraConfig,
        ocean: oceanConfig,
        ember: emberConfig,
        blossom: blossomConfig,
        celestial: celestialConfig,
        rainbow: rainbowConfig,
        void: voidConfig,
      },
    });
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("scene-lab-state", serialized);
      } catch (error) {
        console.warn("Failed to persist scene lab state:", error);
      }
    }, 500);
    return () => clearTimeout(timer);
  });

  const sceneUndo = getSceneUndoManager();

  function captureAllConfigs(): Record<string, unknown> {
    return structuredClone({
      winter: $state.snapshot(winterConfig),
      forest: $state.snapshot(forestConfig),
      autumn: $state.snapshot(autumnConfig),
      cosmicNight: $state.snapshot(cosmicNightConfig),
      cosmicAurora: $state.snapshot(cosmicAuroraConfig),
      ocean: $state.snapshot(oceanConfig),
      ember: $state.snapshot(emberConfig),
      blossom: $state.snapshot(blossomConfig),
      celestial: $state.snapshot(celestialConfig),
      rainbow: $state.snapshot(rainbowConfig),
      void: $state.snapshot(voidConfig),
    });
  }

  function restoreAllConfigs(configs: Record<string, unknown>): void {
    if (configs.winter) winterConfig = configs.winter as WinterSceneConfig;
    if (configs.forest) forestConfig = configs.forest as ForestSceneConfig;
    if (configs.autumn) autumnConfig = normalizeAutumnConfig(configs.autumn);
    if (configs.cosmicNight)
      cosmicNightConfig = configs.cosmicNight as CosmicSceneConfig;
    if (configs.cosmicAurora)
      cosmicAuroraConfig = configs.cosmicAurora as CosmicSceneConfig;
    if (configs.ocean) oceanConfig = configs.ocean as OceanSceneConfig;
    if (configs.ember) emberConfig = configs.ember as EmberSceneConfig;
    if (configs.blossom) blossomConfig = configs.blossom as BlossomSceneConfig;
    if (configs.celestial)
      celestialConfig = configs.celestial as CelestialSceneConfig;
    if (configs.rainbow) rainbowConfig = configs.rainbow as RainbowSceneConfig;
    if (configs.void) voidConfig = configs.void as VoidSceneConfig;
  }

  sceneUndo.registerDomain("sceneLab", {
    capture: () => ({
      sceneId,
      cosmicVariant,
      configs: captureAllConfigs(),
    }),
    restore: (snapshot) => {
      sceneId = snapshot.sceneId;
      cosmicVariant = snapshot.cosmicVariant;
      restoreAllConfigs(snapshot.configs);
    },
  });

  function resetCurrent() {
    switch (sceneId) {
      case "winter":
        winterConfig = createDefaultWinterConfig();
        break;
      case "forest":
        forestConfig = createDefaultForestFireflyConfig();
        break;
      case "autumn":
        autumnConfig = createDefaultAutumnConfig();
        break;
      case "cosmic":
        if (cosmicVariant === "night")
          cosmicNightConfig = createDefaultCosmicNightConfig();
        else cosmicAuroraConfig = createDefaultCosmicAuroraConfig();
        break;
      case "ocean":
        oceanConfig = createDefaultOceanReefConfig();
        break;
      case "ember":
        emberConfig = createDefaultEmberConfig();
        break;
      case "blossom":
        blossomConfig = createDefaultBlossomConfig();
        break;
      case "celestial":
        celestialConfig = createDefaultCelestialConfig();
        break;
      case "rainbow":
        rainbowConfig = createDefaultRainbowConfig();
        break;
      case "void":
        voidConfig = createDefaultVoidConfig();
        break;
    }
  }

  function currentConfigSnapshot(): unknown {
    switch (sceneId) {
      case "winter":
        return $state.snapshot(winterConfig);
      case "forest":
        return $state.snapshot(forestConfig);
      case "autumn":
        return $state.snapshot(autumnConfig);
      case "cosmic":
        return $state.snapshot(
          cosmicVariant === "night" ? cosmicNightConfig : cosmicAuroraConfig
        );
      case "ocean":
        return $state.snapshot(oceanConfig);
      case "ember":
        return $state.snapshot(emberConfig);
      case "blossom":
        return $state.snapshot(blossomConfig);
      case "celestial":
        return $state.snapshot(celestialConfig);
      case "rainbow":
        return $state.snapshot(rainbowConfig);
      case "void":
        return $state.snapshot(voidConfig);
      default:
        return {};
    }
  }

  function currentDefaultFnName(): string {
    switch (sceneId) {
      case "winter":
        return "createDefaultWinterConfig";
      case "forest":
        return "createDefaultForestFireflyConfig";
      case "autumn":
        return "createDefaultAutumnConfig";
      case "cosmic":
        return cosmicVariant === "night"
          ? "createDefaultCosmicNightConfig"
          : "createDefaultCosmicAuroraConfig";
      case "ocean":
        return "createDefaultOceanReefConfig";
      case "ember":
        return "createDefaultEmberConfig";
      case "blossom":
        return "createDefaultBlossomConfig";
      case "celestial":
        return "createDefaultCelestialConfig";
      case "rainbow":
        return "createDefaultRainbowConfig";
      case "void":
        return "createDefaultVoidConfig";
      default:
        return "createDefaultWinterConfig";
    }
  }

  function currentConfigTypeName(): string {
    switch (sceneId) {
      case "winter":
        return "WinterSceneConfig";
      case "forest":
        return "ForestSceneConfig";
      case "autumn":
        return "AutumnSceneConfig";
      case "cosmic":
        return "CosmicSceneConfig";
      case "ocean":
        return "OceanSceneConfig";
      case "ember":
        return "EmberSceneConfig";
      case "blossom":
        return "BlossomSceneConfig";
      case "celestial":
        return "CelestialSceneConfig";
      case "rainbow":
        return "RainbowSceneConfig";
      case "void":
        return "VoidSceneConfig";
      default:
        return "unknown";
    }
  }

  async function copyCurrentToClipboard(): Promise<void> {
    const snapshot = currentConfigSnapshot();
    const tsCode = `export function ${currentDefaultFnName()}(): ${currentConfigTypeName()} {\n  return ${JSON.stringify(snapshot, null, 2)};\n}\n`;
    await navigator.clipboard.writeText(tsCode);
  }

  return {
    get sceneId() {
      return sceneId;
    },
    setSceneId(id: SceneId) {
      sceneUndo.captureState("change-scene-lab-scene", `Scene: ${id}`);
      sceneId = id;
      sceneUndo.commitState();
    },
    get cosmicVariant() {
      return cosmicVariant;
    },
    setCosmicVariant(v: CosmicVariant) {
      sceneUndo.captureState("change-cosmic-variant", `Cosmic: ${v}`);
      cosmicVariant = v;
      sceneUndo.commitState();
    },
    get winterConfig() {
      return winterConfig;
    },
    get forestConfig() {
      return forestConfig;
    },
    get autumnConfig() {
      return autumnConfig;
    },
    get cosmicNightConfig() {
      return cosmicNightConfig;
    },
    get cosmicAuroraConfig() {
      return cosmicAuroraConfig;
    },
    get oceanConfig() {
      return oceanConfig;
    },
    get emberConfig() {
      return emberConfig;
    },
    get blossomConfig() {
      return blossomConfig;
    },
    get celestialConfig() {
      return celestialConfig;
    },
    get rainbowConfig() {
      return rainbowConfig;
    },
    get voidConfig() {
      return voidConfig;
    },
    resetCurrent,
    copyCurrentToClipboard,
  };
}

export type SceneLabState = ReturnType<typeof createSceneLabState>;
